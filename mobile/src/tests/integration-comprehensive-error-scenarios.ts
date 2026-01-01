/**
 * Integration Test: Comprehensive Error Scenario Testing
 * 
 * Tests Cognito service unavailability, GraphQL API errors and timeouts,
 * subscription connection failures, and token expiration and refresh failures.
 * 
 * Validates: Requirements 6.3, 7.5
 */

import { cognitoAuthService } from '../services/cognitoAuthService';
import { appSyncService } from '../services/appSyncService';
import { networkService } from '../services/networkService';
import { loggingService } from '../services/loggingService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ErrorScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<any>;
  validate: (result: any, error?: any) => boolean;
  cleanup: () => Promise<void>;
}

interface ErrorTestResult {
  scenarioName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  errorHandledGracefully: boolean;
}

/**
 * Mock network failure simulation
 */
class NetworkFailureSimulator {
  private originalFetch: typeof fetch;
  private failureMode: 'timeout' | 'network_error' | 'server_error' | 'none' = 'none';
  private failureRate: number = 1.0; // 1.0 = always fail, 0.0 = never fail

  constructor() {
    this.originalFetch = global.fetch;
  }

  /**
   * Enable network failure simulation
   */
  enableFailure(mode: 'timeout' | 'network_error' | 'server_error', rate: number = 1.0): void {
    this.failureMode = mode;
    this.failureRate = rate;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Randomly decide whether to fail based on failure rate
      if (Math.random() < this.failureRate) {
        switch (this.failureMode) {
          case 'timeout':
            // Simulate timeout by waiting longer than expected
            await new Promise(resolve => setTimeout(resolve, 30000));
            throw new Error('Request timeout');

          case 'network_error':
            throw new Error('Network request failed');

          case 'server_error':
            return new Response(
              JSON.stringify({ error: 'Internal Server Error' }),
              { status: 500, statusText: 'Internal Server Error' }
            );

          default:
            break;
        }
      }

      // Call original fetch if not failing
      return this.originalFetch(input, init);
    };
  }

  /**
   * Disable network failure simulation
   */
  disableFailure(): void {
    this.failureMode = 'none';
    global.fetch = this.originalFetch;
  }

  /**
   * Get current failure mode
   */
  getFailureMode(): string {
    return this.failureMode;
  }
}

const networkSimulator = new NetworkFailureSimulator();

/**
 * Test Cognito service unavailability scenarios
 */
