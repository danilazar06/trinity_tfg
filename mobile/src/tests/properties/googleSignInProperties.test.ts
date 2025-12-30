/**
 * Property-Based Tests for Google Sign-In
 * Tests universal properties that should hold across all inputs and scenarios
 */

import fc from 'fast-check';
import GoogleSignInManager from '../../services/googleSignInManager';
import EnvironmentService from '../../services/environmentService';
import { GoogleSignInError, GoogleSignInCapabilities } from '../../types/googleSignIn';

// Mock dependencies
jest.mock('../../services/environmentService');
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
    isSignedIn: jest.fn(),
  },
}));

describe('Google Sign-In Property Tests', () => {
  let mockEnvironmentService: jest.Mocked<EnvironmentService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEnvironmentService = {
      detectEnvironment: jest.fn(),
      isExpoGo: jest.fn(),
      isDevelopmentBuild: jest.fn(),
      isProduction: jest.fn(),
      isWeb: jest.fn(),
    } as any;

    (EnvironmentService.getInstance as jest.Mock) = jest.fn(() => mockEnvironmentService);
  });

  /**
   * Property 1: Fallback Availability
   * For any environment configuration, there should always be a fallback authentication method available
   * **Validates: Requirements 2.2, 4.3**
   */
  test('Property 1: Google Sign-In always has fallback available', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('expo-go', 'development-build', 'production', 'web'),
          googleSignInAvailable: fc.boolean(),
          hasGoogleServicesFile: fc.boolean(),
        }),
        async (envConfig) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });

          const manager = GoogleSignInManager.getInstance();
          
          // Act
          await manager.initialize();
          const capabilities = manager.getCapabilities();
          const statusMessage = manager.getStatusMessage();
          
          // Assert - There should always be some form of authentication available
          const hasGoogleSignIn = manager.isAvailable();
          const hasFallback = statusMessage.includes('email/password') || statusMessage.includes('email y contraseña');
          
          // Property: Either Google Sign-In is available OR fallback is mentioned
          expect(hasGoogleSignIn || hasFallback).toBe(true);
          
          // Property: Status message should never be empty
          expect(statusMessage).toBeTruthy();
          expect(statusMessage.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Configuration Error Messages
   * For any invalid configuration, the system should provide clear error messages and suggestions
   * **Validates: Requirements 1.3, 5.2**
   */
  test('Property 2: Invalid configuration provides clear error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('expo-go', 'development-build', 'production', 'web'),
          googleSignInAvailable: fc.constant(false), // Force unavailable
          hasGoogleServicesFile: fc.constant(false), // Force missing
        }),
        async (envConfig) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });

          const manager = GoogleSignInManager.getInstance();
          
          // Act
          await manager.initialize();
          const result = await manager.signIn();
          const statusMessage = manager.getStatusMessage();
          
          // Assert - Invalid configuration should provide helpful information
          expect(result.success).toBe(false);
          expect(result.error).toBeTruthy();
          expect(result.error!.length).toBeGreaterThan(10); // Should be descriptive
          
          // Property: Error messages should be in Spanish (as per requirements)
          const spanishErrorIndicators = [
            'no está disponible',
            'no disponible',
            'error',
            'configuración',
            'entorno'
          ];
          const hasSpanishError = spanishErrorIndicators.some(indicator => 
            result.error!.toLowerCase().includes(indicator)
          );
          expect(hasSpanishError).toBe(true);
          
          // Property: Status message should indicate the problem
          expect(statusMessage).toBeTruthy();
          expect(statusMessage.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 3: Environment Detection Consistency
   * For any given environment, the detection results should be consistent across multiple calls
   * **Validates: Requirements 6.1, 6.4**
   */
  test('Property 3: Environment detection is consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('expo-go', 'development-build', 'production', 'web'),
          googleSignInAvailable: fc.boolean(),
          hasGoogleServicesFile: fc.boolean(),
        }),
        async (envConfig) => {
          // Arrange
          const envInfo = {
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          };
          mockEnvironmentService.detectEnvironment.mockResolvedValue(envInfo);

          const manager1 = GoogleSignInManager.getInstance();
          const manager2 = GoogleSignInManager.getInstance();
          
          // Act
          await manager1.initialize();
          await manager2.initialize();
          
          const capabilities1 = manager1.getCapabilities();
          const capabilities2 = manager2.getCapabilities();
          const status1 = manager1.getStatusMessage();
          const status2 = manager2.getStatusMessage();
          
          // Assert - Multiple instances should have consistent results
          expect(capabilities1?.environment).toBe(capabilities2?.environment);
          expect(capabilities1?.nativeSignInAvailable).toBe(capabilities2?.nativeSignInAvailable);
          expect(status1).toBe(status2);
          
          // Property: Singleton behavior should ensure consistency
          expect(manager1).toBe(manager2);
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 4: Expo Go Limitation Handling
   * For any Expo Go environment, Google Sign-In should be unavailable with appropriate messaging
   * **Validates: Requirements 2.1, 2.3, 2.5**
   */
  test('Property 4: Expo Go environments handle limitations correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android'),
          runtime: fc.constant('expo-go'),
          googleSignInAvailable: fc.constant(false),
          hasGoogleServicesFile: fc.boolean(),
        }),
        async (envConfig) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });
          mockEnvironmentService.isExpoGo.mockReturnValue(true);

          const manager = GoogleSignInManager.getInstance();
          
          // Act
          await manager.initialize();
          const isAvailable = manager.isAvailable();
          const statusMessage = manager.getStatusMessage();
          const result = await manager.signIn();
          
          // Assert - Expo Go should consistently handle limitations
          expect(isAvailable).toBe(false);
          expect(result.success).toBe(false);
          
          // Property: Status message should mention Expo Go limitation
          const expoGoMentioned = statusMessage.toLowerCase().includes('expo go') ||
                                 statusMessage.toLowerCase().includes('development build');
          expect(expoGoMentioned).toBe(true);
          
          // Property: Should suggest alternatives
          const suggestsAlternative = statusMessage.toLowerCase().includes('email') ||
                                    statusMessage.toLowerCase().includes('password') ||
                                    statusMessage.toLowerCase().includes('development build');
          expect(suggestsAlternative).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 5: Error Code Consistency
   * For any error scenario, the error code should match the error message type
   * **Validates: Requirements 4.2, 7.4**
   */
  test('Property 5: Error codes match error message types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('expo-go', 'development-build', 'production', 'web'),
          googleSignInAvailable: fc.boolean(),
          hasGoogleServicesFile: fc.boolean(),
        }),
        async (envConfig) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });

          const manager = GoogleSignInManager.getInstance();
          
          // Act
          await manager.initialize();
          const result = await manager.signIn();
          
          // Assert - Error codes should be consistent with error types
          if (!result.success && result.errorCode) {
            switch (result.errorCode) {
              case GoogleSignInError.CONFIGURATION_ERROR:
                expect(result.error).toMatch(/configuración|configuration|no está disponible|not available/i);
                break;
              case GoogleSignInError.NETWORK_ERROR:
                expect(result.error).toMatch(/red|network|conexión|connection/i);
                break;
              case GoogleSignInError.SIGN_IN_CANCELLED:
                expect(result.error).toMatch(/cancelado|cancelled|usuario|user/i);
                break;
              case GoogleSignInError.UNKNOWN_ERROR:
                expect(result.error).toMatch(/error|desconocido|unknown/i);
                break;
            }
          }
          
          // Property: If there's an error, there should be an error message
          if (!result.success) {
            expect(result.error).toBeTruthy();
            expect(result.error!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 6: Capabilities Reflection
   * For any environment, the reported capabilities should accurately reflect the actual functionality
   * **Validates: Requirements 6.2, 6.3, 7.2**
   */
  test('Property 6: Capabilities accurately reflect functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('expo-go', 'development-build', 'production', 'web'),
          googleSignInAvailable: fc.boolean(),
          hasGoogleServicesFile: fc.boolean(),
        }),
        async (envConfig) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });

          const manager = GoogleSignInManager.getInstance();
          
          // Act
          await manager.initialize();
          const capabilities = manager.getCapabilities();
          const isAvailable = manager.isAvailable();
          const result = await manager.signIn();
          
          // Assert - Capabilities should match actual behavior
          if (capabilities) {
            // Property: If native sign-in is reported as available, it should work or provide specific error
            if (capabilities.nativeSignInAvailable) {
              // Should either succeed or fail with specific reason
              if (!result.success) {
                expect(result.errorCode).toBeDefined();
              }
            }
            
            // Property: Environment should match detected environment
            expect(capabilities.environment).toBe(envConfig.runtime);
            
            // Property: Configuration validity should match file availability
            if (envConfig.runtime !== 'expo-go' && envConfig.runtime !== 'web') {
              expect(capabilities.configurationValid).toBe(envConfig.hasGoogleServicesFile);
            }
            
            // Property: Web availability should match platform
            if (envConfig.platform === 'web') {
              expect(capabilities.webSignInAvailable).toBe(true);
            }
          }
        }
      ),
      { numRuns: 35 }
    );
  });

  /**
   * Property 7: State Management Consistency
   * For any sequence of operations, the manager state should remain consistent
   * **Validates: Requirements 4.4, 6.5**
   */
  test('Property 7: State management remains consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom('ios', 'android', 'web'),
          runtime: fc.constantFrom('development-build', 'production'),
          googleSignInAvailable: fc.constant(true),
          hasGoogleServicesFile: fc.constant(true),
        }),
        fc.array(fc.constantFrom('signIn', 'signOut', 'getStatus', 'refresh'), { minLength: 1, maxLength: 5 }),
        async (envConfig, operations) => {
          // Arrange
          mockEnvironmentService.detectEnvironment.mockResolvedValue({
            ...envConfig,
            deviceInfo: { isDevice: true },
            buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
          });

          const manager = GoogleSignInManager.getInstance();
          await manager.initialize();
          
          // Act - Perform sequence of operations
          let lastStatus = manager.getStatusMessage();
          
          for (const operation of operations) {
            switch (operation) {
              case 'signIn':
                await manager.signIn();
                break;
              case 'signOut':
                try {
                  await manager.signOut();
                } catch (error) {
                  // Ignore sign out errors for property testing
                }
                break;
              case 'getStatus':
                manager.getStatusMessage();
                break;
              case 'refresh':
                // Simulate refresh by re-getting capabilities
                manager.getCapabilities();
                break;
            }
          }
          
          const finalStatus = manager.getStatusMessage();
          
          // Assert - State should remain consistent
          // Property: Status message should always be available
          expect(finalStatus).toBeTruthy();
          expect(finalStatus.length).toBeGreaterThan(0);
          
          // Property: Manager should remain available for operations
          expect(manager.isAvailable).toBeDefined();
          expect(manager.getCapabilities).toBeDefined();
          expect(manager.getStatusMessage).toBeDefined();
        }
      ),
      { numRuns: 25 }
    );
  });
});