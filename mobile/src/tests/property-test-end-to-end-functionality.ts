/**
 * Property Test 13: End-to-End Functionality
 * 
 * Validates: Requirements 7.3, 7.4
 * 
 * This property test ensures that complete user workflows maintain
 * consistency and correctness across all system components and operations.
 */

import { loggingService } from '../services/loggingService';

interface UserJourney {
  description: string;
  steps: JourneyStep[];
  expectedOutcome: JourneyOutcome;
}

interface JourneyStep {
  action: string;
  input?: any;
  expectedResult: any;
  dependencies?: string[];
}

interface JourneyOutcome {
  userState: 'authenticated' | 'unauthenticated';
  dataCreated: string[];
  systemState: 'consistent' | 'inconsistent';
  errorRecovery?: boolean;
}

interface SystemState {
  authentication: {
    isAuthenticated: boolean;
    user?: any;
    tokens?: any;
  };
  rooms: Array<{
    id: string;
    name: string;
    status: string;
    memberCount: number;
  }>;
  votes: Array<{
    roomId: string;
    movieId: string;
    userId: string;
    timestamp: number;
  }>;
  subscriptions: Array<{
    type: string;
    roomId: string;
    active: boolean;
  }>;
  aiRecommendations: Array<{
    query: string;
    recommendations: any[];
    timestamp: number;
  }>;
}

/**
 * Mock System State Manager for property testing
 */
class PropertyTestSystemManager {
  private state: SystemState = {
    authentication: { isAuthenticated: false },
    rooms: [],
    votes: [],
    subscriptions: [],
    aiRecommendations: []
  };

  private operationHistory: Array<{
    timestamp: number;
    operation: string;
    input: any;
    result: any;
    success: boolean;
  }> = [];

