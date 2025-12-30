/**
 * Authentication Integration E2E Tests
 * Tests integration between Google Sign-In, Cognito, and backend services
 */

import GoogleSignInManager from '../../services/googleSignInManager';
import { CognitoGoogleIntegration } from '../../services/cognitoGoogleIntegration';
import { apiClient } from '../../services/apiClient';
import { EnhancedAuthContext } from '../../context/EnhancedAuthContext';

// Mock dependencies
jest.mock('@react-native-google-signin/google-signin');
jest.mock('../../services/apiClient');
jest.mock('../../services/cognitoAuthService');

describe('Authentication Integration E2E Tests', () => {
  let googleSignInManager: GoogleSignInManager;
  let cognitoIntegration: CognitoGoogleIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    googleSignInManager = GoogleSignInManager.getInstance();
    cognitoIntegration = CognitoGoogleIntegration.getInstance();
  });

  describe('Complete Authentication Integration Flow', () => {
    test('should integrate Google Sign-In with backend authentication', async () => {
      // Arrange - Mock successful Google Sign-In
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'google-integration-user',
          email: 'integration@example.com',
          name: 'Integration User',
          photo: 'https://example.com/photo.jpg',
        },
        idToken: 'google-integration-id-token',
        accessToken: 'google-integration-access-token',
      });

      // Mock successful Cognito integration
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'cognito-integration-access-token',
          idToken: 'cognito-integration-id-token',
          refreshToken: 'cognito-integration-refresh-token',
        },
        user: {
          id: 'cognito-integration-user',
          email: 'integration@example.com',
          name: 'Integration User',
        },
      });

      // Mock successful backend authentication
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockResolvedValue({
        data: {
          success: true,
          user: {
            id: 'backend-integration-user',
            email: 'integration@example.com',
            name: 'Integration User',
            profile: {
              avatar: 'https://example.com/photo.jpg',
              preferences: {},
            },
          },
          tokens: {
            accessToken: 'backend-access-token',
            refreshToken: 'backend-refresh-token',
          },
        },
      });

      // Act - Execute complete integration flow
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Verify complete integration
      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('integration@example.com');
      expect(result.cognitoTokens).toBeDefined();
      expect(result.backendTokens).toBeDefined();

      // Verify backend was called with correct tokens
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/auth/google/login', {
        googleIdToken: 'google-integration-id-token',
        cognitoAccessToken: 'cognito-integration-access-token',
      });
    });

    test('should handle backend authentication failure gracefully', async () => {
      // Arrange - Mock successful Google and Cognito, but backend failure
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'backend-fail-user',
          email: 'backendFail@example.com',
          name: 'Backend Fail User',
        },
        idToken: 'backend-fail-id-token',
        accessToken: 'backend-fail-access-token',
      });

      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'cognito-backend-fail-access-token',
          idToken: 'cognito-backend-fail-id-token',
          refreshToken: 'cognito-backend-fail-refresh-token',
        },
        user: {
          id: 'cognito-backend-fail-user',
          email: 'backendFail@example.com',
          name: 'Backend Fail User',
        },
      });

      // Mock backend failure
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Should still provide partial success with fallback
      expect(result.success).toBe(true); // Google + Cognito succeeded
      expect(result.user?.email).toBe('backendFail@example.com');
      expect(result.cognitoTokens).toBeDefined();
      expect(result.backendTokens).toBeUndefined();
      expect(result.warnings).toContain('Backend authentication failed');
      expect(result.fallbackMode).toBe(true);
    });

    test('should sync user profile data across all systems', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'sync-user-123',
          email: 'sync@example.com',
          name: 'Sync User',
          photo: 'https://lh3.googleusercontent.com/photo.jpg',
          familyName: 'User',
          givenName: 'Sync',
        },
        idToken: 'sync-id-token',
        accessToken: 'sync-access-token',
      });

      // Mock Cognito with profile sync
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'cognito-sync-access-token',
          idToken: 'cognito-sync-id-token',
          refreshToken: 'cognito-sync-refresh-token',
        },
        user: {
          id: 'cognito-sync-user',
          email: 'sync@example.com',
          name: 'Sync User',
          profile: {
            firstName: 'Sync',
            lastName: 'User',
            avatar: 'https://lh3.googleusercontent.com/photo.jpg',
          },
        },
      });

      // Mock backend profile creation
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockResolvedValue({
        data: {
          success: true,
          user: {
            id: 'backend-sync-user',
            email: 'sync@example.com',
            name: 'Sync User',
            profile: {
              firstName: 'Sync',
              lastName: 'User',
              avatar: 'https://lh3.googleusercontent.com/photo.jpg',
              provider: 'google',
              createdAt: new Date().toISOString(),
            },
          },
        },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Verify profile data is synced
      expect(result.success).toBe(true);
      expect(result.user?.profile?.firstName).toBe('Sync');
      expect(result.user?.profile?.lastName).toBe('User');
      expect(result.user?.profile?.avatar).toBe('https://lh3.googleusercontent.com/photo.jpg');
      expect(result.user?.profile?.provider).toBe('google');

      // Verify backend received complete profile data
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/auth/google/login', 
        expect.objectContaining({
          profile: expect.objectContaining({
            firstName: 'Sync',
            lastName: 'User',
            avatar: 'https://lh3.googleusercontent.com/photo.jpg',
          }),
        })
      );
    });
  });

  describe('Token Management Integration', () => {
    test('should handle token refresh across all systems', async () => {
      // Arrange - User is already authenticated
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'refresh-user-123',
          email: 'refresh@example.com',
          name: 'Refresh User',
        },
        idToken: 'old-id-token',
      });

      // Mock token refresh
      GoogleSignin.signInSilently.mockResolvedValue({
        user: {
          id: 'refresh-user-123',
          email: 'refresh@example.com',
          name: 'Refresh User',
        },
        idToken: 'new-id-token',
        accessToken: 'new-access-token',
      });

      // Mock Cognito token refresh
      jest.spyOn(cognitoIntegration, 'refreshTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'new-cognito-access-token',
          idToken: 'new-cognito-id-token',
          refreshToken: 'new-cognito-refresh-token',
        },
      });

      // Mock backend token validation
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockResolvedValue({
        data: {
          success: true,
          tokens: {
            accessToken: 'new-backend-access-token',
            refreshToken: 'new-backend-refresh-token',
          },
        },
      });

      // Act
      await googleSignInManager.initialize();
      const refreshResult = await googleSignInManager.refreshTokens();

      // Assert
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.tokens?.googleIdToken).toBe('new-id-token');
      expect(refreshResult.tokens?.cognitoAccessToken).toBe('new-cognito-access-token');
      expect(refreshResult.tokens?.backendAccessToken).toBe('new-backend-access-token');

      // Verify all systems were updated
      expect(GoogleSignin.signInSilently).toHaveBeenCalled();
      expect(cognitoIntegration.refreshTokens).toHaveBeenCalled();
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/auth/refresh');
    });

    test('should handle token expiration cascade', async () => {
      // Arrange - Mock expired tokens
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.signInSilently.mockRejectedValue({
        code: 'SIGN_IN_REQUIRED',
        message: 'Token expired',
      });

      // Mock Cognito token also expired
      jest.spyOn(cognitoIntegration, 'refreshTokens').mockResolvedValue({
        success: false,
        error: 'Refresh token expired',
        requiresReauth: true,
      });

      // Act
      await googleSignInManager.initialize();
      const refreshResult = await googleSignInManager.refreshTokens();

      // Assert - Should require re-authentication
      expect(refreshResult.success).toBe(false);
      expect(refreshResult.requiresReauth).toBe(true);
      expect(refreshResult.error).toContain('expirados');
    });

    test('should maintain session consistency across app restarts', async () => {
      // Arrange - Mock persisted session
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'persistent-user-123',
          email: 'persistent@example.com',
          name: 'Persistent User',
        },
        idToken: 'persistent-id-token',
      });

      // Mock Cognito session validation
      jest.spyOn(cognitoIntegration, 'validateSession').mockResolvedValue({
        isValid: true,
        user: {
          id: 'cognito-persistent-user',
          email: 'persistent@example.com',
          name: 'Persistent User',
        },
        tokens: {
          accessToken: 'valid-cognito-access-token',
          idToken: 'valid-cognito-id-token',
          refreshToken: 'valid-cognito-refresh-token',
        },
      });

      // Mock backend session validation
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.get.mockResolvedValue({
        data: {
          success: true,
          user: {
            id: 'backend-persistent-user',
            email: 'persistent@example.com',
            name: 'Persistent User',
          },
          sessionValid: true,
        },
      });

      // Act - Simulate app restart
      await googleSignInManager.initialize();
      const sessionResult = await googleSignInManager.restoreSession();

      // Assert
      expect(sessionResult.success).toBe(true);
      expect(sessionResult.user?.email).toBe('persistent@example.com');
      expect(sessionResult.isRestoredSession).toBe(true);

      // Verify all systems validated session
      expect(GoogleSignin.getCurrentUser).toHaveBeenCalled();
      expect(cognitoIntegration.validateSession).toHaveBeenCalled();
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/auth/validate-session');
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle partial system failures gracefully', async () => {
      // Arrange - Google succeeds, Cognito fails, backend unavailable
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'partial-fail-user',
          email: 'partialFail@example.com',
          name: 'Partial Fail User',
        },
        idToken: 'partial-fail-id-token',
        accessToken: 'partial-fail-access-token',
      });

      // Mock Cognito failure
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: false,
        error: 'Cognito service unavailable',
        errorCode: 'COGNITO_UNAVAILABLE',
      });

      // Mock backend unavailable
      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockRejectedValue({
        code: 'NETWORK_ERROR',
        message: 'Backend unavailable',
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Should provide degraded functionality
      expect(result.success).toBe(true); // Google succeeded
      expect(result.user?.email).toBe('partialFail@example.com');
      expect(result.cognitoTokens).toBeUndefined();
      expect(result.backendTokens).toBeUndefined();
      expect(result.degradedMode).toBe(true);
      expect(result.warnings).toContain('Cognito');
      expect(result.warnings).toContain('Backend');
    });

    test('should provide comprehensive error recovery guidance', async () => {
      // Arrange - Multiple system failures
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(false);

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Should provide recovery steps
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.recoverySteps).toBeDefined();
      expect(result.recoverySteps).toContain('Verificar Google Play Services');
      expect(result.fallbackSuggestion).toContain('email y contraseña');
    });

    test('should maintain data consistency during failures', async () => {
      // Arrange - Simulate failure during token exchange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'consistency-user',
          email: 'consistency@example.com',
          name: 'Consistency User',
        },
        idToken: 'consistency-id-token',
        accessToken: 'consistency-access-token',
      });

      // Mock Cognito partial failure
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockImplementation(async () => {
        // Simulate timeout/failure during exchange
        throw new Error('Network timeout during token exchange');
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Should clean up partial state
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      
      // Verify cleanup was performed
      expect(GoogleSignin.signOut).toHaveBeenCalled(); // Should clean up Google session
    });
  });

  describe('Performance Integration', () => {
    test('should complete authentication flow within acceptable time limits', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          user: {
            id: 'perf-user',
            email: 'perf@example.com',
            name: 'Performance User',
          },
          idToken: 'perf-id-token',
          accessToken: 'perf-access-token',
        }), 100)) // 100ms delay
      );

      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          cognitoTokens: {
            accessToken: 'perf-cognito-access-token',
            idToken: 'perf-cognito-id-token',
            refreshToken: 'perf-cognito-refresh-token',
          },
          user: {
            id: 'perf-cognito-user',
            email: 'perf@example.com',
            name: 'Performance User',
          },
        }), 200)) // 200ms delay
      );

      const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
      mockApiClient.post.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          data: {
            success: true,
            user: { id: 'perf-backend-user', email: 'perf@example.com' },
            tokens: { accessToken: 'perf-backend-token' },
          },
        }), 150)) // 150ms delay
      );

      // Act
      const startTime = Date.now();
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();
      const endTime = Date.now();

      // Assert - Should complete within reasonable time (< 2 seconds)
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(2000);
      expect(result.success).toBe(true);
      expect(result.performanceMetrics?.totalTime).toBeDefined();
      expect(result.performanceMetrics?.googleSignInTime).toBeLessThan(500);
      expect(result.performanceMetrics?.cognitoExchangeTime).toBeLessThan(500);
      expect(result.performanceMetrics?.backendAuthTime).toBeLessThan(500);
    });

    test('should handle concurrent authentication requests properly', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'concurrent-user',
          email: 'concurrent@example.com',
          name: 'Concurrent User',
        },
        idToken: 'concurrent-id-token',
        accessToken: 'concurrent-access-token',
      });

      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'concurrent-cognito-access-token',
          idToken: 'concurrent-cognito-id-token',
          refreshToken: 'concurrent-cognito-refresh-token',
        },
        user: {
          id: 'concurrent-cognito-user',
          email: 'concurrent@example.com',
          name: 'Concurrent User',
        },
      });

      // Act - Simulate concurrent sign-in attempts
      await googleSignInManager.initialize();
      const [result1, result2, result3] = await Promise.all([
        googleSignInManager.signIn(),
        googleSignInManager.signIn(),
        googleSignInManager.signIn(),
      ]);

      // Assert - Should handle concurrent requests gracefully
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Should not call Google Sign-In multiple times
      expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
    });
  });
});