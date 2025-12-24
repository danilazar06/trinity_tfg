import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AuthService } from '../../modules/auth/auth.service';
import { RoomService } from '../../modules/room/room.service';
import { RoomAutomationService } from '../../modules/room-automation/room-automation.service';
import { PermissionService } from '../../modules/permission/permission.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { RealtimeService } from '../../modules/realtime/realtime.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import * as fc from 'fast-check';

describe('Performance Validation Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let roomService: RoomService;
  let automationService: RoomAutomationService;
  let permissionService: PermissionService;
  let analyticsService: AnalyticsService;
  let realtimeService: RealtimeService;
  let multiTableService: MultiTableService;

  let testUser: any;
  let testRoom: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    authService = moduleFixture.get<AuthService>(AuthService);
    roomService = moduleFixture.get<RoomService>(RoomService);
    automationService = moduleFixture.get<RoomAutomationService>(RoomAutomationService);
    permissionService = moduleFixture.get<PermissionService>(PermissionService);
    analyticsService = moduleFixture.get<AnalyticsService>(AnalyticsService);
    realtimeService = moduleFixture.get<RealtimeService>(RealtimeService);
    multiTableService = moduleFixture.get<MultiTableService>(MultiTableService);

    // Create test user and room
    testUser = await authService.register({
      email: 'performance@test.com',
      password: 'TestPass123!',
      username: 'performanceuser',
    });

    testRoom = await roomService.createRoom(testUser.user.id, {
      name: 'Performance Test Room',
      description: 'Room for performance testing',
      isPrivate: false,
      maxMembers: 10,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('API Response Time Requirements (< 300ms)', () => {
    it('should handle room automation API calls within 300ms', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            automationLevel: fc.constantFrom('basic', 'intermediate', 'advanced'),
            isEnabled: fc.boolean(),
          }),
          async (testData) => {
            // Test automation config creation
            const startTime = Date.now();
            const config = await automationService.createAutomationConfig(
              testRoom.id,
              testUser.user.id,
              {
                automationLevel: testData.automationLevel as any,
                isEnabled: testData.isEnabled,
              }
            );
            const createTime = Date.now() - startTime;

            expect(createTime).toBeLessThan(300);
            expect(config).toBeDefined();

            // Test automation config retrieval
            const getStartTime = Date.now();
            const retrievedConfig = await automationService.getAutomationConfig(testRoom.id);
            const getTime = Date.now() - getStartTime;

            expect(getTime).toBeLessThan(300);
            expect(retrievedConfig).toBeDefined();

            // Test smart recommendations generation
            const recStartTime = Date.now();
            const recommendations = await automationService.generateSmartRecommendations(testRoom.id);
            const recTime = Date.now() - recStartTime;

            expect(recTime).toBeLessThan(300);
            expect(Array.isArray(recommendations)).toBe(true);
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    });

    it('should handle permission checks within 300ms', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            permission: fc.constantFrom('VOTE', 'CHAT', 'SUGGEST_CONTENT', 'MODERATE'),
            bulkCheckSize: fc.integer({ min: 1, max: 10 }),
          }),
          async (testData) => {
            // Single permission check
            const singleStartTime = Date.now();
            const hasPermission = await permissionService.checkPermission(
              testUser.user.id,
              testRoom.id,
              testData.permission as any
            );
            const singleTime = Date.now() - singleStartTime;

            expect(singleTime).toBeLessThan(300);
            expect(typeof hasPermission).toBe('boolean');

            // Bulk permission check
            const permissions = Array(testData.bulkCheckSize).fill(testData.permission);
            const bulkStartTime = Date.now();
            const bulkResults = await permissionService.bulkCheckPermissions(
              testUser.user.id,
              testRoom.id,
              permissions as any[]
            );
            const bulkTime = Date.now() - bulkStartTime;

            expect(bulkTime).toBeLessThan(300);
            expect(bulkResults).toHaveLength(testData.bulkCheckSize);
          }
        ),
        { numRuns: 25, timeout: 8000 }
      );
    });

    it('should handle analytics queries within 300ms', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            timeRange: fc.constantFrom('1h', '24h', '7d', '30d'),
            includeDetails: fc.boolean(),
          }),
          async (testData) => {
            // Room analytics
            const analyticsStartTime = Date.now();
            const roomAnalytics = await analyticsService.getRoomAnalytics(testRoom.id);
            const analyticsTime = Date.now() - analyticsStartTime;

            expect(analyticsTime).toBeLessThan(300);
            expect(roomAnalytics).toBeDefined();

            // User behavior analytics
            const behaviorStartTime = Date.now();
            const userBehavior = await analyticsService.getUserBehaviorAnalytics(testUser.user.id);
            const behaviorTime = Date.now() - behaviorStartTime;

            expect(behaviorTime).toBeLessThan(300);
            expect(userBehavior).toBeDefined();
          }
        ),
        { numRuns: 15, timeout: 8000 }
      );
    });
  });

  describe('Real-time Event Latency Requirements (< 100ms)', () => {
    it('should deliver real-time notifications within 100ms', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            eventType: fc.constantFrom('voteUpdate', 'matchFound', 'roomStateChanged', 'automationAction'),
            payloadSize: fc.integer({ min: 1, max: 5 }),
          }),
          async (testData) => {
            const payload = {
              message: 'Performance test notification',
              data: Array(testData.payloadSize).fill({ key: 'value', timestamp: Date.now() }),
            };

            const startTime = Date.now();
            
            // This should complete quickly even if WebSocket delivery fails
            await realtimeService.notifyRoom(testRoom.id, testData.eventType, payload);
            
            const notificationTime = Date.now() - startTime;

            // Real-time service should process notifications quickly
            expect(notificationTime).toBeLessThan(100);
          }
        ),
        { numRuns: 30, timeout: 5000 }
      );
    });

    it('should handle concurrent real-time events efficiently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          async (concurrentEvents) => {
            const events = [];
            const startTime = Date.now();

            for (let i = 0; i < concurrentEvents; i++) {
              events.push(
                realtimeService.notifyRoom(testRoom.id, 'test', {
                  eventId: i,
                  timestamp: Date.now(),
                })
              );
            }

            await Promise.all(events);
            const totalTime = Date.now() - startTime;

            // Should handle concurrent events efficiently
            const averageTimePerEvent = totalTime / concurrentEvents;
            expect(averageTimePerEvent).toBeLessThan(100);
          }
        ),
        { numRuns: 10, timeout: 10000 }
      );
    });
  });

  describe('Database Query Performance Requirements (< 50ms average)', () => {
    it('should execute DynamoDB queries within 50ms average', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            queryType: fc.constantFrom('get', 'query', 'scan'),
            itemCount: fc.integer({ min: 1, max: 10 }),
          }),
          async (testData) => {
            const queryTimes: number[] = [];

            for (let i = 0; i < testData.itemCount; i++) {
              const startTime = Date.now();

              switch (testData.queryType) {
                case 'get':
                  await multiTableService.get('Room', {
                    PK: `ROOM#${testRoom.id}`,
                    SK: `ROOM#${testRoom.id}`,
                  });
                  break;
                case 'query':
                  await multiTableService.query('Room', {
                    PK: `ROOM#${testRoom.id}`,
                  });
                  break;
                case 'scan':
                  await multiTableService.scan('Room', {
                    FilterExpression: 'attribute_exists(PK)',
                    Limit: 5,
                  });
                  break;
              }

              const queryTime = Date.now() - startTime;
              queryTimes.push(queryTime);
            }

            const averageTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
            expect(averageTime).toBeLessThan(50);

            // Also check that no individual query takes too long
            queryTimes.forEach(time => {
              expect(time).toBeLessThan(200); // Individual query limit
            });
          }
        ),
        { numRuns: 20, timeout: 15000 }
      );
    });

    it('should handle complex queries efficiently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            complexityLevel: fc.constantFrom('simple', 'medium', 'complex'),
            withFilters: fc.boolean(),
          }),
          async (testData) => {
            const startTime = Date.now();

            switch (testData.complexityLevel) {
              case 'simple':
                await multiTableService.query('Room', {
                  PK: `ROOM#${testRoom.id}`,
                  SK: { beginsWith: 'MEMBER#' },
                });
                break;
              case 'medium':
                await multiTableService.query('RoomAutomation', {
                  PK: `ROOM#${testRoom.id}`,
                  SK: { beginsWith: 'AUTOMATION#' },
                  FilterExpression: testData.withFilters ? 'isEnabled = :enabled' : undefined,
                  ExpressionAttributeValues: testData.withFilters ? { ':enabled': true } : undefined,
                });
                break;
              case 'complex':
                await multiTableService.scan('Analytics', {
                  FilterExpression: testData.withFilters 
                    ? 'roomId = :roomId AND eventType = :eventType'
                    : 'attribute_exists(roomId)',
                  ExpressionAttributeValues: testData.withFilters ? {
                    ':roomId': testRoom.id,
                    ':eventType': 'automation_created',
                  } : undefined,
                  Limit: 10,
                });
                break;
            }

            const queryTime = Date.now() - startTime;
            expect(queryTime).toBeLessThan(50);
          }
        ),
        { numRuns: 15, timeout: 10000 }
      );
    });
  });

  describe('Memory Usage and Resource Optimization', () => {
    it('should maintain efficient memory usage during operations', async () => {
      const initialMemory = process.memoryUsage();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),
          async (operationCount) => {
            const operations = [];

            for (let i = 0; i < operationCount; i++) {
              operations.push(
                automationService.generateSmartRecommendations(testRoom.id)
              );
            }

            await Promise.all(operations);

            const currentMemory = process.memoryUsage();
            const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
            const memoryIncreasePercentage = (memoryIncrease / initialMemory.heapUsed) * 100;

            // Memory increase should be reasonable (< 20% as per requirements)
            expect(memoryIncreasePercentage).toBeLessThan(20);
          }
        ),
        { numRuns: 5, timeout: 20000 }
      );
    });

    it('should handle cache efficiency for permission checks', async () => {
      // Warm up cache
      await permissionService.checkPermission(testUser.user.id, testRoom.id, 'VOTE');

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 30 }),
          async (cacheHits) => {
            const startTime = Date.now();

            // These should hit cache and be very fast
            const cachePromises = [];
            for (let i = 0; i < cacheHits; i++) {
              cachePromises.push(
                permissionService.checkPermission(testUser.user.id, testRoom.id, 'VOTE')
              );
            }

            const results = await Promise.all(cachePromises);
            const totalTime = Date.now() - startTime;
            const averageTime = totalTime / cacheHits;

            // Cached operations should be very fast (< 10ms average)
            expect(averageTime).toBeLessThan(10);
            
            // All results should be consistent
            results.forEach(result => {
              expect(result).toBe(true);
            });

            // Get cache stats to verify hit rate
            const cacheStats = await permissionService.getCacheStats();
            expect(cacheStats.hitRate).toBeGreaterThan(0.8); // > 80% hit rate
          }
        ),
        { numRuns: 8, timeout: 10000 }
      );
    });
  });

  describe('Scalability and Load Testing', () => {
    it('should handle multiple concurrent users efficiently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }),
          async (concurrentUsers) => {
            const userOperations = [];

            for (let i = 0; i < concurrentUsers; i++) {
              userOperations.push(
                (async () => {
                  const startTime = Date.now();
                  
                  // Simulate typical user operations
                  await Promise.all([
                    permissionService.checkPermission(testUser.user.id, testRoom.id, 'VOTE'),
                    automationService.getAutomationConfig(testRoom.id),
                    analyticsService.getRoomAnalytics(testRoom.id),
                  ]);

                  return Date.now() - startTime;
                })()
              );
            }

            const operationTimes = await Promise.all(userOperations);
            const averageTime = operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;
            const maxTime = Math.max(...operationTimes);

            // Average response time should remain reasonable under load
            expect(averageTime).toBeLessThan(500);
            expect(maxTime).toBeLessThan(1000);
          }
        ),
        { numRuns: 5, timeout: 15000 }
      );
    });

    it('should maintain performance with large datasets', async () => {
      // Create multiple automation configs to simulate larger dataset
      const configs = [];
      for (let i = 0; i < 5; i++) {
        const config = await automationService.createAutomationConfig(
          testRoom.id,
          testUser.user.id,
          {
            automationLevel: 'basic',
            isEnabled: i % 2 === 0,
          }
        );
        configs.push(config);
      }

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            queryComplexity: fc.constantFrom('simple', 'complex'),
            includeAnalytics: fc.boolean(),
          }),
          async (testData) => {
            const startTime = Date.now();

            if (testData.queryComplexity === 'simple') {
              await automationService.getAutomationConfig(testRoom.id);
            } else {
              await Promise.all([
                automationService.getAutomationConfig(testRoom.id),
                automationService.generateSmartRecommendations(testRoom.id),
                testData.includeAnalytics ? analyticsService.getRoomAnalytics(testRoom.id) : Promise.resolve(null),
              ]);
            }

            const queryTime = Date.now() - startTime;
            
            // Performance should remain good even with larger datasets
            expect(queryTime).toBeLessThan(testData.queryComplexity === 'simple' ? 100 : 400);
          }
        ),
        { numRuns: 10, timeout: 12000 }
      );
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover gracefully from temporary failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            failureType: fc.constantFrom('network', 'timeout', 'invalid_data'),
            retryAttempts: fc.integer({ min: 1, max: 3 }),
          }),
          async (testData) => {
            // Test resilience with invalid operations
            const startTime = Date.now();

            try {
              switch (testData.failureType) {
                case 'network':
                  // Simulate network failure with invalid room ID
                  await automationService.getAutomationConfig('invalid-room-id');
                  break;
                case 'timeout':
                  // Simulate timeout with very complex operation
                  await Promise.race([
                    automationService.generateSmartRecommendations(testRoom.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
                  ]);
                  break;
                case 'invalid_data':
                  // Simulate invalid data
                  await permissionService.checkPermission('invalid-user', testRoom.id, 'INVALID_PERMISSION' as any);
                  break;
              }
            } catch (error) {
              // Errors should be handled gracefully
              expect(error).toBeDefined();
            }

            const recoveryTime = Date.now() - startTime;
            
            // Recovery should be fast
            expect(recoveryTime).toBeLessThan(1000);

            // System should still be functional after error
            const healthCheck = await automationService.getAutomationConfig(testRoom.id);
            expect(healthCheck !== undefined).toBe(true);
          }
        ),
        { numRuns: 8, timeout: 10000 }
      );
    });

    it('should maintain data consistency during high load', async () => {
      const consistencyOperations = [];

      // Create multiple concurrent operations that modify state
      for (let i = 0; i < 10; i++) {
        consistencyOperations.push(
          automationService.updateAutomationConfig(
            testRoom.id,
            testUser.user.id,
            {
              isEnabled: i % 2 === 0,
              lastOptimizedAt: new Date(),
            }
          )
        );
      }

      const results = await Promise.allSettled(consistencyOperations);
      
      // At least some operations should succeed
      const successfulOperations = results.filter(result => result.status === 'fulfilled');
      expect(successfulOperations.length).toBeGreaterThan(0);

      // Final state should be consistent
      const finalConfig = await automationService.getAutomationConfig(testRoom.id);
      expect(finalConfig).toBeDefined();
      expect(typeof finalConfig?.isEnabled).toBe('boolean');
    });
  });
});