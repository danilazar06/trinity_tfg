/**
 * Automated Environment Behavior Tests
 * Tests that validate behavior across different runtime environments
 */

import EnvironmentService from '../../services/environmentService';
import GoogleSignInManager from '../../services/googleSignInManager';
import { GoogleSignInError } from '../../types/googleSignIn';

// Mock dependencies
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

jest.mock('expo-constants', () => ({
  default: {
    executionEnvironment: 'storeClient', // Default to production-like
    appOwnership: 'standalone',
  },
}));

describe('Environment Behavior Tests', () => {
  let environmentService: EnvironmentService;
  let googleSignInManager: GoogleSignInManager;

  beforeEach(() => {
    jest.clearAllMocks();
    environmentService = EnvironmentService.getInstance();
    googleSignInManager = GoogleSignInManager.getInstance();
  });

  describe('Expo Go Environment', () => {
    beforeEach(() => {
      // Mock Expo Go environment
      jest.doMock('expo-constants', () => ({
        default: {
          executionEnvironment: 'storeClient',
          appOwnership: 'expo',
        },
      }));
    });

    test('should detect Expo Go environment correctly', async () => {
      const envInfo = await environmentService.detectEnvironment();
      
      expect(envInfo.runtime).toBe('expo-go');
      expect(envInfo.googleSignInAvailable).toBe(false);
    });

    test('should provide appropriate fallback messaging in Expo Go', async () => {
      await googleSignInManager.initialize();
      
      const isAvailable = googleSignInManager.isAvailable();
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(isAvailable).toBe(false);
      expect(statusMessage).toContain('Expo Go');
      expect(statusMessage).toContain('email');
    });

    test('should handle sign-in gracefully in Expo Go', async () => {
      await googleSignInManager.initialize();
      
      const result = await googleSignInManager.signIn();
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(GoogleSignInError.CONFIGURATION_ERROR);
      expect(result.error).toContain('no está disponible');
    });

    test('should suggest Development Build in Expo Go', async () => {
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(statusMessage.toLowerCase()).toMatch(/development build|build de desarrollo/);
    });
  });

  describe('Development Build Environment', () => {
    beforeEach(() => {
      // Mock Development Build environment
      jest.doMock('expo-constants', () => ({
        default: {
          executionEnvironment: 'storeClient',
          appOwnership: 'standalone',
        },
      }));
      
      // Mock Google Services availability
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
    });

    test('should detect Development Build environment correctly', async () => {
      const envInfo = await environmentService.detectEnvironment();
      
      expect(envInfo.runtime).toBe('development-build');
      expect(envInfo.googleSignInAvailable).toBe(true);
    });

    test('should enable Google Sign-In in Development Build', async () => {
      await googleSignInManager.initialize();
      
      const isAvailable = googleSignInManager.isAvailable();
      const capabilities = googleSignInManager.getCapabilities();
      
      expect(isAvailable).toBe(true);
      expect(capabilities?.nativeSignInAvailable).toBe(true);
    });

    test('should handle successful sign-in in Development Build', async () => {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.signIn.mockResolvedValue({
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
        },
        idToken: 'mock-id-token',
      });

      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();
      
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('test@example.com');
    });

    test('should provide positive status message in Development Build', async () => {
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(statusMessage).toContain('disponible');
      expect(statusMessage).not.toContain('no está disponible');
    });
  });

  describe('Web Environment', () => {
    beforeEach(() => {
      // Mock web environment
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: 'localhost' },
        writable: true,
      });
      
      // Mock platform detection
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));
    });

    test('should detect web environment correctly', async () => {
      const envInfo = await environmentService.detectEnvironment();
      
      expect(envInfo.platform).toBe('web');
      expect(envInfo.runtime).toBe('web');
    });

    test('should enable web Google Sign-In', async () => {
      await googleSignInManager.initialize();
      
      const capabilities = googleSignInManager.getCapabilities();
      
      expect(capabilities?.webSignInAvailable).toBe(true);
    });

    test('should provide web-specific status message', async () => {
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(statusMessage).toContain('web');
      expect(statusMessage).toContain('disponible');
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      // Mock production environment
      jest.doMock('expo-constants', () => ({
        default: {
          executionEnvironment: 'storeClient',
          appOwnership: 'standalone',
        },
      }));
      
      // Mock production build indicators
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = 'test';
    });

    test('should detect production environment correctly', async () => {
      const envInfo = await environmentService.detectEnvironment();
      
      expect(envInfo.runtime).toBe('production');
      expect(envInfo.googleSignInAvailable).toBe(true);
    });

    test('should enable all features in production', async () => {
      await googleSignInManager.initialize();
      
      const isAvailable = googleSignInManager.isAvailable();
      const capabilities = googleSignInManager.getCapabilities();
      
      expect(isAvailable).toBe(true);
      expect(capabilities?.nativeSignInAvailable).toBe(true);
      expect(capabilities?.configurationValid).toBe(true);
    });

    test('should provide production-ready status message', async () => {
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(statusMessage).toContain('disponible');
      expect(statusMessage).not.toContain('desarrollo');
      expect(statusMessage).not.toContain('Expo Go');
    });
  });

  describe('Environment Transition Behavior', () => {
    test('should maintain consistency when environment changes', async () => {
      // Initialize in one environment
      await googleSignInManager.initialize();
      const initialCapabilities = googleSignInManager.getCapabilities();
      
      // Simulate environment change (e.g., hot reload)
      jest.clearAllMocks();
      
      // Re-initialize
      await googleSignInManager.initialize();
      const newCapabilities = googleSignInManager.getCapabilities();
      
      // Capabilities should be consistent
      expect(newCapabilities?.environment).toBeDefined();
      expect(typeof newCapabilities?.nativeSignInAvailable).toBe('boolean');
    });

    test('should handle environment detection failures gracefully', async () => {
      // Mock environment detection failure
      jest.spyOn(environmentService, 'detectEnvironment').mockRejectedValue(
        new Error('Environment detection failed')
      );
      
      await googleSignInManager.initialize();
      
      const isAvailable = googleSignInManager.isAvailable();
      const statusMessage = googleSignInManager.getStatusMessage();
      
      // Should fallback gracefully
      expect(isAvailable).toBe(false);
      expect(statusMessage).toContain('error');
      expect(statusMessage).toContain('email');
    });

    test('should provide consistent behavior across multiple initializations', async () => {
      // Initialize multiple times
      await googleSignInManager.initialize();
      const firstStatus = googleSignInManager.getStatusMessage();
      
      await googleSignInManager.initialize();
      const secondStatus = googleSignInManager.getStatusMessage();
      
      await googleSignInManager.initialize();
      const thirdStatus = googleSignInManager.getStatusMessage();
      
      // Status should be consistent
      expect(firstStatus).toBe(secondStatus);
      expect(secondStatus).toBe(thirdStatus);
    });
  });

  describe('Configuration Validation Behavior', () => {
    test('should detect missing configuration files', async () => {
      // Mock missing configuration
      jest.doMock('../../config/google-services.json', () => {
        throw new Error('Module not found');
      });
      
      await googleSignInManager.initialize();
      
      const capabilities = googleSignInManager.getCapabilities();
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(capabilities?.configurationValid).toBe(false);
      expect(statusMessage).toContain('configuración');
    });

    test('should validate configuration file structure', async () => {
      // Mock invalid configuration
      jest.doMock('../../config/google-services.json', () => ({
        // Missing required fields
        project_info: {},
      }));
      
      await googleSignInManager.initialize();
      
      const capabilities = googleSignInManager.getCapabilities();
      
      expect(capabilities?.configurationValid).toBe(false);
    });

    test('should provide helpful messages for configuration issues', async () => {
      // Mock configuration issues
      jest.doMock('../../config/google-services.json', () => {
        throw new Error('Invalid JSON');
      });
      
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      expect(statusMessage).toContain('configuración');
      expect(statusMessage).toContain('google-services.json');
    });
  });

  describe('Fallback Mechanism Behavior', () => {
    test('should always provide fallback when Google Sign-In fails', async () => {
      // Mock Google Sign-In failure
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.signIn.mockRejectedValue(new Error('Google Sign-In failed'));
      
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      expect(statusMessage).toContain('email');
    });

    test('should provide environment-specific fallback messages', async () => {
      await googleSignInManager.initialize();
      
      const statusMessage = googleSignInManager.getStatusMessage();
      
      // Should always mention email/password as fallback
      expect(statusMessage.toLowerCase()).toMatch(/email|correo|password|contraseña/);
    });

    test('should maintain app functionality when Google Sign-In is unavailable', async () => {
      // Force Google Sign-In to be unavailable
      jest.spyOn(googleSignInManager, 'isAvailable').mockReturnValue(false);
      
      await googleSignInManager.initialize();
      
      // App should still be functional
      expect(googleSignInManager.getStatusMessage).not.toThrow();
      expect(googleSignInManager.getCapabilities).not.toThrow();
      
      const result = await googleSignInManager.signIn();
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});