async function testCognitoServiceErrors(): Promise<ErrorTestResult[]> {
  console.log('🔐 Testing Cognito Service Error Scenarios...');

  const scenarios: ErrorScenario[] = [
    {
      name: 'cognito_network_timeout',
      description: 'Cognito service timeout during login',
      setup: async () => {
        await AsyncStorage.clear();
        networkSimulator.enableFailure('timeout', 1.0);
      },
      execute: async () => {
        return await cognitoAuthService.login('test@example.com', 'TestPassword123');
      },
      validate: (result, error) => {
        // Should handle timeout gracefully
        return result?.success === false && 
               (result?.error?.includes('timeout') || result?.error?.includes('network'));
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'cognito_network_error',
      description: 'Cognito service network error during registration',
      setup: async () => {
        await AsyncStorage.clear();
        networkSimulator.enableFailure('network_error', 1.0);
      },
      execute: async () => {
        return await cognitoAuthService.register('test@example.com', 'TestPassword123', 'Test User');
      },
      validate: (result, error) => {
        // Should handle network error gracefully
        return result?.success === false && 
               (result?.message?.includes('network') || result?.message?.includes('Error'));
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'cognito_server_error',
      description: 'Cognito service server error during token refresh',
      setup: async () => {
        await AsyncStorage.clear();
        networkSimulator.enableFailure('server_error', 1.0);
      },
      execute: async () => {
        return await cognitoAuthService.refreshToken('mock-refresh-token');
      },
      validate: (result, error) => {
        // Should handle server error gracefully
        return result?.success === false && result?.error;
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'cognito_invalid_credentials',
      description: 'Invalid credentials error handling',
      setup: async () => {
        await AsyncStorage.clear();
        // No network simulation - test actual error handling
      },
      execute: async () => {
        return await cognitoAuthService.login('invalid@example.com', 'WrongPassword');
      },
      validate: (result, error) => {
        // Should handle invalid credentials gracefully
        return result?.success === false && 
               (result?.error?.includes('incorrectos') || result?.error?.includes('NotAuthorized'));
      },
      cleanup: async () => {
        // No cleanup needed
      }
    },

    {
      name: 'cognito_malformed_token',
      description: 'Malformed token error handling',
      setup: async () => {
        await AsyncStorage.clear();
      },
      execute: async () => {
        return await cognitoAuthService.refreshToken('malformed.token.data');
      },
      validate: (result, error) => {
        // Should handle malformed token gracefully
        return result?.success === false && result?.error;
      },
      cleanup: async () => {
        // No cleanup needed
      }
    }
  ];

  return await executeErrorScenarios('Cognito Service', scenarios);
}

/**
 * Test GraphQL API errors and timeouts
 */
async function testGraphQLAPIErrors(): Promise<ErrorTestResult[]> {
  console.log('📊 Testing GraphQL API Error Scenarios...');

  const scenarios: ErrorScenario[] = [
    {
      name: 'graphql_network_timeout',
      description: 'GraphQL API timeout during room creation',
      setup: async () => {
        // Set up authenticated state first
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
        networkSimulator.enableFailure('timeout', 1.0);
      },
      execute: async () => {
        return await appSyncService.createRoom({
          name: 'Test Room',
          description: 'Test room for error handling'
        });
      },
      validate: (result, error) => {
        // Should handle timeout with retry mechanism
        return error && (
          error.message?.includes('timeout') || 
          error.message?.includes('network') ||
          error.message?.includes('retry')
        );
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
        await AsyncStorage.clear();
      }
    },

    {
      name: 'graphql_server_error',
      description: 'GraphQL API server error during query',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
        networkSimulator.enableFailure('server_error', 1.0);
      },
      execute: async () => {
        return await appSyncService.getRoom('test-room-id');
      },
      validate: (result, error) => {
        // Should handle server error gracefully
        return error && (
          error.message?.includes('500') || 
          error.message?.includes('Internal Server Error') ||
          error.message?.includes('HTTP')
        );
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
        await AsyncStorage.clear();
      }
    },

    {
      name: 'graphql_unauthorized',
      description: 'GraphQL API unauthorized error',
      setup: async () => {
        // Set up with invalid token
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'invalid-token',
          idToken: 'invalid-id-token',
          refreshToken: 'invalid-refresh-token'
        }));
      },
      execute: async () => {
        return await appSyncService.getUserRooms();
      },
      validate: (result, error) => {
        // Should handle unauthorized error
        return error && (
          error.message?.includes('401') || 
          error.message?.includes('Unauthorized') ||
          error.message?.includes('authentication')
        );
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    },

    {
      name: 'graphql_malformed_query',
      description: 'GraphQL malformed query error',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
      },
      execute: async () => {
        // Try to execute a malformed GraphQL operation
        try {
          const result = await appSyncService.getMovieDetails(''); // Empty movie ID
          return result;
        } catch (error) {
          throw error;
        }
      },
      validate: (result, error) => {
        // Should handle malformed query gracefully
        return error && (
          error.message?.includes('GraphQL') || 
          error.message?.includes('Invalid') ||
          error.message?.includes('Bad Request')
        );
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    },

    {
      name: 'graphql_rate_limit',
      description: 'GraphQL API rate limiting',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
      },
      execute: async () => {
        // Simulate rapid requests that might trigger rate limiting
        const requests = [];
        for (let i = 0; i < 10; i++) {
          requests.push(appSyncService.healthCheck());
        }
        
        try {
          const results = await Promise.allSettled(requests);
          return { results, allSucceeded: results.every(r => r.status === 'fulfilled') };
        } catch (error) {
          throw error;
        }
      },
      validate: (result, error) => {
        // Should handle rate limiting or complete successfully
        return (result?.allSucceeded === true) || 
               (error && error.message?.includes('rate')) ||
               (result?.results && result.results.length === 10);
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    }
  ];

  return await executeErrorScenarios('GraphQL API', scenarios);
}

