/**
 * End-to-End Google Sign-In Flow Tests
 * Tests complete user flows from start to finish
 */

import GoogleSignInManager from '../../services/googleSignInManager';
import EnvironmentService from '../../services/environmentService';
import { CognitoGoogleIntegration } from '../../services/cognitoGoogleIntegration';
import { GoogleSignInError } from '../../types/googleSignIn';

// Mock dependencies
jest.mock('@react-native-google-signin/google-signin');
jest.mock('../../services/cognitoAuthService');
jest.mock('../../services/apiClient');

describe('Google Sign-In E2E Flow Tests', () => {
  let googleSignInManager: GoogleSignInManager;
  let environmentService: EnvironmentService;
  let cognitoIntegration: CognitoGoogleIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    googleSignInManager = GoogleSignInManager.getInstance();
    environmentService = EnvironmentService.getInstance();
    cognitoIntegration = CognitoGoogleIntegration.getInstance();
  });

  describe('Complete Sign-In Flow - Success Path', () => {
    test('should complete full sign-in flow in Development Build', async () => {
      // Arrange - Mock successful environment detection
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock successful Google Sign-In
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'google-user-123',
          email: 'user@example.com',
          name: 'Test User',
          photo: 'https://example.com/photo.jpg',
        },
        idToken: 'mock-google-id-token',
        accessToken: 'mock-google-access-token',
      });

      // Mock successful Cognito integration
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'cognito-access-token',
          idToken: 'cognito-id-token',
          refreshToken: 'cognito-refresh-token',
        },
        user: {
          id: 'cognito-user-123',
          email: 'user@example.com',
          name: 'Test User',
        },
      });

      // Act - Execute complete flow
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert - Verify complete success
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('user@example.com');
      expect(result.user?.name).toBe('Test User');
      expect(result.cognitoTokens).toBeDefined();
      expect(result.cognitoTokens?.accessToken).toBe('cognito-access-token');

      // Verify Google Sign-In was called
      expect(GoogleSignin.signIn).toHaveBeenCalled();

      // Verify Cognito integration was called
      expect(cognitoIntegration.exchangeGoogleTokens).toHaveBeenCalledWith(
        'mock-google-id-token',
        'mock-google-access-token'
      );
    });

    test('should complete full sign-in flow on Web', async () => {
      // Arrange - Mock web environment
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'web',
        runtime: 'web',
        googleSignInAvailable: true,
        hasGoogleServicesFile: false, // Not needed for web
        deviceInfo: { isDevice: false },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock web Google Sign-In (different implementation)
      const mockWebGoogleAuth = {
        signIn: jest.fn().mockResolvedValue({
          user: {
            id: 'web-user-123',
            email: 'webuser@example.com',
            name: 'Web User',
          },
          idToken: 'web-id-token',
          accessToken: 'web-access-token',
        }),
      };

      // Mock web strategy
      jest.doMock('../../services/auth-strategies/webGoogleSignIn', () => ({
        WebGoogleSignInStrategy: jest.fn().mockImplementation(() => mockWebGoogleAuth),
      }));

      // Mock Cognito integration
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'web-cognito-access-token',
          idToken: 'web-cognito-id-token',
          refreshToken: 'web-cognito-refresh-token',
        },
        user: {
          id: 'web-cognito-user-123',
          email: 'webuser@example.com',
          name: 'Web User',
        },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('webuser@example.com');
      expect(result.cognitoTokens).toBeDefined();
    });

    test('should handle returning user sign-in', async () => {
      // Arrange - Mock environment for returning user
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'ios',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock Google Sign-In for existing user
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'existing-user-123',
          email: 'existing@example.com',
          name: 'Existing User',
        },
        idToken: 'existing-id-token',
      });

      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'existing-user-123',
          email: 'existing@example.com',
          name: 'Existing User',
        },
        idToken: 'refreshed-id-token',
        accessToken: 'refreshed-access-token',
      });

      // Mock Cognito for existing user
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: true,
        cognitoTokens: {
          accessToken: 'existing-cognito-access-token',
          idToken: 'existing-cognito-id-token',
          refreshToken: 'existing-cognito-refresh-token',
        },
        user: {
          id: 'existing-cognito-user-123',
          email: 'existing@example.com',
          name: 'Existing User',
        },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('existing@example.com');
      expect(result.isReturningUser).toBe(true);
    });
  });

  describe('Complete Sign-In Flow - Error Paths', () => {
    test('should handle Google Sign-In cancellation gracefully', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock user cancellation
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockRejectedValue({
        code: 'SIGN_IN_CANCELLED',
        message: 'User cancelled the sign-in flow',
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(GoogleSignInError.SIGN_IN_CANCELLED);
      expect(result.error).toContain('cancelado');
      expect(result.isRecoverable).toBe(true);
    });

    test('should handle network errors during sign-in', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'ios',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock network error
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockRejectedValue({
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(GoogleSignInError.NETWORK_ERROR);
      expect(result.error).toContain('red');
      expect(result.isRecoverable).toBe(true);
      expect(result.retryAfter).toBeDefined();
    });

    test('should handle Cognito integration failure', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock successful Google Sign-In
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'google-user-456',
          email: 'user2@example.com',
          name: 'Test User 2',
        },
        idToken: 'google-id-token-2',
        accessToken: 'google-access-token-2',
      });

      // Mock Cognito failure
      jest.spyOn(cognitoIntegration, 'exchangeGoogleTokens').mockResolvedValue({
        success: false,
        error: 'Failed to exchange tokens with Cognito',
        errorCode: 'COGNITO_EXCHANGE_FAILED',
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cognito');
      expect(result.isRecoverable).toBe(true);
      expect(result.fallbackSuggestion).toContain('email');
    });
  });

  describe('Complete Sign-Out Flow', () => {
    test('should complete full sign-out flow', async () => {
      // Arrange - User is signed in
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.signOut.mockResolvedValue();

      // Mock Cognito sign-out
      jest.spyOn(cognitoIntegration, 'signOut').mockResolvedValue({
        success: true,
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signOut();

      // Assert
      expect(result.success).toBe(true);
      expect(GoogleSignin.signOut).toHaveBeenCalled();
      expect(cognitoIntegration.signOut).toHaveBeenCalled();
    });

    test('should handle sign-out errors gracefully', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'ios',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.signOut.mockRejectedValue(new Error('Sign-out failed'));

      // Mock Cognito sign-out still succeeds
      jest.spyOn(cognitoIntegration, 'signOut').mockResolvedValue({
        success: true,
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signOut();

      // Assert - Should still succeed if Cognito sign-out works
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Google Sign-Out failed');
      expect(cognitoIntegration.signOut).toHaveBeenCalled();
    });
  });

  describe('Account Linking Flow', () => {
    test('should link Google account to existing user', async () => {
      // Arrange - User is already authenticated with email/password
      const existingUser = {
        id: 'existing-user-789',
        email: 'existing@example.com',
        name: 'Existing User',
        authMethod: 'email',
      };

      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock Google Sign-In for linking
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'google-link-user',
          email: 'existing@example.com', // Same email
          name: 'Existing User',
        },
        idToken: 'link-id-token',
        accessToken: 'link-access-token',
      });

      // Mock Cognito linking
      jest.spyOn(cognitoIntegration, 'linkGoogleAccount').mockResolvedValue({
        success: true,
        linkedUser: {
          id: 'existing-user-789',
          email: 'existing@example.com',
          name: 'Existing User',
          authMethods: ['email', 'google'],
        },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.linkGoogleAccount(existingUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.linkedUser?.authMethods).toContain('google');
      expect(cognitoIntegration.linkGoogleAccount).toHaveBeenCalledWith(
        existingUser,
        'link-id-token',
        'link-access-token'
      );
    });

    test('should handle email mismatch during linking', async () => {
      // Arrange
      const existingUser = {
        id: 'existing-user-999',
        email: 'existing@example.com',
        name: 'Existing User',
        authMethod: 'email',
      };

      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'ios',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock Google Sign-In with different email
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'different-google-user',
          email: 'different@example.com', // Different email
          name: 'Different User',
        },
        idToken: 'different-id-token',
        accessToken: 'different-access-token',
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.linkGoogleAccount(existingUser);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('email no coincide');
      expect(result.errorCode).toBe('EMAIL_MISMATCH');
    });
  });

  describe('Session Management Flow', () => {
    test('should restore session on app restart', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'android',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock existing session
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'session-user-123',
          email: 'session@example.com',
          name: 'Session User',
        },
        idToken: 'session-id-token',
      });

      // Mock Cognito session validation
      jest.spyOn(cognitoIntegration, 'validateSession').mockResolvedValue({
        isValid: true,
        user: {
          id: 'session-cognito-user',
          email: 'session@example.com',
          name: 'Session User',
        },
        tokens: {
          accessToken: 'valid-access-token',
          idToken: 'valid-id-token',
          refreshToken: 'valid-refresh-token',
        },
      });

      // Act
      await googleSignInManager.initialize();
      const sessionResult = await googleSignInManager.restoreSession();

      // Assert
      expect(sessionResult.success).toBe(true);
      expect(sessionResult.user?.email).toBe('session@example.com');
      expect(sessionResult.isRestoredSession).toBe(true);
    });

    test('should handle expired session gracefully', async () => {
      // Arrange
      jest.spyOn(environmentService, 'detectEnvironment').mockResolvedValue({
        platform: 'ios',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Mock expired session
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.isSignedIn.mockResolvedValue(true);
      GoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'expired-user-123',
          email: 'expired@example.com',
          name: 'Expired User',
        },
        idToken: 'expired-id-token',
      });

      // Mock Cognito session expired
      jest.spyOn(cognitoIntegration, 'validateSession').mockResolvedValue({
        isValid: false,
        error: 'Session expired',
        requiresReauth: true,
      });

      // Act
      await googleSignInManager.initialize();
      const sessionResult = await googleSignInManager.restoreSession();

      // Assert
      expect(sessionResult.success).toBe(false);
      expect(sessionResult.requiresReauth).toBe(true);
      expect(sessionResult.error).toContain('expirada');
    });
  });
});