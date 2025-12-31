/**
 * AppSync GraphQL Service
 * Handles all GraphQL operations with AWS AppSync
 */

import { getAWSConfig, GRAPHQL_OPERATIONS } from '../config/aws-config';
import { networkService } from './networkService';
import { loggingService } from './loggingService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, any>;
  }>;
}

class AppSyncService {
  private config = getAWSConfig();
  private authToken: string | null = null;

  // Real-time Subscription Management
  private subscriptions: Map<string, WebSocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds

  constructor() {
    this.loadAuthToken();
    
    // Initialize logging
    loggingService.info('AppSyncService', 'Service initialized', {
      graphqlEndpoint: this.config.graphqlEndpoint,
      region: this.config.region
    });
  }

  private async loadAuthToken(): Promise<void> {
    try {
      this.authToken = await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.warn('⚠️ Could not load auth token:', error);
    }
  }

  // Exponential backoff calculation
  private calculateReconnectDelay(attemptCount: number): number {
    const delay = this.reconnectDelay * Math.pow(2, attemptCount);
    return Math.min(delay, this.maxReconnectDelay);
  }

  // Reset reconnection attempts for successful connections
  private resetReconnectAttempts(subscriptionId: string): void {
    this.reconnectAttempts.delete(subscriptionId);
  }

  // Check if should attempt reconnection
  private shouldAttemptReconnect(subscriptionId: string): boolean {
    const attempts = this.reconnectAttempts.get(subscriptionId) || 0;
    return attempts < this.maxReconnectAttempts;
  }

  // Increment reconnection attempts
  private incrementReconnectAttempts(subscriptionId: string): number {
    const attempts = (this.reconnectAttempts.get(subscriptionId) || 0) + 1;
    this.reconnectAttempts.set(subscriptionId, attempts);
    return attempts;
  }