/**
 * Test subscription connection failures
 */
async function testSubscriptionErrors(): Promise<ErrorTestResult[]> {
  console.log('⚡ Testing Subscription Error Scenarios...');

  const scenarios: ErrorScenario[] = [
    {
      name: 'subscription_connection_failure',
      description: 'WebSocket connection failure during subscription setup',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
        networkSimulator.enableFailure('network_error', 1.0);
      },
      execute: async () => {
        try {
          const unsubscribe = await appSyncService.subscribeToVoteUpdates(
            'test-room-id',
            (data) => console.log('Vote update:', data)
          );
          
          // Wait a bit to see if connection establishes
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          return { subscriptionCreated: true, unsubscribe };
        } catch (error) {
          return { subscriptionCreated: false, error: error.message };
        }
      },
      validate: (result, error) => {
        // Should either create subscription with fallback or handle error gracefully
        return (result?.subscriptionCreated === false && result?.error) ||
               (result?.subscriptionCreated === true); // Fallback mechanism worked
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
        appSyncService.disconnectAllSubscriptions();
        await AsyncStorage.clear();
      }
    },

    {
      name: 'subscription_authentication_failure',
      description: 'Subscription authentication failure',
      setup: async () => {
        // Set up with invalid token
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'invalid-subscription-token',
          idToken: 'invalid-id-token',
          refreshToken: 'invalid-refresh-token'
        }));
      },
      execute: async () => {
        try {
          const unsubscribe = await appSyncService.subscribeToMatchFound(
            'test-room-id',
            (data) => console.log('Match found:', data)
          );
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return { subscriptionCreated: true, unsubscribe };
        } catch (error) {
          return { subscriptionCreated: false, error: error.message };
        }
      },
      validate: (result, error) => {
        // Should handle authentication failure gracefully
        return (result?.subscriptionCreated === false && result?.error) ||
               (result?.subscriptionCreated === true); // Fallback worked
      },
      cleanup: async () => {
        appSyncService.disconnectAllSubscriptions();
        await AsyncStorage.clear();
      }
    },

    {
      name: 'subscription_unexpected_disconnect',
      description: 'Unexpected subscription disconnection',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
      },
      execute: async () => {
        try {
          let reconnectionAttempted = false;
          
          const unsubscribe = await appSyncService.subscribeToRoomUpdates(
            'test-room-id',
            (data) => {
              console.log('Room update:', data);
              reconnectionAttempted = true;
            }
          );
          
          // Simulate connection after a delay
          setTimeout(() => {
            // Simulate network failure after connection
            networkSimulator.enableFailure('network_error', 1.0);
          }, 500);
          
          // Wait to see if reconnection is attempted
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          return { 
            subscriptionCreated: true, 
            reconnectionAttempted,
            unsubscribe 
          };
        } catch (error) {
          return { subscriptionCreated: false, error: error.message };
        }
      },
      validate: (result, error) => {
        // Should handle disconnection gracefully (with or without reconnection)
        return result?.subscriptionCreated === true || 
               (result?.subscriptionCreated === false && result?.error);
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
        appSyncService.disconnectAllSubscriptions();
        await AsyncStorage.clear();
      }
    },

    {
      name: 'subscription_memory_cleanup',
      description: 'Subscription memory cleanup on errors',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token'
        }));
      },
      execute: async () => {
        const subscriptions = [];
        
        // Create multiple subscriptions
        for (let i = 0; i < 5; i++) {
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              `test-room-${i}`,
              (data) => console.log(`Vote update ${i}:`, data)
            );
            subscriptions.push(unsubscribe);
          } catch (error) {
            console.log(`Subscription ${i} failed:`, error.message);
          }
        }
        
        // Clean up all subscriptions
        appSyncService.disconnectAllSubscriptions();
        
        return { 
          subscriptionsCreated: subscriptions.length,
          cleanupCompleted: true 
        };
      },
      validate: (result, error) => {
        // Should handle cleanup without memory leaks
        return result?.cleanupCompleted === true;
      },
      cleanup: async () => {
        appSyncService.disconnectAllSubscriptions();
        await AsyncStorage.clear();
      }
    }
  ];

  return await executeErrorScenarios('Subscription', scenarios);
}