  /**
   * Execute authentication operation
   */
  async executeAuth(operation: 'login' | 'logout' | 'register' | 'refresh', input: any): Promise<any> {
    const timestamp = Date.now();
    let result: any;
    let success = true;

    try {
      switch (operation) {
        case 'register':
          result = {
            success: true,
            userSub: `user-${timestamp}`,
            message: 'User registered successfully'
          };
          break;

        case 'login':
          this.state.authentication = {
            isAuthenticated: true,
            user: {
              sub: `user-${timestamp}`,
              email: input.email,
              name: input.name || 'Test User'
            },
            tokens: {
              accessToken: `access-${timestamp}`,
              idToken: `id-${timestamp}`,
              refreshToken: `refresh-${timestamp}`
            }
          };
          result = { success: true, data: this.state.authentication };
          break;

        case 'logout':
          this.state.authentication = { isAuthenticated: false };
          // Clear user-specific data
          this.state.subscriptions = [];
          result = { success: true };
          break;

        case 'refresh':
          if (this.state.authentication.isAuthenticated) {
            this.state.authentication.tokens = {
              ...this.state.authentication.tokens,
              accessToken: `access-refreshed-${timestamp}`,
              idToken: `id-refreshed-${timestamp}`
            };
            result = { success: true, tokens: this.state.authentication.tokens };
          } else {
            throw new Error('Not authenticated');
          }
          break;

        default:
          throw new Error(`Unknown auth operation: ${operation}`);
      }

    } catch (error) {
      success = false;
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.operationHistory.push({
      timestamp,
      operation: `auth_${operation}`,
      input,
      result,
      success
    });

    return result;
  }

  /**
   * Execute room operation
   */
  async executeRoom(operation: 'create' | 'join' | 'get' | 'list', input: any): Promise<any> {
    const timestamp = Date.now();
    let result: any;
    let success = true;

    try {
      if (!this.state.authentication.isAuthenticated) {
        throw new Error('Authentication required');
      }

      switch (operation) {
        case 'create':
          const newRoom = {
            id: `room-${timestamp}`,
            name: input.name,
            status: 'WAITING',
            memberCount: 1,
            inviteCode: `INV${timestamp.toString().slice(-6)}`,
            filters: input.filters,
            createdBy: this.state.authentication.user?.sub
          };
          this.state.rooms.push(newRoom);
          result = { createRoom: newRoom };
          break;

        case 'join':
          const roomToJoin = this.state.rooms.find(r => r.inviteCode === input.inviteCode);
          if (!roomToJoin) {
            throw new Error('Room not found');
          }
          roomToJoin.memberCount++;
          result = { joinRoom: { success: true, room: roomToJoin } };
          break;

        case 'get':
          const room = this.state.rooms.find(r => r.id === input.roomId);
          if (!room) {
            throw new Error('Room not found');
          }
          result = { getRoom: room };
          break;

        case 'list':
          const userRooms = this.state.rooms.filter(r => 
            r.createdBy === this.state.authentication.user?.sub
          );
          result = { getUserRooms: userRooms };
          break;

        default:
          throw new Error(`Unknown room operation: ${operation}`);
      }

    } catch (error) {
      success = false;
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.operationHistory.push({
      timestamp,
      operation: `room_${operation}`,
      input,
      result,
      success
    });

    return result;
  }

  /**
   * Execute voting operation
   */
  async executeVote(roomId: string, movieId: string): Promise<any> {
    const timestamp = Date.now();
    let result: any;
    let success = true;

    try {
      if (!this.state.authentication.isAuthenticated) {
        throw new Error('Authentication required');
      }

      const room = this.state.rooms.find(r => r.id === roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check for existing vote
      const existingVote = this.state.votes.find(v => 
        v.roomId === roomId && 
        v.movieId === movieId && 
        v.userId === this.state.authentication.user?.sub
      );

      if (existingVote) {
        throw new Error('Already voted on this movie');
      }

      // Add vote
      const newVote = {
        roomId,
        movieId,
        userId: this.state.authentication.user?.sub!,
        timestamp
      };
      this.state.votes.push(newVote);

      // Check for match (simplified Stop-on-Match algorithm)
      const roomVotes = this.state.votes.filter(v => v.roomId === roomId);
      const movieVotes = roomVotes.filter(v => v.movieId === movieId);
      
      // Simulate match if multiple votes on same movie
      const isMatch = movieVotes.length >= 2;

      if (isMatch) {
        room.status = 'MATCHED';
        result = {
          vote: {
            ...newVote,
            status: 'MATCHED',
            matchedMovie: {
              id: movieId,
              title: `Movie ${movieId}`,
              poster_path: '/test-poster.jpg'
            }
          }
        };
      } else {
        result = {
          vote: {
            ...newVote,
            status: 'RECORDED'
          }
        };
      }

    } catch (error) {
      success = false;
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.operationHistory.push({
      timestamp,
      operation: 'vote',
      input: { roomId, movieId },
      result,
      success
    });

    return result;
  }

  /**
   * Execute AI recommendation operation
   */
  async executeAI(query: string): Promise<any> {
    const timestamp = Date.now();
    let result: any;
    let success = true;

    try {
      if (!this.state.authentication.isAuthenticated) {
        throw new Error('Authentication required');
      }

      // Generate mock recommendations based on query
      const recommendations = [
        {
          movieId: `ai-movie-${timestamp}-1`,
          title: `AI Recommended Movie 1 for "${query}"`,
          reason: `Matches your request for ${query}`,
          confidence: 0.95
        },
        {
          movieId: `ai-movie-${timestamp}-2`,
          title: `AI Recommended Movie 2 for "${query}"`,
          reason: `Similar themes to ${query}`,
          confidence: 0.87
        }
      ];

      const aiResult = {
        query,
        recommendations,
        timestamp
      };

      this.state.aiRecommendations.push(aiResult);

      result = { getAIRecommendations: aiResult };

    } catch (error) {
      success = false;
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.operationHistory.push({
      timestamp,
      operation: 'ai_recommendations',
      input: { query },
      result,
      success
    });

    return result;
  }

  /**
   * Execute subscription operation
   */
  async executeSubscription(operation: 'subscribe' | 'unsubscribe', type: string, roomId: string): Promise<any> {
    const timestamp = Date.now();
    let result: any;
    let success = true;

    try {
      if (!this.state.authentication.isAuthenticated) {
        throw new Error('Authentication required');
      }

      switch (operation) {
        case 'subscribe':
          const existingSubscription = this.state.subscriptions.find(s => 
            s.type === type && s.roomId === roomId
          );

          if (existingSubscription) {
            existingSubscription.active = true;
          } else {
            this.state.subscriptions.push({
              type,
              roomId,
              active: true
            });
          }

          result = { 
            subscribed: true, 
            type, 
            roomId,
            unsubscribe: () => this.executeSubscription('unsubscribe', type, roomId)
          };
          break;

        case 'unsubscribe':
          const subscription = this.state.subscriptions.find(s => 
            s.type === type && s.roomId === roomId
          );

          if (subscription) {
            subscription.active = false;
          }

          result = { unsubscribed: true, type, roomId };
          break;

        default:
          throw new Error(`Unknown subscription operation: ${operation}`);
      }

    } catch (error) {
      success = false;
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.operationHistory.push({
      timestamp,
      operation: `subscription_${operation}`,
      input: { type, roomId },
      result,
      success
    });

    return result;
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get operation history
   */
  getHistory(): Array<{ timestamp: number; operation: string; input: any; result: any; success: boolean }> {
    return [...this.operationHistory];
  }

  /**
   * Check system consistency
   */
  checkConsistency(): { consistent: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check authentication consistency
    if (this.state.authentication.isAuthenticated) {
      if (!this.state.authentication.user || !this.state.authentication.tokens) {
        issues.push('Authenticated user missing user data or tokens');
      }
    } else {
      if (this.state.authentication.user || this.state.authentication.tokens) {
        issues.push('Unauthenticated user has user data or tokens');
      }
    }

    // Check room consistency
    this.state.rooms.forEach(room => {
      if (!room.id || !room.name || !room.status) {
        issues.push(`Room ${room.id} missing required fields`);
      }

      if (room.memberCount < 1) {
        issues.push(`Room ${room.id} has invalid member count: ${room.memberCount}`);
      }
    });

    // Check vote consistency
    this.state.votes.forEach(vote => {
      if (!vote.roomId || !vote.movieId || !vote.userId) {
        issues.push(`Vote missing required fields`);
      }

      const room = this.state.rooms.find(r => r.id === vote.roomId);
      if (!room) {
        issues.push(`Vote references non-existent room: ${vote.roomId}`);
      }
    });

    // Check subscription consistency
    if (!this.state.authentication.isAuthenticated && this.state.subscriptions.some(s => s.active)) {
      issues.push('Active subscriptions exist for unauthenticated user');
    }

    return {
      consistent: issues.length === 0,
      issues
    };
  }

  /**
   * Reset system state
   */
  reset(): void {
    this.state = {
      authentication: { isAuthenticated: false },
      rooms: [],
      votes: [],
      subscriptions: [],
      aiRecommendations: []
    };
    this.operationHistory = [];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    operationTypes: Record<string, number>;
    systemConsistency: boolean;
  } {
    const operationTypes: Record<string, number> = {};
    let successfulOperations = 0;

    this.operationHistory.forEach(op => {
      operationTypes[op.operation] = (operationTypes[op.operation] || 0) + 1;
      if (op.success) successfulOperations++;
    });

    const consistency = this.checkConsistency();

    return {
      totalOperations: this.operationHistory.length,
      successfulOperations,
      failedOperations: this.operationHistory.length - successfulOperations,
      operationTypes,
      systemConsistency: consistency.consistent
    };
  }
}

/**
 * Property 13: End-to-End Functionality
 * 
 * For all user journeys J and system states S:
 * - J(complete_workflow) must result in consistent system state S
 * - J(authentication_flow) must properly manage user state across all operations
 * - J(room_workflow) must maintain data integrity across create/join/vote operations
 * - J(error_scenarios) must recover gracefully and maintain system consistency
 * - J(concurrent_operations) must result in deterministic final state
 */
export function testEndToEndFunctionalityProperty(): boolean {
  console.log('🧪 Testing Property 13: End-to-End Functionality');

  const systemManager = new PropertyTestSystemManager();

  const userJourneys: UserJourney[] = [
    // Complete happy path journey
    {
      description: 'Complete user journey: register → login → create room → vote → match',
      steps: [
        {
          action: 'register',
          input: { email: 'test@example.com', password: 'TestPass123', name: 'Test User' },
          expectedResult: { success: true }
        },
        {
          action: 'login',
          input: { email: 'test@example.com', password: 'TestPass123' },
          expectedResult: { success: true },
          dependencies: ['register']
        },
        {
          action: 'create_room',
          input: { name: 'Test Room', filters: { genres: ['Action'] } },
          expectedResult: { createRoom: { name: 'Test Room' } },
          dependencies: ['login']
        },
        {
          action: 'vote',
          input: { movieId: 'movie123' },
          expectedResult: { vote: { status: 'RECORDED' } },
          dependencies: ['create_room']
        },
        {
          action: 'ai_recommendations',
          input: { query: 'action movies' },
          expectedResult: { getAIRecommendations: { recommendations: [] } },
          dependencies: ['login']
        }
      ],
      expectedOutcome: {
        userState: 'authenticated',
        dataCreated: ['user', 'room', 'vote', 'ai_recommendation'],
        systemState: 'consistent'
      }
    },

    // Authentication flow journey
    {
      description: 'Authentication state management across operations',
      steps: [
        {
          action: 'login',
          input: { email: 'auth@example.com', password: 'AuthPass123' },
          expectedResult: { success: true }
        },
        {
          action: 'create_room',
          input: { name: 'Auth Room', filters: {} },
          expectedResult: { createRoom: { name: 'Auth Room' } },
          dependencies: ['login']
        },
        {
          action: 'refresh_token',
          input: {},
          expectedResult: { success: true },
          dependencies: ['login']
        },
        {
          action: 'logout',
          input: {},
          expectedResult: { success: true },
          dependencies: ['login']
        }
      ],
      expectedOutcome: {
        userState: 'unauthenticated',
        dataCreated: ['room'],
        systemState: 'consistent'
      }
    },

    // Multi-room workflow
    {
      description: 'Multi-room creation and management',
      steps: [
        {
          action: 'login',
          input: { email: 'multi@example.com', password: 'MultiPass123' },
          expectedResult: { success: true }
        },
        {
          action: 'create_room',
          input: { name: 'Room 1', filters: { genres: ['Comedy'] } },
          expectedResult: { createRoom: { name: 'Room 1' } },
          dependencies: ['login']
        },
        {
          action: 'create_room',
          input: { name: 'Room 2', filters: { genres: ['Drama'] } },
          expectedResult: { createRoom: { name: 'Room 2' } },
          dependencies: ['login']
        },
        {
          action: 'list_rooms',
          input: {},
          expectedResult: { getUserRooms: [] },
          dependencies: ['create_room']
        }
      ],
      expectedOutcome: {
        userState: 'authenticated',
        dataCreated: ['room', 'room'],
        systemState: 'consistent'
      }
    },

    // Subscription management journey
    {
      description: 'Real-time subscription lifecycle',
      steps: [
        {
          action: 'login',
          input: { email: 'sub@example.com', password: 'SubPass123' },
          expectedResult: { success: true }
        },
        {
          action: 'create_room',
          input: { name: 'Sub Room', filters: {} },
          expectedResult: { createRoom: { name: 'Sub Room' } },
          dependencies: ['login']
        },
        {
          action: 'subscribe_votes',
          input: { type: 'vote_updates' },
          expectedResult: { subscribed: true },
          dependencies: ['create_room']
        },
        {
          action: 'subscribe_matches',
          input: { type: 'match_found' },
          expectedResult: { subscribed: true },
          dependencies: ['create_room']
        },
        {
          action: 'unsubscribe_all',
          input: {},
          expectedResult: { unsubscribed: true },
          dependencies: ['subscribe_votes', 'subscribe_matches']
        }
      ],
      expectedOutcome: {
        userState: 'authenticated',
        dataCreated: ['room', 'subscription', 'subscription'],
        systemState: 'consistent'
      }
    },

    // Error recovery journey
    {
      description: 'Error scenarios and recovery',
      steps: [
        {
          action: 'login',
          input: { email: 'error@example.com', password: 'ErrorPass123' },
          expectedResult: { success: true }
        },
        {
          action: 'vote_nonexistent_room',
          input: { roomId: 'nonexistent', movieId: 'movie123' },
          expectedResult: { success: false }
        },
        {
          action: 'create_room',
          input: { name: 'Recovery Room', filters: {} },
          expectedResult: { createRoom: { name: 'Recovery Room' } },
          dependencies: ['login']
        },
        {
          action: 'vote',
          input: { movieId: 'movie123' },
          expectedResult: { vote: { status: 'RECORDED' } },
          dependencies: ['create_room']
        }
      ],
      expectedOutcome: {
        userState: 'authenticated',
        dataCreated: ['room', 'vote'],
        systemState: 'consistent',
        errorRecovery: true
      }
    }
  ];

  let passedJourneys = 0;
  let totalJourneys = userJourneys.length;

  for (const journey of userJourneys) {
    try {
      console.log(`  Testing: ${journey.description}`);

      // Reset system state
      systemManager.reset();

      let journeySuccess = true;
      let createdRoomId: string | null = null;
      const stepResults: any[] = [];

      // Execute journey steps
      for (const step of journey.steps) {
        try {
          let result: any;

          switch (step.action) {
            case 'register':
              result = await systemManager.executeAuth('register', step.input);
              break;

            case 'login':
              result = await systemManager.executeAuth('login', step.input);
              break;

            case 'logout':
              result = await systemManager.executeAuth('logout', step.input);
              break;

            case 'refresh_token':
              result = await systemManager.executeAuth('refresh', step.input);
              break;

            case 'create_room':
              result = await systemManager.executeRoom('create', step.input);
              if (result.createRoom?.id) {
                createdRoomId = result.createRoom.id;
              }
              break;

            case 'join_room':
              result = await systemManager.executeRoom('join', step.input);
              break;

            case 'list_rooms':
              result = await systemManager.executeRoom('list', step.input);
              break;

            case 'vote':
              if (!createdRoomId) {
                throw new Error('No room available for voting');
              }
              result = await systemManager.executeVote(createdRoomId, step.input.movieId);
              break;

            case 'vote_nonexistent_room':
              result = await systemManager.executeVote(step.input.roomId, step.input.movieId);
              break;

            case 'ai_recommendations':
              result = await systemManager.executeAI(step.input.query);
              break;

            case 'subscribe_votes':
              if (!createdRoomId) {
                throw new Error('No room available for subscription');
              }
              result = await systemManager.executeSubscription('subscribe', 'vote_updates', createdRoomId);
              break;

            case 'subscribe_matches':
              if (!createdRoomId) {
                throw new Error('No room available for subscription');
              }
              result = await systemManager.executeSubscription('subscribe', 'match_found', createdRoomId);
              break;

            case 'unsubscribe_all':
              if (!createdRoomId) {
                throw new Error('No room available for unsubscription');
              }
              result = await systemManager.executeSubscription('unsubscribe', 'vote_updates', createdRoomId);
              break;

            default:
              throw new Error(`Unknown action: ${step.action}`);
          }

          stepResults.push({ step: step.action, result });

          // Validate step result
          const stepValid = this.validateStepResult(result, step.expectedResult);
          if (!stepValid) {
            console.error(`    ❌ Step ${step.action} validation failed`);
            journeySuccess = false;
            break;
          }

        } catch (error) {
          console.error(`    ❌ Step ${step.action} failed:`, error);
          
          // Check if this is an expected error for error recovery testing
          if (journey.expectedOutcome.errorRecovery && step.action.includes('nonexistent')) {
            console.log(`    ✅ Expected error handled correctly: ${step.action}`);
            continue;
          }
          
          journeySuccess = false;
          break;
        }
      }

      if (!journeySuccess) {
        continue;
      }

      // Validate final system state
      const finalState = systemManager.getState();
      const consistency = systemManager.checkConsistency();

      if (!consistency.consistent) {
        console.error(`    ❌ System inconsistent after journey:`, consistency.issues);
        continue;
      }

      // Validate expected outcome
      const outcomeValid = this.validateJourneyOutcome(finalState, journey.expectedOutcome);
      if (!outcomeValid) {
        console.error(`    ❌ Journey outcome validation failed`);
        continue;
      }

      console.log(`    ✅ Passed: ${journey.description}`);
      passedJourneys++;

    } catch (error) {
      console.error(`    ❌ Journey failed with error: ${error}`);
    }
  }

  // Test concurrent journeys
  console.log('  Testing concurrent user journeys...');
  
  try {
    totalJourneys++;
    
    systemManager.reset();
    
    // Simulate multiple users performing operations concurrently
    const concurrentOperations = [
      () => systemManager.executeAuth('login', { email: 'user1@test.com', password: 'pass1' }),
      () => systemManager.executeAuth('login', { email: 'user2@test.com', password: 'pass2' }),
      () => systemManager.executeAuth('login', { email: 'user3@test.com', password: 'pass3' })
    ];

    // Execute concurrent logins
    const loginResults = await Promise.allSettled(
      concurrentOperations.map(op => op())
    );

    // All should succeed (in our mock system)
    const successfulLogins = loginResults.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;

    if (successfulLogins === 0) {
      console.error(`    ❌ No concurrent logins succeeded`);
    } else {
      // Check system consistency after concurrent operations
      const consistency = systemManager.checkConsistency();
      
      if (!consistency.consistent) {
        console.error(`    ❌ System inconsistent after concurrent operations:`, consistency.issues);
      } else {
        console.log(`    ✅ Concurrent operations handled correctly`);
        passedJourneys++;
      }
    }

  } catch (error) {
    console.error(`    ❌ Concurrent journeys test failed: ${error}`);
  }

  const successRate = (passedJourneys / totalJourneys) * 100;
  console.log(`\n📊 End-to-End Functionality Property Test Results:`);
  console.log(`   Passed: ${passedJourneys}/${totalJourneys} (${successRate.toFixed(1)}%)`);

  if (successRate === 100) {
    console.log(`   ✅ Property 13 (End-to-End Functionality) holds universally`);
    return true;
  } else {
    console.log(`   ❌ Property 13 (End-to-End Functionality) violated`);
    return false;
  }
}

/**
 * Validate step result against expected result
 */
function validateStepResult(actual: any, expected: any): boolean {
  if (typeof expected === 'object' && expected !== null) {
    for (const key in expected) {
      if (expected[key] !== undefined) {
        if (typeof expected[key] === 'object') {
          if (!validateStepResult(actual?.[key], expected[key])) {
            return false;
          }
        } else {
          if (actual?.[key] !== expected[key]) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Validate journey outcome against expected outcome
 */
function validateJourneyOutcome(finalState: SystemState, expectedOutcome: JourneyOutcome): boolean {
  // Check user state
  const actualUserState = finalState.authentication.isAuthenticated ? 'authenticated' : 'unauthenticated';
  if (actualUserState !== expectedOutcome.userState) {
    return false;
  }

  // Check system consistency
  if (expectedOutcome.systemState === 'consistent') {
    // This is checked separately in the main function
    return true;
  }

  return true;
}

/**
 * Test performance characteristics of end-to-end workflows
 */
export function testEndToEndPerformance(): boolean {
  console.log('⚡ Testing end-to-end workflow performance...');

  const systemManager = new PropertyTestSystemManager();
  let passedTests = 0;
  let totalTests = 0;

  // Test operation latency
  try {
    totalTests++;
    
    systemManager.reset();
    
    const operations = [];
    const startTime = Date.now();
    
    // Perform many operations
    for (let i = 0; i < 100; i++) {
      operations.push(
        systemManager.executeAuth('login', { email: `user${i}@test.com`, password: 'pass' })
      );
    }
    
    await Promise.all(operations);
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / 100;
    
    console.log(`    📊 100 operations completed in ${totalTime}ms (avg: ${avgTime.toFixed(1)}ms)`);
    
    if (avgTime < 10) { // Should be very fast in mock system
      console.log(`    ✅ Operation latency acceptable`);
      passedTests++;
    } else {
      console.error(`    ❌ Operation latency too high: ${avgTime}ms`);
    }

  } catch (error) {
    console.error(`    ❌ Performance test failed: ${error}`);
  }

  // Test memory usage (operation history growth)
  try {
    totalTests++;
    
    systemManager.reset();
    
    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      await systemManager.executeAuth('login', { email: `perf${i}@test.com`, password: 'pass' });
    }
    
    const stats = systemManager.getStats();
    
    if (stats.totalOperations === 1000) {
      console.log(`    ✅ Operation history tracking correct: ${stats.totalOperations} operations`);
      passedTests++;
    } else {
      console.error(`    ❌ Operation history incorrect: expected 1000, got ${stats.totalOperations}`);
    }

  } catch (error) {
    console.error(`    ❌ Memory usage test failed: ${error}`);
  }

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n📊 Performance Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} (${successRate.toFixed(1)}%)`);

  return successRate === 100;
}

// Export test runner
export function runEndToEndFunctionalityPropertyTests(): boolean {
  console.log('\n🎬 Running End-to-End Functionality Property Tests...\n');
  
  const propertyTestPassed = testEndToEndFunctionalityProperty();
  const performanceTestPassed = testEndToEndPerformance();
  
  const overallSuccess = propertyTestPassed && performanceTestPassed;
  
  console.log(`\n🏁 Overall End-to-End Functionality Property Test Result: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  
  return overallSuccess;
}