  // Automatic reconnection with exponential backoff
  private async attemptReconnection(
    subscriptionId: string,
    callback: (data: any) => void,
    subscriptionType: 'vote' | 'match' | 'room'
  ): Promise<() => void> {
    if (!this.shouldAttemptReconnect(subscriptionId)) {
      console.error(`❌ Max reconnection attempts reached for ${subscriptionId}`);
      throw new Error(`Max reconnection attempts reached for ${subscriptionId}`);
    }

    const attemptCount = this.incrementReconnectAttempts(subscriptionId);
    const delay = this.calculateReconnectDelay(attemptCount - 1);

    console.log(`🔄 Attempting reconnection ${attemptCount}/${this.maxReconnectAttempts} for ${subscriptionId} in ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // Attempt to recreate the subscription based on type
      switch (subscriptionType) {
        case 'vote':
          const roomId = subscriptionId.split('-')[2];
          return await this.subscribeToVoteUpdates(roomId, callback);
        case 'match':
          const matchRoomId = subscriptionId.split('-')[2];
          return await this.subscribeToMatchFound(matchRoomId, callback);
        case 'room':
          const updateRoomId = subscriptionId.split('-')[2];
          return await this.subscribeToRoomUpdates(updateRoomId, callback);
        default:
          throw new Error(`Unknown subscription type: ${subscriptionType}`);
      }
    } catch (error) {
      console.error(`❌ Reconnection attempt ${attemptCount} failed for ${subscriptionId}:`, error);
      
      // Try again if we haven't reached max attempts
      if (this.shouldAttemptReconnect(subscriptionId)) {
        return await this.attemptReconnection(subscriptionId, callback, subscriptionType);
      } else {
        throw error;
      }
    }
  }

  private async getHeaders(): Promise<Record<string, string>> {
    // Ensure we have the latest token
    const storedTokens = await AsyncStorage.getItem('cognitoTokens');
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (storedTokens) {
      const tokens = JSON.parse(storedTokens);
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    return headers;
  }

  private async request<T = any>(graphqlRequest: GraphQLRequest): Promise<T> {
    loggingService.logGraphQL('query', {
      operationName: graphqlRequest.operationName,
      hasVariables: !!graphqlRequest.variables
    });
    
    // Use network service for retry logic and connectivity checks
    return await networkService.executeWithRetry(
      async () => {
        const headers = await this.getHeaders();
        
        console.log('🔗 AppSync Request:', {
          endpoint: this.config.graphqlEndpoint,
          operation: graphqlRequest.operationName || 'Unknown',
          variables: graphqlRequest.variables
        });

        const response = await fetch(this.config.graphqlEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(graphqlRequest),
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          
          loggingService.logGraphQL('error', {
            operationName: graphqlRequest.operationName,
            statusCode: response.status,
            statusText: response.statusText
          });
          
          throw error;
        }

        const result: GraphQLResponse<T> = await response.json();

        if (result.errors && result.errors.length > 0) {
          console.error('❌ GraphQL Errors:', result.errors);
          
          loggingService.logGraphQL('error', {
            operationName: graphqlRequest.operationName,
            errors: result.errors.map(err => ({
              message: err.message,
              path: err.path
            }))
          });
          
          throw new Error(result.errors[0].message);
        }

        if (!result.data) {
          const error = new Error('No data returned from GraphQL');
          
          loggingService.logGraphQL('error', {
            operationName: graphqlRequest.operationName,
            error: 'No data returned'
          });
          
          throw error;
        }

        console.log('✅ AppSync Response:', result.data);
        
        loggingService.logGraphQL('query', {
          operationName: graphqlRequest.operationName,
          success: true
        });
        
        return result.data;
      },
      `GraphQL ${graphqlRequest.operationName || 'Operation'}`,
      {
        maxAttempts: 3,
        baseDelay: 1000, // 1 second
        maxDelay: 8000   // 8 seconds
      }
    );
  }

  // Room Operations
  async createRoom(input: {
    name: string;
    filters: {
      genres?: string[];
      releaseYearFrom?: number;
      releaseYearTo?: number;
      minRating?: number;
      contentTypes?: ('movie' | 'tv')[];
    };
  }) {
    try {
      // Try AppSync first
      return await this.request({
        query: GRAPHQL_OPERATIONS.CREATE_ROOM,
        variables: { input },
        operationName: 'CreateRoom'
      });
    } catch (error: any) {
      console.warn('⚠️ AppSync createRoom failed, falling back to REST API:', error.message);
      
      // Fallback to REST API via roomService
      try {
        const { roomService } = await import('./roomService');
        const room = await roomService.createRoom(input.name, input.filters);
        
        // Transform to match AppSync response format
        return {
          createRoom: room
        };
      } catch (restError: any) {
        console.error('❌ REST API fallback also failed:', restError.message);
        throw restError;
      }
    }
  }

  async joinRoom(inviteCode: string) {
    try {
      // Try AppSync first
      return await this.request({
        query: GRAPHQL_OPERATIONS.JOIN_ROOM,
        variables: { inviteCode },
        operationName: 'JoinRoom'
      });
    } catch (error: any) {
      console.warn('⚠️ AppSync joinRoom failed, falling back to REST API:', error.message);
      
      // Fallback to REST API via roomService
      try {
        const { roomService } = await import('./roomService');
        const room = await roomService.joinRoom(inviteCode);
        
        // Transform to match AppSync response format
        return {
          joinRoom: room
        };
      } catch (restError: any) {
        console.error('❌ REST API fallback also failed:', restError.message);
        throw restError;
      }
    }
  }

  async getRoom(roomId: string) {
    return this.request({
      query: GRAPHQL_OPERATIONS.GET_ROOM,
      variables: { roomId },
      operationName: 'GetRoom'
    });
  }

  async getUserRooms() {
    console.log('🔄 AppSync: getUserRooms called - with debugging');
    try {
      // Try AppSync first
      const result = await this.request({
        query: GRAPHQL_OPERATIONS.GET_USER_ROOMS,
        operationName: 'GetUserRooms'
      });
      return result;
    } catch (error: any) {
      console.warn('⚠️ AppSync getUserRooms failed, falling back to REST API:', error.message);
      
      // Fallback to REST API via roomService
      try {
        console.log('🔄 AppSync: Importing roomService for fallback...');
        const { roomService } = await import('./roomService');
        console.log('🌐 AppSync: Calling roomService.getUserRooms()...');
        const rooms = await roomService.getUserRooms();
        console.log('✅ AppSync: REST API fallback successful', rooms);
        
        // Transform to match AppSync response format
        return {
          getUserRooms: rooms
        };
      } catch (restError: any) {
        console.error('❌ REST API fallback also failed:', restError.message);
        console.log('🔍 AppSync: REST error details:', restError);
        
        // Return empty result to prevent app crash
        console.log('🚫 AppSync: Returning empty result to prevent crash');
        return {
          getUserRooms: []
        };
      }
    }
  }

  // Voting Operations
  async vote(roomId: string, movieId: string) {
    return this.request({
      query: GRAPHQL_OPERATIONS.VOTE,
      variables: { roomId, movieId },
      operationName: 'Vote'
    });
  }

  // Movie Operations
  async getMovieDetails(movieId: string) {
    return this.request({
      query: GRAPHQL_OPERATIONS.GET_MOVIE_DETAILS,
      variables: { movieId },
      operationName: 'GetMovieDetails'
    });
  }

  // AI Operations
  async getAIRecommendations(userText: string) {
    return this.request({
      query: GRAPHQL_OPERATIONS.GET_AI_RECOMMENDATIONS,
      variables: { userText },
      operationName: 'GetAIRecommendations'
    });
  }

  createSubscriptionUrl(): string {
    // Use the dedicated realtime endpoint
    return this.config.realtimeEndpoint || this.config.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
  }

  private async createSubscriptionConnection(
    subscriptionId: string,
    callback?: (data: any) => void,
    subscriptionType?: 'vote' | 'match' | 'room'
  ): Promise<WebSocket> {
    loggingService.logRealtime('connect', {
      subscriptionId,
      subscriptionType
    });
    
    const wsUrl = this.createSubscriptionUrl();
    const headers = await this.getHeaders();
    
    // Create WebSocket connection with proper headers for AppSync
    const ws = new WebSocket(wsUrl, 'graphql-ws', {
      headers: {
        ...headers,
        'Sec-WebSocket-Protocol': 'graphql-ws'
      }
    });

    return new Promise((resolve, reject) => {
      let connectionTimeout: NodeJS.Timeout;
      
      // Set connection timeout
      connectionTimeout = setTimeout(() => {
        ws.close();
        
        loggingService.logRealtime('error', {
          subscriptionId,
          error: 'Connection timeout'
        });
        
        reject(new Error(`Connection timeout for ${subscriptionId}`));
      }, 10000); // 10 second timeout

      ws.onopen = () => {
        console.log(`🔗 WebSocket connected for subscription: ${subscriptionId}`);
        
        loggingService.logRealtime('connect', {
          subscriptionId,
          status: 'connected'
        });
        
        // Clear timeout
        clearTimeout(connectionTimeout);
        
        // Send connection init message
        ws.send(JSON.stringify({
          type: 'connection_init',
          payload: {
            Authorization: headers.Authorization
          }
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'connection_ack') {
          console.log(`✅ WebSocket connection acknowledged for: ${subscriptionId}`);
          
          loggingService.logRealtime('connect', {
            subscriptionId,
            status: 'acknowledged'
          });
          
          this.subscriptions.set(subscriptionId, ws);
          this.resetReconnectAttempts(subscriptionId); // Reset on successful connection
          resolve(ws);
        } else if (message.type === 'error') {
          console.error(`❌ WebSocket connection error for ${subscriptionId}:`, message.payload);
          
          loggingService.logRealtime('error', {
            subscriptionId,
            error: message.payload?.message || 'WebSocket connection failed'
          });
          
          clearTimeout(connectionTimeout);
          reject(new Error(message.payload?.message || 'WebSocket connection failed'));
        } else if (message.type === 'ka') {
          // Keep-alive message, ignore
          console.log(`💓 Keep-alive received for ${subscriptionId}`);
          
          loggingService.logRealtime('message', {
            subscriptionId,
            messageType: 'keep-alive'
          });
        }
      };

      ws.onerror = (error) => {
        console.error(`❌ WebSocket error for ${subscriptionId}:`, error);
        
        loggingService.logRealtime('error', {
          subscriptionId,
          error: 'WebSocket error occurred'
        });
        
        clearTimeout(connectionTimeout);
        
        // Attempt reconnection if callback and type are provided
        if (callback && subscriptionType) {
          console.log(`🔄 Attempting automatic reconnection for ${subscriptionId}`);
          
          loggingService.logRealtime('reconnect', {
            subscriptionId,
            reason: 'WebSocket error'
          });
          
          this.attemptReconnection(subscriptionId, callback, subscriptionType)
            .then(newUnsubscribe => {
              console.log(`✅ Reconnection successful for ${subscriptionId}`);
              
              loggingService.logRealtime('reconnect', {
                subscriptionId,
                status: 'successful'
              });
              
              // The new unsubscribe function will be returned by the calling method
            })
            .catch(reconnectError => {
              console.error(`❌ Reconnection failed for ${subscriptionId}:`, reconnectError);
              
              loggingService.logRealtime('error', {
                subscriptionId,
                error: 'Reconnection failed',
                details: reconnectError.message
              });
              
              reject(reconnectError);
            });
        } else {
          reject(error);
        }
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed for subscription: ${subscriptionId}`, event.code, event.reason);
        
        loggingService.logRealtime('disconnect', {
          subscriptionId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        clearTimeout(connectionTimeout);
        this.subscriptions.delete(subscriptionId);
        
        // Attempt reconnection for unexpected closures (not normal closure)
        if (event.code !== 1000 && callback && subscriptionType) {
          console.log(`🔄 Unexpected closure, attempting reconnection for ${subscriptionId}`);
          
          loggingService.logRealtime('reconnect', {
            subscriptionId,
            reason: 'Unexpected closure',
            code: event.code
          });
          
          this.attemptReconnection(subscriptionId, callback, subscriptionType)
            .catch(reconnectError => {
              console.error(`❌ Auto-reconnection failed for ${subscriptionId}:`, reconnectError);
              
              loggingService.logRealtime('error', {
                subscriptionId,
                error: 'Auto-reconnection failed',
                details: reconnectError.message
              });
            });
        }
      };
    });
  }

  async subscribeToVoteUpdates(roomId: string, callback: (data: any) => void): Promise<() => void> {
    const subscriptionId = `vote-updates-${roomId}`;
    console.log(`🔔 Subscribing to vote updates for room ${roomId}`);
    
    try {
      const ws = await this.createSubscriptionConnection(subscriptionId, callback, 'vote');
      
      // Send subscription message
      const subscriptionMessage = {
        id: subscriptionId,
        type: 'start',
        payload: {
          data: JSON.stringify({
            query: GRAPHQL_OPERATIONS.ON_VOTE_UPDATE,
            variables: { roomId }
          })
        }
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      
      // Handle subscription data
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event) => {
        // Call original handler first
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }
        
        const message = JSON.parse(event.data);
        
        if (message.type === 'data' && message.id === subscriptionId) {
          console.log('📊 Vote update received:', message.payload);
          
          if (message.payload?.data?.onVoteUpdate) {
            callback(message.payload.data.onVoteUpdate);
          }
        } else if (message.type === 'error' && message.id === subscriptionId) {
          console.error('❌ Vote subscription error:', message.payload);
          
          // Attempt reconnection on subscription error
          this.attemptReconnection(subscriptionId, callback, 'vote')
            .catch(error => {
              console.error('❌ Failed to reconnect after subscription error:', error);
            });
        } else if (message.type === 'complete' && message.id === subscriptionId) {
          console.log('✅ Vote subscription completed');
        }
      };
      
      // Return unsubscribe function
      return () => {
        console.log(`🔕 Unsubscribing from vote updates for room ${roomId}`);
        
        try {
          // Send stop message
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              id: subscriptionId,
              type: 'stop'
            }));
          }
          
          // Close WebSocket
          ws.close(1000, 'Normal closure'); // Use normal closure code
          this.subscriptions.delete(subscriptionId);
          this.reconnectAttempts.delete(subscriptionId); // Clean up reconnect attempts
        } catch (error) {
          console.warn('⚠️ Error during unsubscribe:', error);
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to create vote updates subscription:', error);
      
      // Fallback to polling if WebSocket fails completely
      console.log('🔄 Falling back to polling for vote updates');
      const pollInterval = setInterval(async () => {
        try {
          // Poll room status for updates
          const roomData = await this.getRoom(roomId);
          if (roomData?.getRoom) {
            callback({
              roomId,
              userId: 'polling-update',
              movieId: roomData.getRoom.resultMovieId || 'unknown',
              voteType: 'POLLING_UPDATE',
              currentVotes: 0,
              totalMembers: 0,
              timestamp: new Date().toISOString()
            });
          }
        } catch (pollError) {
          console.warn('⚠️ Polling error:', pollError);
        }
      }, 5000); // Poll every 5 seconds
      
      return () => {
        clearInterval(pollInterval);
        console.log(`🔕 Stopped polling for room ${roomId}`);
      };
    }
  }

  async subscribeToMatchFound(roomId: string, callback: (data: any) => void): Promise<() => void> {
    const subscriptionId = `match-found-${roomId}`;
    console.log(`🔔 Subscribing to match found events for room ${roomId}`);
    
    try {
      const ws = await this.createSubscriptionConnection(subscriptionId);
      
      // Send subscription message
      const subscriptionMessage = {
        id: subscriptionId,
        type: 'start',
        payload: {
          data: JSON.stringify({
            query: GRAPHQL_OPERATIONS.ON_MATCH_FOUND,
            variables: { roomId }
          })
        }
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      
      // Handle subscription data
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'data' && message.id === subscriptionId) {
          console.log('🎉 Match found received:', message.payload);
          
          if (message.payload?.data?.onMatchFound) {
            callback(message.payload.data.onMatchFound);
          }
        } else if (message.type === 'error' && message.id === subscriptionId) {
          console.error('❌ Match subscription error:', message.payload);
        } else if (message.type === 'complete' && message.id === subscriptionId) {
          console.log('✅ Match subscription completed');
        }
      };
      
      // Return unsubscribe function
      return () => {
        console.log(`🔕 Unsubscribing from match found events for room ${roomId}`);
        
        // Send stop message
        ws.send(JSON.stringify({
          id: subscriptionId,
          type: 'stop'
        }));
        
        // Close WebSocket
        ws.close();
        this.subscriptions.delete(subscriptionId);
      };
      
    } catch (error) {
      console.error('❌ Failed to create match found subscription:', error);
      
      // Fallback: check room status periodically
      const checkInterval = setInterval(async () => {
        try {
          const roomData = await this.getRoom(roomId);
          if (roomData?.getRoom?.status === 'MATCHED' && roomData.getRoom.resultMovieId) {
            callback({
              roomId,
              movieId: roomData.getRoom.resultMovieId,
              movieTitle: 'Matched Movie',
              participants: [],
              timestamp: new Date().toISOString()
            });
            clearInterval(checkInterval); // Stop checking after match found
          }
        } catch (checkError) {
          console.warn('⚠️ Match check error:', checkError);
        }
      }, 3000); // Check every 3 seconds
      
      return () => {
        clearInterval(checkInterval);
        console.log(`🔕 Stopped checking for matches in room ${roomId}`);
      };
    }
  }

  async subscribeToRoomUpdates(roomId: string, callback: (data: any) => void): Promise<() => void> {
    const subscriptionId = `room-updates-${roomId}`;
    console.log(`🔔 Subscribing to room updates for room ${roomId}`);
    
    try {
      const ws = await this.createSubscriptionConnection(subscriptionId);
      
      // Send subscription message
      const subscriptionMessage = {
        id: subscriptionId,
        type: 'start',
        payload: {
          data: JSON.stringify({
            query: GRAPHQL_OPERATIONS.ON_ROOM_UPDATE,
            variables: { roomId }
          })
        }
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      
      // Handle subscription data
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'data' && message.id === subscriptionId) {
          console.log('🏠 Room update received:', message.payload);
          
          if (message.payload?.data?.onRoomUpdate) {
            callback(message.payload.data.onRoomUpdate);
          }
        } else if (message.type === 'error' && message.id === subscriptionId) {
          console.error('❌ Room subscription error:', message.payload);
        } else if (message.type === 'complete' && message.id === subscriptionId) {
          console.log('✅ Room subscription completed');
        }
      };
      
      // Return unsubscribe function
      return () => {
        console.log(`🔕 Unsubscribing from room updates for room ${roomId}`);
        
        // Send stop message
        ws.send(JSON.stringify({
          id: subscriptionId,
          type: 'stop'
        }));
        
        // Close WebSocket
        ws.close();
        this.subscriptions.delete(subscriptionId);
      };
      
    } catch (error) {
      console.error('❌ Failed to create room updates subscription:', error);
      
      // Fallback to periodic room status checks
      const statusInterval = setInterval(async () => {
        try {
          const roomData = await this.getRoom(roomId);
          if (roomData?.getRoom) {
            callback(roomData.getRoom);
          }
        } catch (statusError) {
          console.warn('⚠️ Room status check error:', statusError);
        }
      }, 10000); // Check every 10 seconds
      
      return () => {
        clearInterval(statusInterval);
        console.log(`🔕 Stopped room status checks for room ${roomId}`);
      };
    }
  }

  // Cleanup all subscriptions
  disconnectAllSubscriptions(): void {
    console.log('🧹 Cleaning up all subscriptions');
    
    loggingService.logRealtime('disconnect', {
      action: 'cleanup_all',
      subscriptionCount: this.subscriptions.size
    });
    
    this.subscriptions.forEach((ws, subscriptionId) => {
      console.log(`🔌 Closing subscription: ${subscriptionId}`);
      
      loggingService.logRealtime('disconnect', {
        subscriptionId,
        reason: 'cleanup'
      });
      
      ws.close();
    });
    
    this.subscriptions.clear();
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    loggingService.logNetwork('request', {
      operation: 'health_check',
      endpoint: this.config.graphqlEndpoint
    });
    
    try {
      // Simple query to test connectivity
      await this.request({
        query: `query HealthCheck { __typename }`,
        operationName: 'HealthCheck'
      });
      
      loggingService.logNetwork('response', {
        operation: 'health_check',
        success: true
      });
      
      return true;
    } catch (error) {
      console.error('❌ AppSync Health Check Failed:', error);
      
      loggingService.logNetwork('error', {
        operation: 'health_check',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
}

export const appSyncService = new AppSyncService();
export default appSyncService;