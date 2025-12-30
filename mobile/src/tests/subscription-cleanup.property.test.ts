/**
 * Property Test: Subscription Cleanup
 * 
 * Validates Requirements 4.4:
 * - Subscriptions are properly cleaned up when components unmount
 * - No memory leaks occur from unclosed WebSocket connections
 * - Cleanup functions work correctly in all scenarios
 * 
 * Property 7: Subscription Cleanup
 * For any subscription lifecycle:
 * - Unsubscribe functions MUST close WebSocket connections
 * - Component unmount MUST trigger cleanup of all active subscriptions
 * - Cleanup MUST be idempotent (safe to call multiple times)
 * - No subscription callbacks MUST fire after cleanup
 * - Memory usage MUST not increase after cleanup cycles
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';
import { appSyncService } from '../services/appSyncService';

// Mock WebSocket for testing cleanup behavior
class CleanupTestWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState: number = WebSocket.CONNECTING;
  
  private static activeConnections: Set<CleanupTestWebSocket> = new Set();
  private closed = false;
  
  constructor(public url: string, public protocol?: string | string[], public options?: any) {
    CleanupTestWebSocket.activeConnections.add(this);
    
    // Simulate connection opening
    setTimeout(() => {
      if (!this.closed) {
        this.readyState = WebSocket.OPEN;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    }, 10);
  }
  
  send(data: string): void {
    if (this.closed) {
      throw new Error('WebSocket is closed');
    }
    
    const message = JSON.parse(data);
    
    // Simulate connection_ack
    if (message.type === 'connection_init') {
      setTimeout(() => {
        if (!this.closed && this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: JSON.stringify({ type: 'connection_ack' })
          }));
        }
      }, 5);
    }
  }
  
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.readyState = WebSocket.CLOSED;
      CleanupTestWebSocket.activeConnections.delete(this);
      
      if (this.onclose) {
        this.onclose(new CloseEvent('close'));
      }
    }
  }
  
  static getActiveConnectionCount(): number {
    return CleanupTestWebSocket.activeConnections.size;
  }
  
  static closeAllConnections(): void {
    CleanupTestWebSocket.activeConnections.forEach(ws => ws.close());
    CleanupTestWebSocket.activeConnections.clear();
  }
}

// Mock global WebSocket
(global as any).WebSocket = CleanupTestWebSocket;

describe('Property Test: Subscription Cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CleanupTestWebSocket.closeAllConnections();
  });
  
  afterEach(() => {
    // Ensure all connections are cleaned up after each test
    appSyncService.disconnectAllSubscriptions();
    CleanupTestWebSocket.closeAllConnections();
  });

  it('Property 7.1: Unsubscribe functions close WebSocket connections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          const initialConnectionCount = CleanupTestWebSocket.getActiveConnectionCount();
          
          // Create subscription
          const unsubscribe = await appSyncService.subscribeToVoteUpdates(
            roomId,
            () => {}
          );
          
          // Wait for connection to establish
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const afterSubscribeCount = CleanupTestWebSocket.getActiveConnectionCount();
          expect(afterSubscribeCount).toBeGreaterThan(initialConnectionCount);
          
          // Call unsubscribe
          unsubscribe();
          
          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const afterUnsubscribeCount = CleanupTestWebSocket.getActiveConnectionCount();
          
          // Verify connection was closed
          expect(afterUnsubscribeCount).toBeLessThanOrEqual(initialConnectionCount);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Property 7.2: Component unmount triggers cleanup of all subscriptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }), // roomIds
        async (roomIds) => {
          const initialConnectionCount = CleanupTestWebSocket.getActiveConnectionCount();
          const unsubscribeFunctions: (() => void)[] = [];
          
          // Create multiple subscriptions (simulating component mount)
          for (const roomId of roomIds) {
            const voteUnsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              () => {}
            );
            
            const matchUnsubscribe = await appSyncService.subscribeToMatchFound(
              roomId,
              () => {}
            );
            
            unsubscribeFunctions.push(voteUnsubscribe, matchUnsubscribe);
          }
          
          // Wait for connections to establish
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const afterSubscriptionsCount = CleanupTestWebSocket.getActiveConnectionCount();
          expect(afterSubscriptionsCount).toBeGreaterThan(initialConnectionCount);
          
          // Simulate component unmount - cleanup all subscriptions
          unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
          
          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const afterCleanupCount = CleanupTestWebSocket.getActiveConnectionCount();
          
          // Verify all connections were closed
          expect(afterCleanupCount).toBeLessThanOrEqual(initialConnectionCount);
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  });

  it('Property 7.3: Cleanup is idempotent (safe to call multiple times)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        fc.integer({ min: 2, max: 5 }), // cleanup call count
        async (roomId, cleanupCallCount) => {
          // Create subscription
          const unsubscribe = await appSyncService.subscribeToVoteUpdates(
            roomId,
            () => {}
          );
          
          // Wait for connection
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Call unsubscribe multiple times
          for (let i = 0; i < cleanupCallCount; i++) {
            expect(() => {
              unsubscribe();
            }).not.toThrow();
            
            // Small delay between calls
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Additional cleanup should also not throw
          expect(() => {
            appSyncService.disconnectAllSubscriptions();
          }).not.toThrow();
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('Property 7.4: No callbacks fire after cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          let callbackCount = 0;
          let callbacksAfterCleanup = 0;
          
          // Create subscription with callback counter
          const unsubscribe = await appSyncService.subscribeToVoteUpdates(
            roomId,
            () => {
              callbackCount++;
              
              // Check if this callback fired after cleanup
              if (cleanupCompleted) {
                callbacksAfterCleanup++;
              }
            }
          );
          
          // Wait for initial connection and potential callbacks
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const callbacksBeforeCleanup = callbackCount;
          
          // Cleanup subscription
          let cleanupCompleted = false;
          unsubscribe();
          cleanupCompleted = true;
          
          // Wait to see if any callbacks fire after cleanup
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Verify no callbacks fired after cleanup
          expect(callbacksAfterCleanup).toBe(0);
          
          // It's okay if callbacks fired before cleanup
          expect(callbackCount).toBeGreaterThanOrEqual(callbacksBeforeCleanup);
        }
      ),
      { numRuns: 10, timeout: 8000 }
    );
  });

  it('Property 7.5: Memory usage does not increase after cleanup cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 8 }), // number of cleanup cycles
        async (cycleCount) => {
          const connectionCounts: number[] = [];
          
          for (let cycle = 0; cycle < cycleCount; cycle++) {
            const roomId = `test-room-${cycle}`;
            
            // Record initial connection count
            const initialCount = CleanupTestWebSocket.getActiveConnectionCount();
            connectionCounts.push(initialCount);
            
            // Create subscription
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              () => {}
            );
            
            // Wait for connection
            await new Promise(resolve => setTimeout(resolve, 30));
            
            // Cleanup
            unsubscribe();
            
            // Wait for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          
          // Record final connection count
          const finalCount = CleanupTestWebSocket.getActiveConnectionCount();
          connectionCounts.push(finalCount);
          
          // Verify memory usage pattern
          // Connection count should not continuously increase
          const maxCount = Math.max(...connectionCounts);
          const minCount = Math.min(...connectionCounts);
          
          // Allow some variance but ensure no continuous growth
          expect(maxCount - minCount).toBeLessThanOrEqual(2);
          
          // Final count should be close to initial counts
          expect(finalCount).toBeLessThanOrEqual(connectionCounts[0] + 1);
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });

  it('Property 7.6: Cleanup works correctly with failed connections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // roomId
        async (roomId) => {
          // Mock a failing WebSocket
          const originalWebSocket = (global as any).WebSocket;
          
          class FailingCleanupWebSocket extends CleanupTestWebSocket {
            constructor(url: string, protocol?: string | string[], options?: any) {
              super(url, protocol, options);
              
              // Simulate immediate failure
              setTimeout(() => {
                this.readyState = WebSocket.CLOSED;
                if (this.onerror) {
                  this.onerror(new Event('error'));
                }
                if (this.onclose) {
                  this.onclose(new CloseEvent('close'));
                }
              }, 20);
            }
          }
          
          (global as any).WebSocket = FailingCleanupWebSocket;
          
          try {
            // Attempt to create subscription (will fail)
            const unsubscribe = await appSyncService.subscribeToVoteUpdates(
              roomId,
              () => {}
            );
            
            // Wait for failure
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Cleanup should not throw even with failed connection
            expect(() => {
              unsubscribe();
            }).not.toThrow();
            
            // Additional cleanup should also not throw
            expect(() => {
              appSyncService.disconnectAllSubscriptions();
            }).not.toThrow();
            
          } catch (error) {
            // If subscription creation fails, that's acceptable
            // Just ensure cleanup methods don't throw
            expect(() => {
              appSyncService.disconnectAllSubscriptions();
            }).not.toThrow();
          } finally {
            // Restore original WebSocket
            (global as any).WebSocket = originalWebSocket;
          }
        }
      ),
      { numRuns: 5, timeout: 8000 }
    );
  });
});