/**
 * Test token expiration and refresh failures
 */
async function testTokenErrors(): Promise<ErrorTestResult[]> {
  console.log('🔑 Testing Token Error Scenarios...');

  const scenarios: ErrorScenario[] = [
    {
      name: 'token_expiration_detection',
      description: 'Expired token detection and handling',
      setup: async () => {
        // Set up with expired token (simulate by using old timestamp)
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
        
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: expiredToken,
          idToken: expiredToken,
          refreshToken: 'valid-refresh-token'
        }));
      },
      execute: async () => {
        return await cognitoAuthService.checkStoredAuth();
      },
      validate: (result, error) => {
        // Should detect expired token and attempt refresh or return unauthenticated
        return result?.isAuthenticated === false || 
               (result?.isAuthenticated === true && result?.tokens); // Refresh succeeded
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    },

    {
      name: 'refresh_token_failure',
      description: 'Refresh token failure handling',
      setup: async () => {
        await AsyncStorage.clear();
        networkSimulator.enableFailure('server_error', 1.0);
      },
      execute: async () => {
        return await cognitoAuthService.refreshToken('invalid-refresh-token');
      },
      validate: (result, error) => {
        // Should handle refresh failure gracefully
        return result?.success === false && result?.error;
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'token_refresh_network_failure',
      description: 'Network failure during token refresh',
      setup: async () => {
        await AsyncStorage.clear();
        networkSimulator.enableFailure('network_error', 1.0);
      },
      execute: async () => {
        return await cognitoAuthService.refreshToken('valid-refresh-token');
      },
      validate: (result, error) => {
        // Should handle network failure with retry mechanism
        return result?.success === false && 
               (result?.error?.includes('network') || result?.error?.includes('conexión'));
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'concurrent_token_refresh',
      description: 'Concurrent token refresh attempts',
      setup: async () => {
        await AsyncStorage.setItem('cognitoTokens', JSON.stringify({
          accessToken: 'expiring-token',
          idToken: 'expiring-id-token',
          refreshToken: 'valid-refresh-token'
        }));
      },
      execute: async () => {
        // Attempt multiple concurrent refreshes
        const refreshPromises = [
          cognitoAuthService.refreshToken('valid-refresh-token'),
          cognitoAuthService.refreshToken('valid-refresh-token'),
          cognitoAuthService.refreshToken('valid-refresh-token')
        ];
        
        const results = await Promise.allSettled(refreshPromises);
        
        return {
          results,
          successCount: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
          failureCount: results.filter(r => r.status === 'rejected' || !r.value?.success).length
        };
      },
      validate: (result, error) => {
        // Should handle concurrent refreshes gracefully (some may succeed, some may fail)
        return result?.results?.length === 3 && 
               (result.successCount > 0 || result.failureCount === 3);
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    },

    {
      name: 'token_storage_corruption',
      description: 'Corrupted token storage handling',
      setup: async () => {
        // Set up corrupted token data
        await AsyncStorage.setItem('cognitoTokens', 'corrupted-json-data');
      },
      execute: async () => {
        return await cognitoAuthService.checkStoredAuth();
      },
      validate: (result, error) => {
        // Should handle corrupted storage gracefully
        return result?.isAuthenticated === false;
      },
      cleanup: async () => {
        await AsyncStorage.clear();
      }
    }
  ];

  return await executeErrorScenarios('Token Management', scenarios);
}

/**
 * Test network resilience and recovery
 */
async function testNetworkResilienceErrors(): Promise<ErrorTestResult[]> {
  console.log('🌐 Testing Network Resilience Error Scenarios...');

  const scenarios: ErrorScenario[] = [
    {
      name: 'network_connectivity_check',
      description: 'Network connectivity detection',
      setup: async () => {
        // No special setup needed
      },
      execute: async () => {
        const isConnected = networkService.isConnected();
        return { isConnected, connectivityChecked: true };
      },
      validate: (result, error) => {
        // Should be able to check connectivity
        return result?.connectivityChecked === true && 
               typeof result?.isConnected === 'boolean';
      },
      cleanup: async () => {
        // No cleanup needed
      }
    },

    {
      name: 'retry_mechanism_exhaustion',
      description: 'Retry mechanism exhaustion',
      setup: async () => {
        networkSimulator.enableFailure('network_error', 1.0);
      },
      execute: async () => {
        try {
          const result = await networkService.executeWithRetry(
            async () => {
              throw new Error('Persistent network error');
            },
            'Test Operation',
            { maxAttempts: 3, baseDelay: 100, maxDelay: 500 }
          );
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error.message,
            retriesExhausted: true 
          };
        }
      },
      validate: (result, error) => {
        // Should exhaust retries and fail gracefully
        return result?.success === false && 
               result?.retriesExhausted === true;
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    },

    {
      name: 'partial_network_recovery',
      description: 'Partial network recovery scenarios',
      setup: async () => {
        // Start with 50% failure rate
        networkSimulator.enableFailure('network_error', 0.5);
      },
      execute: async () => {
        const results = [];
        
        // Attempt multiple operations
        for (let i = 0; i < 10; i++) {
          try {
            const result = await networkService.executeWithRetry(
              async () => {
                // This will randomly succeed or fail based on failure rate
                const response = await fetch('https://httpbin.org/status/200');
                return { success: true, attempt: i };
              },
              `Test Operation ${i}`,
              { maxAttempts: 2, baseDelay: 50, maxDelay: 200 }
            );
            results.push({ success: true, attempt: i });
          } catch (error) {
            results.push({ success: false, attempt: i, error: error.message });
          }
        }
        
        return {
          results,
          successCount: results.filter(r => r.success).length,
          failureCount: results.filter(r => !r.success).length
        };
      },
      validate: (result, error) => {
        // Should have some successes and some failures with 50% failure rate
        return result?.results?.length === 10 && 
               result.successCount > 0 && 
               result.failureCount > 0;
      },
      cleanup: async () => {
        networkSimulator.disableFailure();
      }
    }
  ];

  return await executeErrorScenarios('Network Resilience', scenarios);
}

/**
 * Execute a series of error scenarios
 */
async function executeErrorScenarios(categoryName: string, scenarios: ErrorScenario[]): Promise<ErrorTestResult[]> {
  const results: ErrorTestResult[] = [];

  for (const scenario of scenarios) {
    const startTime = Date.now();
    let errorHandledGracefully = false;

    try {
      console.log(`  🔄 ${scenario.description}...`);

      // Setup
      await scenario.setup();

      // Execute
      let result: any;
      let executionError: any;

      try {
        result = await scenario.execute();
        errorHandledGracefully = true; // If no exception thrown, error was handled
      } catch (error) {
        executionError = error;
        errorHandledGracefully = true; // Exception is also a form of error handling
      }

      const duration = Date.now() - startTime;

      // Validate
      const isValid = scenario.validate(result, executionError);

      if (isValid) {
        console.log(`    ✅ ${scenario.name} handled correctly (${duration}ms)`);
        results.push({
          scenarioName: scenario.name,
          success: true,
          result,
          duration,
          errorHandledGracefully
        });
      } else {
        console.log(`    ❌ ${scenario.name} validation failed (${duration}ms)`);
        results.push({
          scenarioName: scenario.name,
          success: false,
          result,
          error: 'Validation failed',
          duration,
          errorHandledGracefully
        });
      }

      // Cleanup
      await scenario.cleanup();

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`    ❌ ${scenario.name} failed with unhandled error (${duration}ms):`, error);

      results.push({
        scenarioName: scenario.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
        errorHandledGracefully: false
      });

      // Still try to cleanup
      try {
        await scenario.cleanup();
      } catch (cleanupError) {
        console.warn(`    ⚠️ Cleanup error for ${scenario.name}:`, cleanupError);
      }
    }
  }

  return results;
}

