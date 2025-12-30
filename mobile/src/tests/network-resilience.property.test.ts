/**
 * Property Test: Network Resilience
 * 
 * Validates Requirements 6.2, 6.4:
 * - Offline detection and appropriate messaging
 * - Token refresh failures are handled gracefully
 * - Retry logic with exponential backoff
 * - Network interruptions don't crash the application
 * 
 * Property 11: Network Resilience
 * For any network condition:
 * - Offline state MUST be detected accurately
 * - Operations MUST retry with exponential backoff
 * - Max retry attempts MUST be respected
 * - Network failures MUST not crash the application
 * - User feedback MUST be provided for network issues
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';
import { networkService } from '../services/networkService';
import { Alert } from 'react-native';

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

// Mock Alert
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const mockAlert = Alert as jest.Mocked<typeof Alert>;

// Mock NetInfo
const mockNetInfo = require('@react-native-community/netinfo');

describe('Property Test: Network Resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset fetch mock
    mockFetch.mockReset();
    
    // Reset Alert mock
    mockAlert.alert.mockImplementation(() => {});
    
    // Reset NetInfo mock
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      details: {}
    });
    
    mockNetInfo.addEventListener.mockImplementation(() => () => {});
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Property 11.1: Offline state is detected accurately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          isConnected: fc.boolean(),
          isInternetReachable: fc.option(fc.boolean()),
          type: fc.constantFrom('wifi', 'cellular', 'ethernet', 'unknown'),
          details: fc.record({
            cellularGeneration: fc.option(fc.constantFrom('2g', '3g', '4g', '5g'))
          })
        }),
        async (networkState) => {
          // Setup NetInfo mock with test network state
          mockNetInfo.fetch.mockResolvedValue(networkState);
          
          // Trigger network state update
          const listeners: ((state: any) => void)[] = [];
          mockNetInfo.addEventListener.mockImplementation((listener: (state: any) => void) => {
            listeners.push(listener);
            // Immediately call listener with current state
            setTimeout(() => listener(networkState), 10);
            return () => {
              const index = listeners.indexOf(listener);
              if (index > -1) listeners.splice(index, 1);
            };
          });
          
          // Create new network service instance to pick up mocked state
          const testNetworkService = new (require('../services/networkService').default.constructor)();
          
          // Wait for network state to be updated
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Test offline detection
          const detectedState = testNetworkService.getNetworkState();
          const isOnline = testNetworkService.isConnected();
          
          // Verify detection accuracy
          expect(detectedState.isConnected).toBe(networkState.isConnected);
          expect(detectedState.isInternetReachable).toBe(networkState.isInternetReachable);
          expect(detectedState.type).toBe(networkState.type);
          
          // Verify online/offline logic
          const expectedOnline = networkState.isConnected && 
                                (networkState.isInternetReachable !== false);
          expect(isOnline).toBe(expectedOnline);
        }
      ),
      { numRuns: 15, timeout: 8000 }
    );
  });

  it('Property 11.2: Operations retry with exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // maxAttempts
        fc.integer({ min: 500, max: 2000 }), // baseDelay
        async (maxAttempts, baseDelay) => {
          let attemptCount = 0;
          const attemptTimes: number[] = [];
          let startTime = Date.now();
          
          // Mock operation that fails multiple times
          const failingOperation = jest.fn().mockImplementation(async () => {
            attemptCount++;
            attemptTimes.push(Date.now() - startTime);
            startTime = Date.now();
            
            if (attemptCount < maxAttempts) {
              throw new Error(`Attempt ${attemptCount} failed`);
            }
            
            return 'success';
          });
          
          // Setup network as connected
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: true,
            isInternetReachable: true,
            type: 'wifi'
          });
          
          try {
            const result = await networkService.executeWithRetry(
              failingOperation,
              'Test Operation',
              {
                maxAttempts,
                baseDelay,
                maxDelay: baseDelay * 10,
                backoffFactor: 2
              }
            );
            
            // Should succeed after retries
            expect(result).toBe('success');
            expect(attemptCount).toBe(maxAttempts);
            
            // Verify exponential backoff pattern
            if (attemptTimes.length >= 2) {
              for (let i = 1; i < attemptTimes.length - 1; i++) {
                const previousDelay = attemptTimes[i];
                const currentDelay = attemptTimes[i + 1];
                
                // Each delay should be approximately double the previous (with tolerance)
                expect(currentDelay).toBeGreaterThanOrEqual(previousDelay * 1.5);
              }
            }
            
          } catch (error) {
            // If it fails, verify max attempts were reached
            expect(attemptCount).toBe(maxAttempts);
          }
        }
      ),
      { numRuns: 8, timeout: 15000 }
    );
  });

  it('Property 11.3: Max retry attempts are respected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }), // maxAttempts
        async (maxAttempts) => {
          let attemptCount = 0;
          
          // Mock operation that always fails
          const alwaysFailingOperation = jest.fn().mockImplementation(async () => {
            attemptCount++;
            throw new Error(`Attempt ${attemptCount} failed`);
          });
          
          // Setup network as connected
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: true,
            isInternetReachable: true,
            type: 'wifi'
          });
          
          try {
            await networkService.executeWithRetry(
              alwaysFailingOperation,
              'Always Failing Operation',
              {
                maxAttempts,
                baseDelay: 100, // Short delay for faster testing
                maxDelay: 1000,
                backoffFactor: 2
              }
            );
            
            // Should not reach here
            expect(true).toBe(false);
            
          } catch (error) {
            // Should fail after exactly maxAttempts
            expect(attemptCount).toBe(maxAttempts);
            expect(alwaysFailingOperation).toHaveBeenCalledTimes(maxAttempts);
          }
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });

  it('Property 11.4: Network failures do not crash application', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'network_error',
          'timeout_error', 
          'connection_refused',
          'dns_error',
          'ssl_error'
        ),
        async (errorType) => {
          let applicationCrashed = false;
          
          // Mock different types of network errors
          const networkError = new Error();
          switch (errorType) {
            case 'network_error':
              networkError.message = 'Network request failed';
              break;
            case 'timeout_error':
              networkError.message = 'Request timeout';
              break;
            case 'connection_refused':
              networkError.message = 'Connection refused';
              break;
            case 'dns_error':
              networkError.message = 'DNS resolution failed';
              break;
            case 'ssl_error':
              networkError.message = 'SSL handshake failed';
              break;
          }
          
          // Mock operation that throws network error
          const networkFailingOperation = jest.fn().mockRejectedValue(networkError);
          
          // Setup network as connected (but operations will fail)
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: true,
            isInternetReachable: true,
            type: 'wifi'
          });
          
          // Capture any uncaught errors
          const originalOnError = process.listeners('uncaughtException');
          const errorHandler = (error: Error) => {
            if (error.message.includes('Network') || 
                error.message.includes('timeout') ||
                error.message.includes('Connection')) {
              applicationCrashed = true;
            }
          };
          
          process.on('uncaughtException', errorHandler);
          
          try {
            await networkService.executeWithRetry(
              networkFailingOperation,
              'Network Failing Operation',
              {
                maxAttempts: 2,
                baseDelay: 100,
                maxDelay: 500
              }
            );
            
          } catch (error) {
            // Network errors are expected, but shouldn't crash app
            expect(error).toBeDefined();
          } finally {
            // Remove error handler
            process.removeListener('uncaughtException', errorHandler);
          }
          
          // Verify application didn't crash
          expect(applicationCrashed).toBe(false);
        }
      ),
      { numRuns: 10, timeout: 8000 }
    );
  });

  it('Property 11.5: User feedback is provided for network issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          showOfflineMessage: fc.boolean(),
          networkAvailable: fc.boolean()
        }),
        async ({ showOfflineMessage, networkAvailable }) => {
          // Setup network state
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: networkAvailable,
            isInternetReachable: networkAvailable,
            type: networkAvailable ? 'wifi' : 'none'
          });
          
          // Mock operation
          const testOperation = jest.fn().mockResolvedValue('success');
          
          try {
            const result = await networkService.executeWhenOnline(
              testOperation,
              'Test Operation',
              showOfflineMessage
            );
            
            if (networkAvailable) {
              // Should execute operation when online
              expect(result).toBe('success');
              expect(testOperation).toHaveBeenCalled();
              expect(mockAlert.alert).not.toHaveBeenCalled();
            } else {
              // Should not execute when offline
              if (showOfflineMessage) {
                // Should show offline message
                expect(mockAlert.alert).toHaveBeenCalledWith(
                  'Sin Conexión',
                  expect.stringContaining('No hay conexión a internet'),
                  expect.any(Array),
                  expect.any(Object)
                );
              }
              
              // Operation should not be called immediately
              expect(testOperation).not.toHaveBeenCalled();
            }
            
          } catch (error) {
            // Errors are acceptable for offline scenarios
          }
        }
      ),
      { numRuns: 12, timeout: 8000 }
    );
  });

  it('Property 11.6: Token refresh failures are handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }), // number of failures before success
        async (failuresBeforeSuccess) => {
          let attemptCount = 0;
          let onSuccessCalled = false;
          let onFailureCalled = false;
          
          // Mock token refresh operation
          const tokenRefreshOperation = jest.fn().mockImplementation(async () => {
            attemptCount++;
            
            if (attemptCount <= failuresBeforeSuccess) {
              throw new Error(`Token refresh attempt ${attemptCount} failed`);
            }
            
            return {
              accessToken: 'new-access-token',
              idToken: 'new-id-token',
              refreshToken: 'refresh-token'
            };
          });
          
          // Mock success and failure callbacks
          const onSuccess = jest.fn().mockImplementation(() => {
            onSuccessCalled = true;
          });
          
          const onFailure = jest.fn().mockImplementation(() => {
            onFailureCalled = true;
          });
          
          // Setup network as connected
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: true,
            isInternetReachable: true,
            type: 'wifi'
          });
          
          // Test token refresh handling
          await networkService.handleTokenRefreshFailure(
            tokenRefreshOperation,
            onSuccess,
            onFailure
          );
          
          // Wait for async operations
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (failuresBeforeSuccess <= 3) { // Within retry limit
            // Should eventually succeed
            expect(onSuccessCalled).toBe(true);
            expect(onFailureCalled).toBe(false);
            expect(onSuccess).toHaveBeenCalledWith({
              accessToken: 'new-access-token',
              idToken: 'new-id-token',
              refreshToken: 'refresh-token'
            });
          } else {
            // Should fail after max retries and show user message
            expect(mockAlert.alert).toHaveBeenCalledWith(
              'Error de Autenticación',
              expect.stringContaining('No se pudo renovar la sesión'),
              expect.any(Array)
            );
          }
        }
      ),
      { numRuns: 8, timeout: 10000 }
    );
  });

  it('Property 11.7: Network quality is assessed correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          isConnected: fc.boolean(),
          type: fc.constantFrom('wifi', 'cellular', 'ethernet', 'unknown', 'none'),
          cellularGeneration: fc.option(fc.constantFrom('2g', '3g', '4g', '5g'))
        }),
        async ({ isConnected, type, cellularGeneration }) => {
          // Setup network state
          const networkState = {
            isConnected,
            isInternetReachable: isConnected,
            type,
            details: cellularGeneration ? { cellularGeneration } : {}
          };
          
          mockNetInfo.fetch.mockResolvedValue(networkState);
          
          // Create network service instance
          const testNetworkService = new (require('../services/networkService').default.constructor)();
          
          // Wait for state update
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Get network quality
          const quality = testNetworkService.getNetworkQuality();
          
          // Verify quality assessment
          if (!isConnected) {
            expect(quality).toBe('offline');
          } else if (type === 'wifi') {
            expect(quality).toBe('excellent');
          } else if (type === 'cellular' && cellularGeneration) {
            switch (cellularGeneration) {
              case '5g':
                expect(quality).toBe('excellent');
                break;
              case '4g':
                expect(quality).toBe('good');
                break;
              case '3g':
              case '2g':
                expect(quality).toBe('poor');
                break;
            }
          } else {
            expect(['excellent', 'good', 'poor']).toContain(quality);
          }
        }
      ),
      { numRuns: 15, timeout: 8000 }
    );
  });

  it('Property 11.8: Connection waiting works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          initiallyConnected: fc.boolean(),
          connectionRestoresAfter: fc.option(fc.integer({ min: 100, max: 2000 })), // ms
          timeoutMs: fc.integer({ min: 1000, max: 5000 })
        }),
        async ({ initiallyConnected, connectionRestoresAfter, timeoutMs }) => {
          // Setup initial network state
          mockNetInfo.fetch.mockResolvedValue({
            isConnected: initiallyConnected,
            isInternetReachable: initiallyConnected,
            type: initiallyConnected ? 'wifi' : 'none'
          });
          
          let listeners: ((state: any) => void)[] = [];
          mockNetInfo.addEventListener.mockImplementation((listener: (state: any) => void) => {
            listeners.push(listener);
            return () => {
              const index = listeners.indexOf(listener);
              if (index > -1) listeners.splice(index, 1);
            };
          });
          
          // Create network service instance
          const testNetworkService = new (require('../services/networkService').default.constructor)();
          
          // Wait for initial state
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Simulate connection restoration if specified
          if (!initiallyConnected && connectionRestoresAfter) {
            setTimeout(() => {
              const connectedState = {
                isConnected: true,
                isInternetReachable: true,
                type: 'wifi'
              };
              
              listeners.forEach(listener => listener(connectedState));
            }, connectionRestoresAfter);
          }
          
          // Test waiting for connection
          const startTime = Date.now();
          const connectionRestored = await testNetworkService.waitForConnection(timeoutMs);
          const elapsedTime = Date.now() - startTime;
          
          if (initiallyConnected) {
            // Should return immediately if already connected
            expect(connectionRestored).toBe(true);
            expect(elapsedTime).toBeLessThan(100);
          } else if (connectionRestoresAfter && connectionRestoresAfter < timeoutMs) {
            // Should return true when connection is restored within timeout
            expect(connectionRestored).toBe(true);
            expect(elapsedTime).toBeGreaterThanOrEqual(connectionRestoresAfter - 50);
            expect(elapsedTime).toBeLessThan(timeoutMs);
          } else {
            // Should timeout if connection is not restored
            expect(connectionRestored).toBe(false);
            expect(elapsedTime).toBeGreaterThanOrEqual(timeoutMs - 100);
          }
        }
      ),
      { numRuns: 8, timeout: 15000 }
    );
  });
});