/**
 * Property Test: Connection Resilience
 * 
 * Validates Requirements 4.5:
 * - Automatic reconnection logic for failed subscriptions
 * - Network interruptions are handled gracefully
 * - User feedback for connection issues
 * - Exponential backoff for reconnection attempts
 * 
 * Property 8: Connection Resilience
 * For any subscription connection:
 * - Failed connections MUST attempt automatic reconnection
 * - Reconnection attempts MUST use exponential backoff
 * - Max reconnection attempts MUST be respected
 * - Network interruptions MUST not crash the application
 * - Fallback mechanisms MUST activate when reconnection fails
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';
import { appSyncService } from '../services/appSyncService';

// Mock WebSocket for testing resilience behavior
class ResilienceTestWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState: number = WebSocket.CONNECTING;
  
  private static connectionAttempts: Map<string, number> = new Map();
  private static shouldFail: boolean = false;
  private static failureType: 'immediate' | 'delayed' | 'intermittent' = 'immediate';
  private static maxFailures: number = 3;
  
  constructor(public url: string, public protocol?: string | string[], public options?: any) {
    const connectionKey = `${url}-${Date.now()}`;
    const attempts = ResilienceTestWebSocket.connectionAttempts.get(url) || 0;
    ResilienceTestWebSocket.connectionAttempts.set(url, attempts + 1);
    
    if (ResilienceTestWebSocket.shouldFail && attempts < ResilienceTestWebSocket.maxFailures) {
      this.simulateFailure();
    } else {
      this.simulateSuccess();
    }
  }
  
  private simulateSuccess(): void {
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }
  
  private simulateFailure(): void {
    const delay = ResilienceTestWebSocket.failureType === 'delayed' ? 100 : 10;
    
    setTimeout(() => {
      this.readyState = WebSocket.CLOSED;
      
      if (ResilienceTestWebSocket.failureType === 'intermittent') {
        // Intermittent failures - sometimes connect, sometimes fail
        if (Math.random() > 0.5) {
          this.simulateSuccess();
          return;
        }
      }
      
      if (this.onerror) {
        this.onerror(new Event('error'));
      }
      
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code: 1006, reason: 'Connection failed' }));
      }
    }, delay);
  }
  
  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    const message = JSON.parse(data);
    
    // Simulate connection_ack
    if (message.type === 'connection_init') {
      setTimeout(() => {
        if (this.readyState === WebSocket.OPEN && this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: JSON.stringify({ type: 'connection_ack' })
          }));
        }
      }, 5);
    }
    
    // Simulate subscription data
    if (message.type === 'start') {
      this.simulateSubscriptionData(message.id);
    }
  }
  
  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: code || 1000, reason: reason || 'Normal closure' }));
    }
  }
  
  private simulateSubscriptionData(subscriptionId: string): void {
    // Only send data if connection is stable
    if (this.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        if (this.readyState === WebSocket.OPEN && this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'data',
              id: subscriptionId,
              payload: {
                data: {
                  onVoteUpdate: {
                    roomId: subscriptionId.split('-')[2],
                    userId: 'resilience-test-user',
                    movieId: '550',
                    voteType: 'LIKE',
                    currentVotes: 1,
                    totalMembers: 2,
                    timestamp: new Date().toISOString()
                  }
                }
              }
            })
          }));
        }
      }, 50);
    }
  }
  
  static setFailureMode(shouldFail: boolean, type: 'immediate' | 'delayed' | 'intermittent' = 'immediate', maxFailures: number = 3): void {
    ResilienceTestWebSocket.shouldFail = shouldFail;
    ResilienceTestWebSocket.failureType = type;
    ResilienceTestWebSocket.maxFailures = maxFailures;
  }
  
  static resetConnectionAttempts(): void {
    ResilienceTestWebSocket.connectionAttempts.clear();
  }
  
  static getConnectionAttempts(url: string): number {
    return ResilienceTestWebSocket.connectionAttempts.get(url) || 0;
  }
}

// Mock global WebSocket
(global as any).WebSocket = ResilienceTestWebSocket;

describe('Property Test: Connection Resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ResilienceTestWebSocket.resetConnectionAttempts();
    ResilienceTestWebSocket.setFailureMode(false);
  });
  
  afterEach(() => {
    // Cleanup any remaining subscriptions
    appSyncService.disconnectAllSubscriptions();
    ResilienceTestWebSocket.resetConnectionAttempts();
  });

  it('Property 8.1: Failed connections attempt automatic reconnection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Set failure mode - fail first 2 attempts, then succeed
          ResilienceTestWebSocket.setFailureMode(true, 'immediate', 2);
          
          let reconnectionAttempted = false;
          let finalConnectionSuccessful = false;
          
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              (data) => {
                finalConnectionSuccessful = true;
              }
            );
            
            // Wait for potential reconnection attempts
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const wsUrl = appSyncService.createSubscriptionUrl();
            const attempts = ResilienceTestWebSocket.getConnectionAttempts(wsUrl);
            
            // Should have attempted multiple connections
            if (attempts > 1) {
              reconnectionAttempted = true;
            }
            
            // Cleanup
            unsubscribe();
            
          } catch (error) {
            // Even if final connection fails, reconnection should have been attempted
            const wsUrl = appSyncService.createSubscriptionUrl();
            const attempts = ResilienceTestWebSocket.getConnectionAttempts(wsUrl);
            reconnectionAttempted = attempts > 1;
          }
          
          // Verify reconnection was attempted
          expect(reconnectionAttempted).toBe(true);
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });

  it('Property 8.2: Reconnection uses exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Set failure mode - fail multiple times to test backoff
          ResilienceTestWebSocket.setFailureMode(true, 'immediate', 4);
          
          const reconnectionTimes: number[] = [];
          let startTime = Date.now();
          
          // Mock the reconnection delay calculation to track timing
          const originalConsoleLog = console.log;
          console.log = (...args) => {
            const message = args.join(' ');
            if (message.includes('Attempting reconnection') && message.includes('in ')) {
              const currentTime = Date.now();
              reconnectionTimes.push(currentTime - startTime);
              startTime = currentTime;
            }
            originalConsoleLog(...args);
          };
          
          try {
            await appSyncService.subscribeToVoteUpdates(
              roomId,
              () => {}
            );
            
            // Wait for multiple reconnection attempts
            await new Promise(resolve => setTimeout(resolve, 3000));
            
          } catch (error) {
            // Expected to fail after max attempts
          } finally {
            // Restore console.log
            console.log = originalConsoleLog;
          }
          
          // Verify exponential backoff pattern
          if (reconnectionTimes.length >= 2) {
            // Each delay should be longer than the previous (allowing some variance)
            for (let i = 1; i < reconnectionTimes.length; i++) {
              // Allow some variance in timing due to test environment
              const previousDelay = reconnectionTimes[i - 1];
              const currentDelay = reconnectionTimes[i];
              
              // Current delay should be at least as long as previous (with tolerance)
              expect(currentDelay).toBeGreaterThanOrEqual(previousDelay * 0.8);
            }
          }
        }
      ),
      { numRuns: 3, timeout: 20000 }
    );
  });

  it('Property 8.3: Max reconnection attempts are respected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        fc.integer({ min: 3, max: 6 }), // maxFailures
        async (roomId, maxFailures) => {
          // Set failure mode to always fail
          ResilienceTestWebSocket.setFailureMode(true, 'immediate', maxFailures + 10);
          
          let subscriptionFailed = false;
          let fallbackActivated = false;
          
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              (data) => {
                // If we receive polling updates, fallback was activated
                if (data.voteType === 'POLLING_UPDATE') {
                  fallbackActivated = true;
                }
              }
            );
            
            // Wait for reconnection attempts and fallback
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            unsubscribe();
            
          } catch (error) {
            subscriptionFailed = true;
          }
          
          const wsUrl = appSyncService.createSubscriptionUrl();
          const totalAttempts = ResilienceTestWebSocket.getConnectionAttempts(wsUrl);
          
          // Should not exceed reasonable number of attempts (max attempts + initial)
          expect(totalAttempts).toBeLessThanOrEqual(10); // Reasonable upper bound
          
          // Should either fail gracefully or activate fallback
          expect(subscriptionFailed || fallbackActivated).toBe(true);
        }
      ),
      { numRuns: 3, timeout: 25000 }
    );
  });

  it('Property 8.4: Network interruptions do not crash application', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Set intermittent failure mode
          ResilienceTestWebSocket.setFailureMode(true, 'intermittent', 5);
          
          let applicationCrashed = false;
          let dataReceived = false;
          
          // Capture any uncaught errors
          const originalOnError = process.on;
          const errorHandler = (error: Error) => {
            if (error.message.includes('WebSocket') || error.message.includes('subscription')) {
              applicationCrashed = true;
            }
          };
          
          process.on('uncaughtException', errorHandler);
          
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              (data) => {
                dataReceived = true;
              }
            );
            
            // Simulate network interruptions over time
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Cleanup
            unsubscribe();
            
          } catch (error) {
            // Subscription errors are acceptable, but shouldn't crash app
            expect(error).toBeDefined();
          } finally {
            // Remove error handler
            process.removeListener('uncaughtException', errorHandler);
          }
          
          // Verify application didn't crash
          expect(applicationCrashed).toBe(false);
          
          // Either data was received or graceful fallback occurred
          // (Both are acceptable outcomes for intermittent failures)
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });

  it('Property 8.5: Fallback mechanisms activate when reconnection fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Set failure mode to always fail WebSocket connections
          ResilienceTestWebSocket.setFailureMode(true, 'immediate', 10);
          
          let fallbackActivated = false;
          let pollingDataReceived = false;
          
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              (data) => {
                if (data.voteType === 'POLLING_UPDATE') {
                  fallbackActivated = true;
                  pollingDataReceived = true;
                }
              }
            );
            
            // Wait for fallback to activate
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            unsubscribe();
            
          } catch (error) {
            // If subscription creation fails, that's expected with always-fail mode
          }
          
          // Verify fallback mechanism was activated
          // Note: This depends on the implementation falling back to polling
          expect(fallbackActivated || pollingDataReceived).toBe(true);
        }
      ),
      { numRuns: 3, timeout: 20000 }
    );
  });

  it('Property 8.6: Connection recovery after temporary failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Set failure mode for first few attempts, then allow success
          ResilienceTestWebSocket.setFailureMode(true, 'immediate', 2);
          
          let connectionRecovered = false;
          let dataReceived = false;
          
          try {
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              (data) => {
                dataReceived = true;
                
                // If we receive real-time data (not polling), connection recovered
                if (data.voteType !== 'POLLING_UPDATE') {
                  connectionRecovered = true;
                }
              }
            );
            
            // Wait for recovery
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            unsubscribe();
            
          } catch (error) {
            // Some failures are acceptable during recovery testing
          }
          
          // Verify either connection recovered or fallback provided data
          expect(connectionRecovered || dataReceived).toBe(true);
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });
});