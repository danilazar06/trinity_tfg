/**
 * Configuration Scenarios Tests
 * Tests various configuration scenarios and edge cases
 */

import ConfigurationValidator from '../../services/configurationValidator';
import GoogleSignInManager from '../../services/googleSignInManager';
import { GoogleSignInError } from '../../types/googleSignIn';

// Mock file system access
jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  },
}));

describe('Configuration Scenarios Tests', () => {
  let configValidator: ConfigurationValidator;
  let googleSignInManager: GoogleSignInManager;

  beforeEach(() => {
    jest.clearAllMocks();
    configValidator = ConfigurationValidator.getInstance();
    googleSignInManager = GoogleSignInManager.getInstance();
  });

  describe('Valid Configuration Scenarios', () => {
    test('should handle complete Android configuration', async () => {
      // Mock valid google-services.json
      const mockGoogleServices = {
        project_info: {
          project_number: '123456789',
          project_id: 'test-project',
        },
        client: [{
          client_info: {
            mobilesdk_app_id: '1:123456789:android:abcdef',
            android_client_info: {
              package_name: 'com.trinity.app',
            },
          },
          oauth_client: [{
            client_id: '123456789-android.apps.googleusercontent.com',
            client_type: 1,
          }],
        }],
      };

      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(JSON.stringify(mockGoogleServices));

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.clientId).toBe('123456789-android.apps.googleusercontent.com');
    });

    test('should handle complete iOS configuration', async () => {
      // Mock valid GoogleService-Info.plist
      const mockPlistContent = `
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
          <key>CLIENT_ID</key>
          <string>123456789-ios.apps.googleusercontent.com</string>
          <key>BUNDLE_ID</key>
          <string>com.trinity.app</string>
          <key>PROJECT_ID</key>
          <string>test-project</string>
        </dict>
        </plist>
      `;

      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(mockPlistContent);

      const validation = await configValidator.validateiOSConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.clientId).toBe('123456789-ios.apps.googleusercontent.com');
    });

    test('should handle valid web configuration', async () => {
      // Mock environment variables
      process.env.GOOGLE_WEB_CLIENT_ID = '123456789-web.apps.googleusercontent.com';

      const validation = await configValidator.validateWebConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.clientId).toBe('123456789-web.apps.googleusercontent.com');

      // Clean up
      delete process.env.GOOGLE_WEB_CLIENT_ID;
    });
  });

  describe('Missing Configuration Scenarios', () => {
    test('should handle missing google-services.json', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(false);

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('google-services.json no encontrado');
      expect(validation.suggestions).toContain('Descargar desde Firebase Console');
    });

    test('should handle missing GoogleService-Info.plist', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(false);

      const validation = await configValidator.validateiOSConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('GoogleService-Info.plist no encontrado');
      expect(validation.suggestions).toContain('Descargar desde Firebase Console');
    });

    test('should handle missing web client ID', async () => {
      // Ensure no web client ID is set
      delete process.env.GOOGLE_WEB_CLIENT_ID;

      const validation = await configValidator.validateWebConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('GOOGLE_WEB_CLIENT_ID no configurado');
      expect(validation.suggestions).toContain('Configurar en .env');
    });
  });

  describe('Invalid Configuration Scenarios', () => {
    test('should handle corrupted google-services.json', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue('{ invalid json }');

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('JSON inválido');
    });

    test('should handle incomplete google-services.json', async () => {
      const incompleteConfig = {
        project_info: {
          // Missing project_number and project_id
        },
        client: [],
      };

      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(JSON.stringify(incompleteConfig));

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.suggestions).toContain('Verificar configuración en Firebase');
    });

    test('should handle wrong package name in configuration', async () => {
      const wrongPackageConfig = {
        project_info: {
          project_number: '123456789',
          project_id: 'test-project',
        },
        client: [{
          client_info: {
            mobilesdk_app_id: '1:123456789:android:abcdef',
            android_client_info: {
              package_name: 'com.wrong.package', // Wrong package name
            },
          },
          oauth_client: [{
            client_id: '123456789-android.apps.googleusercontent.com',
            client_type: 1,
          }],
        }],
      };

      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(JSON.stringify(wrongPackageConfig));

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Package name no coincide');
      expect(validation.suggestions).toContain('Verificar package name en app.json');
    });

    test('should handle invalid web client ID format', async () => {
      process.env.GOOGLE_WEB_CLIENT_ID = 'invalid-client-id';

      const validation = await configValidator.validateWebConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Formato de Client ID inválido');

      // Clean up
      delete process.env.GOOGLE_WEB_CLIENT_ID;
    });
  });

  describe('Configuration Impact on Google Sign-In Manager', () => {
    test('should disable Google Sign-In with invalid configuration', async () => {
      // Mock invalid configuration
      jest.spyOn(configValidator, 'validateConfiguration').mockResolvedValue({
        isValid: false,
        platform: 'android',
        errors: ['Configuración inválida'],
        suggestions: ['Verificar archivos de configuración'],
      });

      await googleSignInManager.initialize();

      const isAvailable = googleSignInManager.isAvailable();
      const capabilities = googleSignInManager.getCapabilities();

      expect(isAvailable).toBe(false);
      expect(capabilities?.configurationValid).toBe(false);
    });

    test('should provide configuration-specific error messages', async () => {
      // Mock configuration validation with specific errors
      jest.spyOn(configValidator, 'validateConfiguration').mockResolvedValue({
        isValid: false,
        platform: 'android',
        errors: ['google-services.json no encontrado'],
        suggestions: ['Descargar desde Firebase Console'],
      });

      await googleSignInManager.initialize();

      const result = await googleSignInManager.signIn();
      const statusMessage = googleSignInManager.getStatusMessage();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(GoogleSignInError.CONFIGURATION_ERROR);
      expect(statusMessage).toContain('configuración');
    });

    test('should enable Google Sign-In with valid configuration', async () => {
      // Mock valid configuration
      jest.spyOn(configValidator, 'validateConfiguration').mockResolvedValue({
        isValid: true,
        platform: 'android',
        clientId: '123456789-android.apps.googleusercontent.com',
        errors: [],
        suggestions: [],
      });

      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.hasPlayServices.mockResolvedValue(true);

      await googleSignInManager.initialize();

      const isAvailable = googleSignInManager.isAvailable();
      const capabilities = googleSignInManager.getCapabilities();

      expect(isAvailable).toBe(true);
      expect(capabilities?.configurationValid).toBe(true);
    });
  });

  describe('Configuration Recovery Scenarios', () => {
    test('should provide recovery steps for missing files', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(false);

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.suggestions).toContain('Descargar desde Firebase Console');
      expect(validation.suggestions).toContain('Colocar en la carpeta mobile/');
    });

    test('should provide recovery steps for invalid configuration', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue('{ invalid }');

      const validation = await configValidator.validateAndroidConfiguration();

      expect(validation.suggestions).toContain('Verificar formato JSON');
      expect(validation.suggestions).toContain('Descargar nuevamente desde Firebase');
    });

    test('should provide platform-specific recovery guidance', async () => {
      // Test Android-specific guidance
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(false);

      const androidValidation = await configValidator.validateAndroidConfiguration();
      expect(androidValidation.suggestions).toContain('google-services.json');

      // Test iOS-specific guidance
      const iosValidation = await configValidator.validateiOSConfiguration();
      expect(iosValidation.suggestions).toContain('GoogleService-Info.plist');
    });
  });

  describe('Environment-Specific Configuration', () => {
    test('should handle development vs production configuration differences', async () => {
      // Mock development environment
      process.env.NODE_ENV = 'development';

      const devValidation = await configValidator.validateConfiguration();

      // Mock production environment
      process.env.NODE_ENV = 'production';

      const prodValidation = await configValidator.validateConfiguration();

      // Both should have consistent validation logic
      expect(typeof devValidation.isValid).toBe('boolean');
      expect(typeof prodValidation.isValid).toBe('boolean');

      // Clean up
      process.env.NODE_ENV = 'test';
    });

    test('should validate configuration for different build types', async () => {
      // Mock EAS build environment
      process.env.EAS_BUILD = 'true';

      const validation = await configValidator.validateConfiguration();

      expect(validation).toBeDefined();
      expect(typeof validation.isValid).toBe('boolean');

      // Clean up
      delete process.env.EAS_BUILD;
    });
  });

  describe('Configuration Caching and Performance', () => {
    test('should cache validation results for performance', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue('{}');

      // First validation
      await configValidator.validateConfiguration();
      const firstCallCount = RNFS.exists.mock.calls.length;

      // Second validation (should use cache)
      await configValidator.validateConfiguration();
      const secondCallCount = RNFS.exists.mock.calls.length;

      // Should not make additional file system calls
      expect(secondCallCount).toBe(firstCallCount);
    });

    test('should invalidate cache when configuration changes', async () => {
      const RNFS = require('react-native-fs');
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue('{}');

      // Initial validation
      await configValidator.validateConfiguration();

      // Simulate configuration change
      configValidator.clearCache();

      // New validation should re-read files
      RNFS.readFile.mockClear();
      await configValidator.validateConfiguration();

      expect(RNFS.readFile).toHaveBeenCalled();
    });
  });
});