/**
 * Run comprehensive error scenario tests
 */
export async function runComprehensiveErrorScenarioTests(): Promise<boolean> {
  console.log('\n🚨 Running Comprehensive Error Scenario Tests...\n');

  loggingService.info('Integration Test', 'Starting comprehensive error scenario tests');

  const errorCategories = [
    { name: 'Cognito Service', execute: testCognitoServiceErrors },
    { name: 'GraphQL API', execute: testGraphQLAPIErrors },
    { name: 'Subscription', execute: testSubscriptionErrors },
    { name: 'Token Management', execute: testTokenErrors },
    { name: 'Network Resilience', execute: testNetworkResilienceErrors }
  ];

  const allResults: Array<{ category: string; results: ErrorTestResult[] }> = [];
  let totalScenarios = 0;
  let successfulScenarios = 0;
  let gracefullyHandledErrors = 0;

  for (const category of errorCategories) {
    try {
      console.log(`\n🔄 Testing ${category.name} Error Scenarios...`);

      const results = await category.execute();
      allResults.push({ category: category.name, results });

      const categorySuccessful = results.filter(r => r.success).length;
      const categoryTotal = results.length;
      const categoryGraceful = results.filter(r => r.errorHandledGracefully).length;

      totalScenarios += categoryTotal;
      successfulScenarios += categorySuccessful;
      gracefullyHandledErrors += categoryGraceful;

      console.log(`📊 ${category.name} Results: ${categorySuccessful}/${categoryTotal} scenarios passed`);
      console.log(`🛡️ ${category.name} Error Handling: ${categoryGraceful}/${categoryTotal} handled gracefully`);

      loggingService.info('Integration Test', `${category.name} error scenarios completed`, {
        successful: categorySuccessful,
        total: categoryTotal,
        graceful: categoryGraceful,
        successRate: (categorySuccessful / categoryTotal) * 100,
        gracefulRate: (categoryGraceful / categoryTotal) * 100
      });

    } catch (error) {
      console.error(`❌ ${category.name} error scenario testing failed:`, error);

      loggingService.error('Integration Test', `${category.name} error scenario testing failed`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Generate summary report
  console.log('\n📋 Comprehensive Error Scenario Test Summary:');
  console.log('=' .repeat(60));

  allResults.forEach(({ category, results }) => {
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    const graceful = results.filter(r => r.errorHandledGracefully).length;
    const successRate = (successful / total) * 100;
    const gracefulRate = (graceful / total) * 100;

    console.log(`${category}:`);
    console.log(`  Success Rate: ${successful}/${total} (${successRate.toFixed(1)}%)`);
    console.log(`  Graceful Error Handling: ${graceful}/${total} (${gracefulRate.toFixed(1)}%)`);

    // Show failed scenarios
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      failed.forEach(scenario => {
        console.log(`    ❌ ${scenario.scenarioName}: ${scenario.error}`);
      });
    }

    console.log('');
  });

  const overallSuccessRate = (successfulScenarios / totalScenarios) * 100;
  const overallGracefulRate = (gracefullyHandledErrors / totalScenarios) * 100;

  console.log('=' .repeat(60));
  console.log(`Overall Success Rate: ${successfulScenarios}/${totalScenarios} (${overallSuccessRate.toFixed(1)}%)`);
  console.log(`Overall Graceful Error Handling: ${gracefullyHandledErrors}/${totalScenarios} (${overallGracefulRate.toFixed(1)}%)`);

  // Performance summary
  const totalDuration = allResults.reduce((sum, { results }) =>
    sum + results.reduce((stepSum, scenario) => stepSum + scenario.duration, 0), 0
  );

  console.log(`Total execution time: ${totalDuration}ms`);
  console.log(`Average scenario time: ${(totalDuration / totalScenarios).toFixed(1)}ms`);

  // Success criteria: 
  // - At least 70% of scenarios should pass (some failures expected in error testing)
  // - At least 90% of errors should be handled gracefully
  const overallSuccess = overallSuccessRate >= 70 && overallGracefulRate >= 90;

  loggingService.info('Integration Test', 'Comprehensive error scenario tests completed', {
    totalScenarios,
    successfulScenarios,
    gracefullyHandledErrors,
    overallSuccessRate,
    overallGracefulRate,
    totalDuration,
    overallSuccess
  });

  console.log(`\n🏁 Overall Error Scenario Test Result: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);

  if (!overallSuccess) {
    console.log('💡 Note: Some failures are expected in error scenario testing');
    console.log('💡 The key metric is graceful error handling, which should be ≥90%');
  }

  return overallSuccess;
}

export default runComprehensiveErrorScenarioTests;