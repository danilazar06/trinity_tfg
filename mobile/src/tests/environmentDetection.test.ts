/**
 * Environment Detection Tests
 * Tests for detecting different runtime environments and their capabilities
 */

import EnvironmentService from '../services/environmentService';

// Mock Expo modules
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    appOwnership: 'standalone',
    executionEnvironment: 'standalone',
    expoConfig: {
      version: '1.0.0',
      sdkVersion: '52.0.0',
      plugins: [
        '@react-native-google-signin/google-signin',
        ['expo-build-properties', { android: { googleServicesFile: './google-services.json' } }]
      ],
    },
  },
}));

jest.mock('expo-device', () => ({
  __esModule: true,
  isDevice: true,
  deviceName: 'Test Device',
  osVersion: '14.0',
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

// Mock Google Sign-In module
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    hasPlayServices: jest.fn(),
  },
}));

describe('Environment Detection', () => {
  let environmentService: EnvironmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    environmentService = EnvironmentService.getInstance();
    environmentService.resetCache();
  });

  describe('Platform Detection', () => {
    test('should detect Android platform correctly', async () => {
      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.platform).toBe('android');
    });

    test('should detect iOS platform correctly', async () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'ios';

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.platform).toBe('ios');
    });

    test('should detect Web platform correctly', async () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'web';

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.platform).toBe('web');
    });
  });

  describe('Runtime Detection', () => {
    test('should detect Expo Go environment', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'expo';
      Constants.executionEnvironment = 'storeClient';

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('expo-go');
    });

    test('should detect Development Build environment', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'standalone';
      Constants.executionEnvironment = 'standalone';
      global.__DEV__ = true;

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('development-build');
    });

    test('should detect Production environment', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'standalone';
      Constants.executionEnvironment = 'standalone';
      global.__DEV__ = false;

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('production');
    });

    test('should detect Web environment', async () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'web';

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('web');
    });
  });

  describe('Google Sign-In Availability', () => {
    test('should detect Google Sign-In availability in Development Build', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.googleSignInAvailable).toBe(true);
    });

    test('should detect Google Sign-In unavailability in Expo Go', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'expo';
      Constants.executionEnvironment = 'storeClient';

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.googleSignInAvailable).toBe(false);
    });

    test('should handle Play Services unavailable on Android', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockRejectedValue(new Error('Play Services not available'));

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.googleSignInAvailable).toBe(false);
    });
  });

  describe('Configuration File Detection', () => {
    test('should detect Google Services file configuration', async () => {
      // Arrange - already configured in mock

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.hasGoogleServicesFile).toBe(true);
    });

    test('should detect missing Google Services file configuration', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['@react-native-google-signin/google-signin'];

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.hasGoogleServicesFile).toBe(false);
    });
  });

  describe('Device Information', () => {
    test('should collect device information correctly', async () => {
      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.deviceInfo.isDevice).toBe(true);
      expect(envInfo.deviceInfo.deviceName).toBe('Test Device');
      expect(envInfo.deviceInfo.osVersion).toBe('14.0');
    });

    test('should collect build information correctly', async () => {
      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.buildInfo.appVersion).toBe('1.0.0');
      expect(envInfo.buildInfo.expoVersion).toBe('52.0.0');
    });
  });

  describe('Validation', () => {
    test('should validate configuration for Development Build', async () => {
      // Arrange
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);

      // Act
      const validation = await environmentService.validateGoogleServicesConfiguration();

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should provide warnings for Expo Go', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'expo';
      Constants.executionEnvironment = 'storeClient';

      // Act
      const validation = await environmentService.validateGoogleServicesConfiguration();

      // Assert
      expect(validation.warnings).toContain('Ejecutándose en Expo Go - Google Sign-In nativo no está disponible');
      expect(validation.suggestions).toContain('Usa un Development Build para probar Google Sign-In nativo');
    });

    test('should provide errors for missing configuration', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = [];
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockRejectedValue(new Error('Not available'));

      // Act
      const validation = await environmentService.validateGoogleServicesConfiguration();

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Utility Methods', () => {
    test('should provide correct environment summary', async () => {
      // Act
      await environmentService.detectEnvironment();
      const summary = environmentService.getEnvironmentSummary();

      // Assert
      expect(summary).toContain('Plataforma: ANDROID');
      expect(summary).toContain('Google Sign-In disponible:');
      expect(summary).toContain('Archivos de configuración:');
    });

    test('should log environment information', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await environmentService.detectEnvironment();
      environmentService.logEnvironmentInfo();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('🔍 Environment Detection Results:');
      expect(consoleSpy).toHaveBeenCalledWith('================================');

      consoleSpy.mockRestore();
    });

    test('should handle cache correctly', async () => {
      // Act
      const envInfo1 = await environmentService.detectEnvironment();
      const envInfo2 = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo1).toEqual(envInfo2);

      // Reset cache and detect again
      environmentService.resetCache();
      const envInfo3 = await environmentService.detectEnvironment();

      // Should still be equal but freshly detected
      expect(envInfo3.platform).toBe(envInfo1.platform);
    });
  });

  describe('Helper Methods', () => {
    test('should correctly identify Expo Go', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'expo';

      // Act
      const isExpoGo = environmentService.isExpoGo();

      // Assert
      expect(isExpoGo).toBe(true);
    });

    test('should correctly identify Development Build', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'standalone';
      global.__DEV__ = true;

      // Act
      const isDevelopmentBuild = environmentService.isDevelopmentBuild();

      // Assert
      expect(isDevelopmentBuild).toBe(true);
    });

    test('should correctly identify Production', async () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.appOwnership = 'standalone';
      global.__DEV__ = false;

      // Act
      const isProduction = environmentService.isProduction();

      // Assert
      expect(isProduction).toBe(true);
    });

    test('should correctly identify Web', async () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'web';

      // Act
      const isWeb = environmentService.isWeb();

      // Assert
      expect(isWeb).toBe(true);
    });
  });
});