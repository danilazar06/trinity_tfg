/**
 * AWS AppSync GraphQL Service
 * Handles all GraphQL operations with AWS AppSync
 */

import { getAWSConfig } from '../config/aws-config';
import { cognitoAuthService } from './cognitoAuthService';
import { loggingService } from './loggingService';
import { networkService } from './networkService';

interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

class AppSyncService {
  private config = getAWSConfig();
  private graphqlEndpoint: string;

  constructor() {
    this.graphqlEndpoint = this.config.graphqlEndpoint;
    
    loggingService.info('AppSyncService', 'Service initialized', {
      region: this.config.region,
      endpoint: this.graphqlEndpoint
    });
  }

  /**
   * Make authenticated GraphQL request to AppSync
   */
  private async graphqlRequest<T>(request: GraphQLRequest): Promise<T> {
    try {
      // Check network connectivity
      if (!networkService.isConnected()) {
        throw new Error('No network connection available');
      }

      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated');
      }

      loggingService.debug('AppSyncService', 'Making GraphQL request', {
        query: request.query.substring(0, 100) + '...',
        hasVariables: !!request.variables,
        variables: request.variables
      });

      console.log('🔍 AppSyncService.graphqlRequest - Full request:', JSON.stringify(request, null, 2));

      console.log('🚨 AppSyncService.graphqlRequest - About to make fetch request to:', this.graphqlEndpoint);

      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authResult.tokens.idToken}`,
        },
        body: JSON.stringify(request),
      });

      console.log('🚨 AppSyncService.graphqlRequest - Response status:', response.status, response.statusText);

      const result: GraphQLResponse<T> = await response.json();

      console.log('🚨 AppSyncService.graphqlRequest - Response body:', JSON.stringify(result, null, 2));

      if (!response.ok) {
        loggingService.error('AppSyncService', 'GraphQL request failed', {
          status: response.status,
          statusText: response.statusText,
          errors: result.errors
        });
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
      }

      if (result.errors && result.errors.length > 0) {
        loggingService.error('AppSyncService', 'GraphQL errors', { errors: result.errors });
        throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
      }

      loggingService.debug('AppSyncService', 'GraphQL request successful');
      return result.data as T;

    } catch (error: any) {
      loggingService.error('AppSyncService', 'GraphQL request error', { error: error.message });
      throw error;
    }
  }

  /**
   * Health check - simple query to test connectivity
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      // Simple query that should always work
      const query = `
        query HealthCheck {
          __typename
        }
      `;

      await this.graphqlRequest({ query });
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AppSync health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get user's rooms
   */
  async getUserRooms(): Promise<{ getUserRooms: any[] }> {
    const query = `
      query GetUserRooms {
        getUserRooms {
          id
          name
          description
          isActive
          memberCount
          matchCount
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getUserRooms: any[] }>({ query });
      return result;
    } catch (error) {
      console.error('Error getting user rooms:', error);
      // Return empty array as fallback
      return { getUserRooms: [] };
    }
  }

  /**
   * Create a new room with genre preferences and invite URL support
   */
  async createRoom(input: {
    name: string;
    description?: string;
    isPrivate?: boolean;
    maxMembers?: number;
    genrePreferences?: string[];
  }): Promise<{ createRoom: any }> {
    console.log('🔍 AppSyncService.createRoom - Input received:', JSON.stringify(input, null, 2));
    
    const mutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          description
          status
          hostId
          inviteCode
          inviteUrl
          genrePreferences
          isActive
          isPrivate
          memberCount
          maxMembers
          createdAt
          updatedAt
        }
      }
    `;

    console.log('🔍 AppSyncService.createRoom - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoom - Variables:', JSON.stringify({ input }, null, 2));

    try {
      const result = await this.graphqlRequest<{ createRoom: any }>({
        query: mutation,
        variables: { input }
      });

      console.log('🔍 AppSyncService.createRoom - Result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      // Enhanced error handling with user-friendly messages
      loggingService.error('AppSyncService', 'Room creation failed', {
        input,
        error: error.message
      });
      
      throw new Error('Unable to create room. Please check your connection and try again.');
    }
  }

  /**
   * Create a new room (debug version with only name)
   */
  async createRoomDebug(input: {
    name: string;
  }): Promise<{ createRoomDebug: any }> {
    console.log('🔍 AppSyncService.createRoomDebug - Input received:', JSON.stringify(input, null, 2));
    
    const mutation = `
      mutation CreateRoomDebug($input: CreateRoomInputDebug!) {
        createRoomDebug(input: $input) {
          id
          name
          description
          isActive
          isPrivate
          memberCount
          createdAt
        }
      }
    `;

    // Hardcoded request to eliminate any possibility of extra fields
    const hardcodedRequest = {
      query: mutation,
      variables: {
        input: {
          name: input.name
        }
      }
    };

    console.log('🔍 AppSyncService.createRoomDebug - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoomDebug - Hardcoded request:', JSON.stringify(hardcodedRequest, null, 2));

    const result = await this.graphqlRequest<{ createRoomDebug: any }>(hardcodedRequest);

    console.log('🔍 AppSyncService.createRoomDebug - Result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Create a new room (simple version with no input type)
   */
  async createRoomSimple(name: string): Promise<{ createRoomSimple: any }> {
    console.log('🚨🚨🚨 AppSyncService.createRoomSimple - STARTING');
    console.log('🔍 AppSyncService.createRoomSimple - Name received:', name);
    
    const mutation = `
      mutation CreateRoomSimple($name: String!) {
        createRoomSimple(name: $name) {
          id
          name
          description
          isActive
          isPrivate
          memberCount
          inviteCode
          hostId
          status
          createdAt
        }
      }
    `;

    // Hardcoded request with just a String parameter
    const hardcodedRequest = {
      query: mutation,
      variables: {
        name: name
      }
    };

    console.log('🔍 AppSyncService.createRoomSimple - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoomSimple - Hardcoded request:', JSON.stringify(hardcodedRequest, null, 2));

    try {
      const result = await this.graphqlRequest<{ createRoomSimple: any }>(hardcodedRequest);
      console.log('✅ AppSyncService.createRoomSimple - SUCCESS:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('❌ AppSyncService.createRoomSimple - ERROR:', error);
      throw error;
    }
  }

  /**
   * Join a room using invite code with enhanced error handling
   */
  async joinRoomByInvite(inviteCode: string): Promise<{ joinRoomByInvite: any }> {
    const mutation = `
      mutation JoinRoomByInvite($inviteCode: String!) {
        joinRoomByInvite(inviteCode: $inviteCode) {
          id
          name
          description
          status
          hostId
          inviteCode
          inviteUrl
          genrePreferences
          isActive
          isPrivate
          memberCount
          maxMembers
          createdAt
          updatedAt
        }
      }
    `;

    console.log('🚪 AppSyncService.joinRoomByInvite - InviteCode:', inviteCode);

    try {
      const result = await this.graphqlRequest<{ joinRoomByInvite: any }>({
        query: mutation,
        variables: { inviteCode }
      });

      console.log('🚪 AppSyncService.joinRoomByInvite - Result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      // Enhanced error handling with context-aware messages
      loggingService.error('AppSyncService', 'Room join failed', {
        inviteCode,
        error: error.message
      });

      if (error.message.includes('not found') || error.message.includes('invalid')) {
        throw new Error('Invalid invite code. Please check the code and try again.');
      } else if (error.message.includes('full') || error.message.includes('capacity')) {
        throw new Error('This room is full. Please try joining another room.');
      } else {
        throw new Error('Unable to join room. Please check your connection and try again.');
      }
    }
  }

  /**
   * Get room details with enhanced fields
   */
  async getRoom(roomId: string): Promise<{ getRoom: any }> {
    const query = `
      query GetRoom($roomId: ID!) {
        getRoom(roomId: $roomId) {
          id
          name
          description
          status
          resultMovieId
          hostId
          inviteCode
          inviteUrl
          genrePreferences
          isActive
          isPrivate
          memberCount
          maxMembers
          matchCount
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getRoom: any }>({
        query,
        variables: { roomId }
      });

      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'Get room failed', {
        roomId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        throw new Error('Room not found. It may have been deleted or you may not have access.');
      } else {
        throw new Error('Unable to load room details. Please try again.');
      }
    }
  }

  /**
   * Vote on content with enhanced error handling
   */
  async vote(roomId: string, movieId: string): Promise<{ vote: any }> {
    const mutation = `
      mutation Vote($input: VoteInput!) {
        vote(input: $input) {
          id
          name
          description
          status
          resultMovieId
          hostId
          inviteCode
          inviteUrl
          genrePreferences
          isActive
          isPrivate
          memberCount
          maxMembers
          matchCount
          createdAt
          updatedAt
        }
      }
    `;

    const input = {
      roomId,
      movieId,
      voteType: 'LIKE' // Solo procesamos votos LIKE en Stop-on-Match
    };

    console.log('🗳️ AppSyncService.vote - Input:', JSON.stringify(input, null, 2));

    try {
      const result = await this.graphqlRequest<{ vote: any }>({
        query: mutation,
        variables: { input }
      });

      console.log('🗳️ AppSyncService.vote - Result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'Vote failed', {
        roomId,
        movieId,
        error: error.message
      });

      if (error.message.includes('already voted')) {
        throw new Error('You have already voted on this movie.');
      } else if (error.message.includes('room not active')) {
        throw new Error('This room is no longer active for voting.');
      } else {
        throw new Error('Unable to register your vote. Please try again.');
      }
    }
  }

  /**
   * Get movie details
   */
  async getMovieDetails(movieId: string): Promise<{ getMovieDetails: any }> {
    const query = `
      query GetMovieDetails($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          poster
          vote_average
          release_date
          genres {
            id
            name
          }
          runtime
        }
      }
    `;

    const result = await this.graphqlRequest<{ getMovieDetails: any }>({
      query,
      variables: { movieId }
    });

    return result;
  }

  /**
   * Get movies list
   */
  async getMovies(genre?: string): Promise<{ getMovies: any[] }> {
    const query = `
      query GetMovies($genre: String) {
        getMovies(genre: $genre) {
          id
          title
          overview
          poster
          vote_average
          release_date
        }
      }
    `;

    const result = await this.graphqlRequest<{ getMovies: any[] }>({
      query,
      variables: { genre }
    });

    return result;
  }

  /**
   * Get AI recommendations with enhanced response format
   */
  async getAIRecommendations(input: {
    roomId: string;
    preferences?: string[];
    excludeIds?: string[];
  }): Promise<{ getChatRecommendations: any }> {
    const query = `
      query GetChatRecommendations($text: String!) {
        getChatRecommendations(text: $text) {
          chatResponse
          recommendedGenres
          confidence
          reasoning
          genreAlignment
          fallbackUsed
        }
      }
    `;

    // Build context text for AI
    const contextParts = [`Room: ${input.roomId}`];
    if (input.preferences && input.preferences.length > 0) {
      contextParts.push(`Preferences: ${input.preferences.join(', ')}`);
    }
    if (input.excludeIds && input.excludeIds.length > 0) {
      contextParts.push(`Exclude: ${input.excludeIds.join(', ')}`);
    }
    
    const text = `Recommend movies for ${contextParts.join('. ')}`;

    try {
      const result = await this.graphqlRequest<{ getChatRecommendations: any }>({
        query,
        variables: { text }
      });

      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'AI recommendations failed', {
        roomId: input.roomId,
        error: error.message
      });

      // Return fallback response
      return {
        getChatRecommendations: {
          chatResponse: 'I\'m having trouble generating recommendations right now. Try browsing popular movies instead.',
          recommendedGenres: input.preferences || [],
          confidence: 0.0,
          reasoning: 'AI service unavailable, using fallback response',
          genreAlignment: 0.0,
          fallbackUsed: true
        }
      };
    }
  }

  /**
   * Helper method to create WebSocket subscriptions with consistent error handling
   */
  private async createWebSocketSubscription(
    wsUrl: string,
    subscription: string,
    variables: Record<string, any>,
    callback: (data: any) => void,
    subscriptionName: string
  ): Promise<(() => void) | null> {
    try {
      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated for subscription');
      }

      // Setup WebSocket connection with proper headers
      const connectionParams = {
        Authorization: authResult.tokens.idToken,
        'x-api-key': this.config.apiKey || ''
      };

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl, 'graphql-ws');
      let isConnected = false;
      let subscriptionId: string | null = null;

      // Connection init
      ws.onopen = () => {
        console.log(`🔌 WebSocket connected for ${subscriptionName}`);
        
        // Send connection init
        ws.send(JSON.stringify({
          type: 'connection_init',
          payload: connectionParams
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'connection_ack':
            console.log(`✅ WebSocket connection acknowledged for ${subscriptionName}`);
            isConnected = true;
            
            // Start subscription
            subscriptionId = `${subscriptionName}-${Date.now()}`;
            ws.send(JSON.stringify({
              id: subscriptionId,
              type: 'start',
              payload: {
                query: subscription,
                variables
              }
            }));
            break;
            
          case 'data':
            if (message.payload?.data) {
              const eventData = Object.values(message.payload.data)[0]; // Get first subscription result
              console.log(`📊 ${subscriptionName} received via WebSocket:`, eventData);
              callback(eventData);
            }
            break;
            
          case 'error':
            console.error(`❌ WebSocket subscription error for ${subscriptionName}:`, message.payload);
            loggingService.error('AppSyncService', `WebSocket subscription error: ${subscriptionName}`, {
              error: message.payload,
              subscriptionName
            });
            break;
            
          case 'complete':
            console.log(`✅ WebSocket subscription completed for ${subscriptionName}`);
            break;
        }
      };

      ws.onerror = (error) => {
        console.error(`❌ WebSocket error for ${subscriptionName}:`, error);
        loggingService.error('AppSyncService', `WebSocket error: ${subscriptionName}`, {
          error: error.toString(),
          subscriptionName
        });
      };

      ws.onclose = () => {
        console.log(`🔌 WebSocket connection closed for ${subscriptionName}`);
        isConnected = false;
      };

      // Return cleanup function
      const cleanup = () => {
        console.log(`🧹 Cleaning up ${subscriptionName} subscription`);
        
        if (isConnected && subscriptionId) {
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'stop'
          }));
        }
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
      
      return cleanup;
    } catch (error: any) {
      loggingService.error('AppSyncService', `Failed to create WebSocket subscription: ${subscriptionName}`, {
        error: error.message,
        subscriptionName
      });
      throw error;
    }
  }

  /**
   * Subscribe to vote updates
   */
  async subscribeToVoteUpdates(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up enhanced vote updates subscription for room:', roomId);
      
      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated for subscription');
      }

      // Create WebSocket connection to AppSync
      const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
      
      const subscription = `
        subscription OnVoteUpdateEnhanced($roomId: ID!) {
          onVoteUpdateEnhanced(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            progress {
              totalVotes
              likesCount
              dislikesCount
              skipsCount
              remainingUsers
              percentage
              votingUsers
              pendingUsers
              estimatedTimeToCompletion
              currentMovieInfo {
                id
                title
                poster
                overview
                genres
                year
                rating
                runtime
              }
            }
            movieInfo {
              id
              title
              poster
              overview
              genres
              year
              rating
              runtime
            }
            votingDuration
          }
        }
      `;

      return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'enhanced-vote-updates');
    } catch (error) {
      console.error('❌ Failed to setup enhanced vote updates subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to enhanced match found events with participant details
   */
  async subscribeToMatchFoundEnhanced(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up enhanced match found subscription for room:', roomId);
      
      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated for subscription');
      }

      // Create WebSocket connection to AppSync
      const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
      
      const subscription = `
        subscription OnMatchFoundEnhanced($roomId: ID!) {
          onMatchFoundEnhanced(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            matchId
            movieInfo {
              id
              title
              poster
              overview
              genres
              year
              rating
              runtime
            }
            participants {
              userId
              displayName
              isHost
              connectionStatus
              votingStatus
              lastActivity
            }
            votingDuration
            consensusType
          }
        }
      `;

      return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'enhanced-match-found');
    } catch (error) {
      console.error('❌ Failed to setup enhanced match found subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to connection status changes
   */
  async subscribeToConnectionStatusChange(roomId: string, callback: (statusData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up connection status subscription for room:', roomId);
      
      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated for subscription');
      }

      // Create WebSocket connection to AppSync
      const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
      
      const subscription = `
        subscription OnConnectionStatusChange($roomId: ID!) {
          onConnectionStatusChange(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            userId
            connectionStatus
            reconnectionAttempts
            lastSeenAt
            userAgent
          }
        }
      `;

      return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'connection-status');
    } catch (error) {
      console.error('❌ Failed to setup connection status subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to room state synchronization events
   */
  async subscribeToRoomStateSync(roomId: string, callback: (stateData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up room state sync subscription for room:', roomId);
      
      // Get authentication tokens
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated || !authResult.tokens) {
        throw new Error('User not authenticated for subscription');
      }

      // Create WebSocket connection to AppSync
      const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
      
      const subscription = `
        subscription OnRoomStateSync($roomId: ID!) {
          onRoomStateSync(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            roomState {
              currentMovieId
              currentMovieInfo {
                id
                title
                poster
                overview
                genres
                year
                rating
                runtime
              }
              progress {
                totalVotes
                likesCount
                dislikesCount
                skipsCount
                remainingUsers
                percentage
                votingUsers
                pendingUsers
                estimatedTimeToCompletion
              }
              participants {
                userId
                displayName
                isHost
                connectionStatus
                votingStatus
                lastActivity
              }
              roomStatus
              matchFound
            }
            syncReason
          }
        }
      `;

      return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'room-state-sync');
    } catch (error) {
      console.error('❌ Failed to setup room state sync subscription:', error);
      return null;
    }
  }
  /**
   * Subscribe to vote updates
   */
  async subscribeToVoteUpdates(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnVoteUpdate($roomId: ID!) {
        onVoteUpdate(roomId: $roomId) {
          roomId
          userId
          movieId
          voteType
          currentVotes
          totalMembers
          votingUsers
          pendingUsers
          estimatedTimeToCompletion
          movieInfo {
            title
            genres
            year
            posterPath
          }
          timestamp
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'vote-updates');
  }

  /**
   * Subscribe to match found events
   */
  async subscribeToMatchFound(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnMatchFound($roomId: ID!) {
        onMatchFound(roomId: $roomId) {
          roomId
          movieId
          movieTitle
          participants {
            userId
            displayName
            connectionStatus
            role
          }
          votingDuration
          matchDetails {
            movieGenres
            movieYear
            movieRating
            posterPath
          }
          timestamp
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'match-found');
  }

  /**
   * Subscribe to room updates
   */
  async subscribeToRoomUpdates(roomId: string, callback: (roomUpdate: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnRoomUpdate($roomId: ID!) {
        onRoomUpdate(roomId: $roomId) {
          roomId
          status
          memberCount
          activeConnections
          currentMovieId
          resultMovieId
          lastSyncAt
          updatedAt
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'room-updates');
  }

  /**
   * Subscribe to enhanced vote updates with detailed progress information
   */
  async subscribeToVoteUpdatesEnhanced(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnVoteUpdateEnhanced($roomId: ID!) {
        onVoteUpdateEnhanced(roomId: $roomId) {
          id
          timestamp
          roomId
          eventType
          progress {
            totalVotes
            likesCount
            dislikesCount
            skipsCount
            remainingUsers
            percentage
            votingUsers
            pendingUsers
            estimatedTimeToCompletion
            currentMovieInfo {
              id
              title
              poster
              overview
              genres
              year
              rating
              runtime
            }
          }
          movieInfo {
            id
            title
            poster
            overview
            genres
            year
            rating
            runtime
          }
          votingDuration
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'enhanced-vote-updates');
  }

  /**
   * Subscribe to enhanced match found events with participant details
   */
  async subscribeToMatchFoundEnhanced(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnMatchFoundEnhanced($roomId: ID!) {
        onMatchFoundEnhanced(roomId: $roomId) {
          id
          timestamp
          roomId
          eventType
          matchId
          movieInfo {
            id
            title
            poster
            overview
            genres
            year
            rating
            runtime
          }
          participants {
            userId
            displayName
            isHost
            connectionStatus
            votingStatus
            lastActivity
          }
          votingDuration
          consensusType
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'enhanced-match-found');
  }

  /**
   * Subscribe to connection status changes
   */
  async subscribeToConnectionStatusChange(roomId: string, callback: (statusData: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnConnectionStatusChange($roomId: ID!) {
        onConnectionStatusChange(roomId: $roomId) {
          id
          timestamp
          roomId
          eventType
          userId
          connectionStatus
          reconnectionAttempts
          lastSeenAt
          userAgent
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'connection-status');
  }

  /**
   * Subscribe to room state synchronization events
   */
  async subscribeToRoomStateSync(roomId: string, callback: (stateData: any) => void): Promise<(() => void) | null> {
    const subscription = `
      subscription OnRoomStateSync($roomId: ID!) {
        onRoomStateSync(roomId: $roomId) {
          id
          timestamp
          roomId
          eventType
          roomState {
            currentMovieId
            currentMovieInfo {
              id
              title
              poster
              overview
              genres
              year
              rating
              runtime
            }
            progress {
              totalVotes
              likesCount
              dislikesCount
              skipsCount
              remainingUsers
              percentage
              votingUsers
              pendingUsers
              estimatedTimeToCompletion
            }
            participants {
              userId
              displayName
              isHost
              connectionStatus
              votingStatus
              lastActivity
            }
            roomStatus
            matchFound
          }
          syncReason
        }
      }
    `;

    const wsUrl = this.graphqlEndpoint.replace('https://', 'wss://').replace('/graphql', '/realtime');
    return this.createWebSocketSubscription(wsUrl, subscription, { roomId }, callback, 'room-state-sync');
  }
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 5;
  private reconnectionDelay = 1000; // Start with 1 second
  private connectionStatusCallbacks: ((status: string) => void)[] = [];

  /**
   * Subscribe to connection status changes
   */
  subscribeToConnectionStatus(callback: (status: 'disconnected' | 'connecting' | 'connected') => void): () => void {
    this.connectionStatusCallbacks.push(callback);
    
    // Immediately call with current status
    callback(this.connectionStatus);
    
    // Return cleanup function
    return () => {
      const index = this.connectionStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionStatusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update connection status and notify subscribers
   */
  private updateConnectionStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      console.log(`🔄 Connection status changed to: ${status}`);
      
      // Notify all subscribers
      this.connectionStatusCallbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.error('Error in connection status callback:', error);
        }
      });
    }
  }

  /**
   * Connection status monitoring and automatic reconnection
   */
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 5;
  private reconnectionDelay = 1000; // Start with 1 second
  private connectionStatusCallbacks: ((status: string) => void)[] = [];

  /**
   * Enhanced subscription with automatic reconnection
   */
  async subscribeWithReconnection(
    roomId: string,
    subscriptionType: 'votes' | 'matches' | 'room' | 'enhanced-votes' | 'enhanced-matches' | 'connection-status' | 'room-state',
    callback: (data: any) => void
  ): Promise<(() => void) | null> {
    let cleanup: (() => void) | null = null;
    let reconnectionTimer: NodeJS.Timeout | null = null;
    let isActive = true;

    const attemptConnection = async (): Promise<void> => {
      if (!isActive) return;

      try {
        this.updateConnectionStatus('connecting');
        
        // Choose appropriate subscription method
        switch (subscriptionType) {
          case 'votes':
            cleanup = await this.subscribeToVoteUpdates(roomId, callback);
            break;
          case 'matches':
            cleanup = await this.subscribeToMatchFound(roomId, callback);
            break;
          case 'room':
            cleanup = await this.subscribeToRoomUpdates(roomId, callback);
            break;
          case 'enhanced-votes':
            cleanup = await this.subscribeToVoteUpdatesEnhanced(roomId, callback);
            break;
          case 'enhanced-matches':
            cleanup = await this.subscribeToMatchFoundEnhanced(roomId, callback);
            break;
          case 'connection-status':
            cleanup = await this.subscribeToConnectionStatusChange(roomId, callback);
            break;
          case 'room-state':
            cleanup = await this.subscribeToRoomStateSync(roomId, callback);
            break;
        }

        if (cleanup) {
          this.updateConnectionStatus('connected');
          this.reconnectionAttempts = 0;
          this.reconnectionDelay = 1000; // Reset delay
          console.log(`✅ ${subscriptionType} subscription established for room ${roomId}`);
        } else {
          throw new Error('Failed to establish subscription');
        }

      } catch (error) {
        console.error(`❌ Failed to establish ${subscriptionType} subscription:`, error);
        this.updateConnectionStatus('disconnected');
        
        // Attempt reconnection if under limit
        if (this.reconnectionAttempts < this.maxReconnectionAttempts && isActive) {
          this.reconnectionAttempts++;
          const delay = Math.min(this.reconnectionDelay * Math.pow(2, this.reconnectionAttempts - 1), 30000);
          
          console.log(`🔄 Attempting reconnection ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} in ${delay}ms`);
          
          reconnectionTimer = setTimeout(() => {
            attemptConnection();
          }, delay);
        } else {
          console.error(`❌ Max reconnection attempts reached for ${subscriptionType} subscription`);
        }
      }
    };

    // Start initial connection
    await attemptConnection();

    // Return master cleanup function
    return () => {
      isActive = false;
      
      if (reconnectionTimer) {
        clearTimeout(reconnectionTimer);
      }
      
      if (cleanup) {
        cleanup();
      }
      
      this.updateConnectionStatus('disconnected');
      console.log(`🧹 Cleaned up ${subscriptionType} subscription with reconnection for room ${roomId}`);
    };
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  /**
   * Force reconnection for all active subscriptions
   */
  async forceReconnection(): Promise<void> {
    console.log('🔄 Forcing reconnection for all subscriptions...');
    this.updateConnectionStatus('connecting');
    
    // Reset reconnection attempts
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = 1000;
    
    // Note: Individual subscriptions will handle their own reconnection
    // This method just resets the global state
  }
}

export const appSyncService = new AppSyncService();
export default appSyncService;