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
          'x-api-key': this.config.apiKey || '',
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
   * Create a new room
   */
  async createRoom(input: {
    name: string;
    description?: string;
    isPrivate?: boolean;
  }): Promise<{ createRoom: any }> {
    console.log('🔍 AppSyncService.createRoom - Input received:', JSON.stringify(input, null, 2));
    
    const mutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
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

    console.log('🔍 AppSyncService.createRoom - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoom - Variables:', JSON.stringify({ input }, null, 2));

    const result = await this.graphqlRequest<{ createRoom: any }>({
      query: mutation,
      variables: { input }
    });

    console.log('🔍 AppSyncService.createRoom - Result:', JSON.stringify(result, null, 2));
    return result;
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
   * Join a room using invite code
   */
  async joinRoom(inviteCode: string): Promise<{ joinRoom: any }> {
    const mutation = `
      mutation JoinRoom($input: JoinRoomInput!) {
        joinRoom(input: $input) {
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

    const input = { inviteCode };

    console.log('🚪 AppSyncService.joinRoom - Input:', JSON.stringify(input, null, 2));

    const result = await this.graphqlRequest<{ joinRoom: any }>({
      query: mutation,
      variables: { input }
    });

    console.log('🚪 AppSyncService.joinRoom - Result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Get room details
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

    const result = await this.graphqlRequest<{ getRoom: any }>({
      query,
      variables: { roomId }
    });

    return result;
  }

  /**
   * Vote on content
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

    const result = await this.graphqlRequest<{ vote: any }>({
      query: mutation,
      variables: { input }
    });

    console.log('🗳️ AppSyncService.vote - Result:', JSON.stringify(result, null, 2));
    return result;
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
   * Get AI recommendations
   */
  async getAIRecommendations(input: {
    roomId: string;
    preferences?: string[];
    excludeIds?: string[];
  }): Promise<{ getAIRecommendations: any[] }> {
    const query = `
      query GetAIRecommendations($input: AIRecommendationInput!) {
        getAIRecommendations(input: $input) {
          id
          title
          overview
          posterPath
          voteAverage
          releaseDate
          confidence
        }
      }
    `;

    const result = await this.graphqlRequest<{ getAIRecommendations: any[] }>({
      query,
      variables: { input }
    });

    return result;
  }

  /**
   * Subscribe to vote updates
   */
  async subscribeToVoteUpdates(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up vote updates subscription for room:', roomId);
      
      // For now, return a placeholder cleanup function
      // Real implementation would use WebSocket subscriptions with AppSync
      const cleanup = () => {
        console.log('🧹 Cleaning up vote updates subscription for room:', roomId);
      };
      
      return cleanup;
    } catch (error) {
      console.error('❌ Failed to setup vote updates subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to match found events
   */
  async subscribeToMatchFound(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up match found subscription for room:', roomId);
      
      // For now, return a placeholder cleanup function
      // Real implementation would use WebSocket subscriptions with AppSync
      const cleanup = () => {
        console.log('🧹 Cleaning up match found subscription for room:', roomId);
      };
      
      return cleanup;
    } catch (error) {
      console.error('❌ Failed to setup match found subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to room updates
   */
  async subscribeToRoomUpdates(roomId: string, callback: (roomUpdate: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up room updates subscription for room:', roomId);
      
      // For now, return a placeholder cleanup function
      // Real implementation would use WebSocket subscriptions with AppSync
      const cleanup = () => {
        console.log('🧹 Cleaning up room updates subscription for room:', roomId);
      };
      
      return cleanup;
    } catch (error) {
      console.error('❌ Failed to setup room updates subscription:', error);
      return null;
    }
  }
}

export const appSyncService = new AppSyncService();
export default appSyncService;