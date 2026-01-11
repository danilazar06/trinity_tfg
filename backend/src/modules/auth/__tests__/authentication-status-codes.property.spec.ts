import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as fc from 'fast-check';
import { AuthStatusCodeService } from '../services/auth-status-code.service';

describe('AuthStatusCodeService - Property 8: Authentication Status Codes', () => {
  let service: AuthStatusCodeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthStatusCodeService],
    }).compile();

    service = module.get<AuthStatusCodeService>(AuthStatusCodeService);
  });

  /**
   * **Property 8: Authentication Status Codes**
   * **Validates: Requirements 3.3**
   *
   * For any authentication or authorization operation, the system must:
   * 1. Return 401 Unauthorized for authentication failures (missing/invalid tokens)
   * 2. Return 403 Forbidden for authorization failures (insufficient permissions)
   * 3. Return 400 Bad Request for validation failures (malformed requests)
   * 4. Provide consistent error response structure across all status codes
   * 5. Include appropriate error codes and user-friendly messages
   * 6. Handle different error types with correct HTTP status codes
   */
  describe('Property 8: Authentication Status Codes', () => {
    it('should return 401 Unauthorized for authentication failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorType: fc.oneof(
              fc.constant('token_expired'),
              fc.constant('token_invalid'),
              fc.constant('token_malformed'),
              fc.constant('token_missing'),
              fc.constant('invalid_signature'),
              fc.constant('authentication_required'),
            ),
            message: fc.string({ minLength: 10, maxLength: 100 }),
            code: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
          }),
          async (testData) => {
            // Test throwing 401 Unauthorized
            try {
              service.throwUnauthorized(testData.message, testData.code);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Verify it's an UnauthorizedException
              expect(error).toBeInstanceOf(UnauthorizedException);
              
              // Verify status code is 401
              expect(error.getStatus()).toBe(401);
              
              // Verify error structure
              const errorResponse = error.getResponse();
              expect(errorResponse).toEqual(
                expect.objectContaining({
                  statusCode: 401,
                  message: testData.message,
                  error: 'Unauthorized',
                  code: testData.code || 'AUTH_REQUIRED',
                  timestamp: expect.any(String),
                })
              );
              
              // Verify timestamp is valid ISO string
              expect(() => new Date(errorResponse.timestamp)).not.toThrow();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 403 Forbidden for authorization failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            message: fc.string({ minLength: 10, maxLength: 100 }),
            code: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
          }),
          async (testData) => {
            // Test throwing 403 Forbidden
            try {
              service.throwForbidden(testData.message, testData.code);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Verify it's a ForbiddenException
              expect(error).toBeInstanceOf(ForbiddenException);
              
              // Verify status code is 403
              expect(error.getStatus()).toBe(403);
              
              // Verify error structure
              const errorResponse = error.getResponse();
              expect(errorResponse).toEqual(
                expect.objectContaining({
                  statusCode: 403,
                  message: testData.message,
                  error: 'Forbidden',
                  code: testData.code || 'INSUFFICIENT_PERMISSIONS',
                  timestamp: expect.any(String),
                })
              );
              
              // Verify timestamp is valid ISO string
              expect(() => new Date(errorResponse.timestamp)).not.toThrow();
            }
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should return 400 Bad Request for validation failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            message: fc.string({ minLength: 10, maxLength: 100 }),
            code: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
          }),
          async (testData) => {
            // Test throwing 400 Bad Request
            try {
              service.throwBadRequest(testData.message, testData.code);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Verify it's a BadRequestException
              expect(error).toBeInstanceOf(BadRequestException);
              
              // Verify status code is 400
              expect(error.getStatus()).toBe(400);
              
              // Verify error structure
              const errorResponse = error.getResponse();
              expect(errorResponse).toEqual(
                expect.objectContaining({
                  statusCode: 400,
                  message: testData.message,
                  error: 'Bad Request',
                  code: testData.code || 'INVALID_REQUEST',
                  timestamp: expect.any(String),
                })
              );
              
              // Verify timestamp is valid ISO string
              expect(() => new Date(errorResponse.timestamp)).not.toThrow();
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle different error types with correct HTTP status codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorType: fc.oneof(
              fc.constant('token'),
              fc.constant('permission'),
              fc.constant('validation'),
              fc.constant('network'),
              fc.constant('unknown'),
            ),
            errorMessage: fc.string({ minLength: 5, maxLength: 50 }),
            context: fc.string({ minLength: 3, maxLength: 20 }),
          }),
          async (testData) => {
            // Create error based on type
            let mockError: Error;
            let expectedStatusCode: number;
            
            switch (testData.errorType) {
              case 'token':
                mockError = new Error(`Token ${testData.errorMessage} expired`);
                expectedStatusCode = 401;
                break;
              case 'permission':
                mockError = new Error(`Permission ${testData.errorMessage} denied`);
                expectedStatusCode = 403;
                break;
              case 'validation':
                mockError = new Error(`Validation ${testData.errorMessage} failed`);
                expectedStatusCode = 400;
                break;
              case 'network':
                mockError = new Error(`Network ${testData.errorMessage} timeout`);
                expectedStatusCode = 401; // Network errors default to 401
                break;
              default:
                mockError = new Error(`Unknown ${testData.errorMessage} error`);
                expectedStatusCode = 401; // Unknown errors default to 401
            }

            // Test error handling
            try {
              service.handleAuthError(mockError, testData.context);
              // Should not reach here
              expect(true).toBe(false);
            } catch (error) {
              // Verify correct status code
              expect(error.getStatus()).toBe(expectedStatusCode);
              
              // Verify error response structure
              const errorResponse = error.getResponse();
              expect(errorResponse).toEqual(
                expect.objectContaining({
                  statusCode: expectedStatusCode,
                  message: expect.any(String),
                  error: expect.any(String),
                  code: expect.any(String),
                  timestamp: expect.any(String),
                })
              );
              
              // Verify message is user-friendly (not technical)
              expect(errorResponse.message).not.toContain('undefined');
              expect(errorResponse.message.length).toBeGreaterThan(5);
            }
          }
        ),
        { numRuns: 60 }
      );
    });

    it('should provide consistent error response structure across all status codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            statusCode: fc.oneof(
              fc.constant(400),
              fc.constant(401),
              fc.constant(403),
            ),
            message: fc.string({ minLength: 10, maxLength: 80 }),
            code: fc.string({ minLength: 3, maxLength: 15 }),
          }),
          async (testData) => {
            let thrownError: any;
            
            // Throw appropriate error based on status code
            try {
              switch (testData.statusCode) {
                case 400:
                  service.throwBadRequest(testData.message, testData.code);
                  break;
                case 401:
                  service.throwUnauthorized(testData.message, testData.code);
                  break;
                case 403:
                  service.throwForbidden(testData.message, testData.code);
                  break;
              }
            } catch (error) {
              thrownError = error;
            }

            // Verify consistent structure
            expect(thrownError).toBeDefined();
            const errorResponse = thrownError.getResponse();
            
            // All errors should have the same structure
            expect(errorResponse).toEqual(
              expect.objectContaining({
                statusCode: expect.any(Number),
                message: expect.any(String),
                error: expect.any(String),
                code: expect.any(String),
                timestamp: expect.any(String),
              })
            );
            
            // Verify specific values
            expect(errorResponse.statusCode).toBe(testData.statusCode);
            expect(errorResponse.message).toBe(testData.message);
            expect(errorResponse.code).toBe(testData.code);
            
            // Verify timestamp is recent (within last 5 seconds)
            const timestamp = new Date(errorResponse.timestamp);
            const now = new Date();
            const timeDiff = now.getTime() - timestamp.getTime();
            expect(timeDiff).toBeLessThan(5000);
          }
        ),
        { numRuns: 45 }
      );
    });

    it('should validate status code usage for different contexts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            statusCode: fc.oneof(
              fc.constant(400),
              fc.constant(401),
              fc.constant(403),
              fc.constant(500), // Invalid for auth context
            ),
            context: fc.oneof(
              fc.constant('authentication'),
              fc.constant('authorization'),
              fc.constant('validation'),
              fc.constant('token'),
              fc.constant('permission'),
              fc.constant('bad_request'),
              fc.constant('unknown_context'),
            ),
          }),
          async (testData) => {
            // Test status code validation
            const isValid = service.validateStatusCodeUsage(
              testData.statusCode,
              testData.context
            );

            // Determine expected validity
            let expectedValid = false;
            
            if (testData.statusCode === 400 && 
                (testData.context.includes('validation') || testData.context.includes('bad_request'))) {
              expectedValid = true;
            } else if (testData.statusCode === 401 && 
                       (testData.context.includes('authentication') || testData.context.includes('token'))) {
              expectedValid = true;
            } else if (testData.statusCode === 403 && 
                       (testData.context.includes('authorization') || testData.context.includes('permission'))) {
              expectedValid = true;
            }

            expect(isValid).toBe(expectedValid);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should recommend appropriate status codes for different contexts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('authentication'),
            fc.constant('authorization'),
            fc.constant('validation'),
            fc.constant('token'),
            fc.constant('permission'),
            fc.constant('bad_request'),
            fc.constant('unknown_context'),
          ),
          async (context) => {
            // Get recommended status code
            const recommendedCode = service.getRecommendedStatusCode(context);

            // Verify recommendation is appropriate
            if (context.includes('authentication') || context.includes('token')) {
              expect(recommendedCode).toBe(401);
            } else if (context.includes('authorization') || context.includes('permission')) {
              expect(recommendedCode).toBe(403);
            } else if (context.includes('validation') || context.includes('bad_request')) {
              expect(recommendedCode).toBe(400);
            } else {
              // Unknown contexts default to 401
              expect(recommendedCode).toBe(401);
            }

            // Verify recommended code is valid HTTP status code
            expect([400, 401, 403]).toContain(recommendedCode);
          }
        ),
        { numRuns: 35 }
      );
    });
  });

  afterEach(() => {
    // No cleanup needed for this service
  });
});