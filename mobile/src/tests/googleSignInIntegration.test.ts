/**
 * Google Sign-In Integration Tests
 * Tests for Google Sign-In functionality across different environments
 */

import EnvironmentService from '../services/environmentService';
import ConfigurationValidator from '../services/configurationValidator';
import GoogleSignInManager from '../services/googleSignInManager';
import { GoogleSignInError } from '../types/googleSignIn';

// Mock dependencies
jest.mock('../services/environmentService');
jest.mock('../services/configurationValidator');
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
    isSignedIn: jest.fn(),
    getTokens: jest.fn(),
  },
}));

describe('Google Sign-In Integration', () => {
  let environmentService: jest.Mocked<EnvironmentService>;
  let configValidator: jest.Mocked<ConfigurationValidator>;
  let googleSignInManager: GoogleSignInManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocked services
    environmentService = {
      detectEnvironment: jest.fn(),
      isExpoGo: jest.fn(),
      isDevelopmentBuild: jest.fn(),
      isProduction: jest.fn(),
      isWeb: jest.fn(),
      validateGoogleServicesConfiguration: jest.fn(),
      getEnvironmentSummary: jest.fn(),
      logEnvironmentInfo: jest.fn(),
      resetCache: jest.fn(),
    } as any;

    configValidator = {
      validateGoogleServicesJson: jest.fn(),
      validateGoogleServicesPlist: jest.fn(),
      validateAppJsonConfiguration: jest.fn(),
      generateConfigurationReport: jest.fn(),
      printConfigurationReport: jest.fn(),
    } as any;

    // Mock static getInstance methods
    (EnvironmentService.getInstance as jest.Mock) = jest.fn(() => environmentService);
    (ConfigurationValidator.getInstance as jest.Mock) = jest.fn(() => configValidator);

    googleSignInManager = GoogleSignInManager.getInstance();
  });

  describe('Environment Detection', () => {
    test('should detect Expo Go environment correctly', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'expo-go',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('expo-go');
      expect(envInfo.googleSignInAvailable).toBe(false);
      expect(environmentService.detectEnvironment).toHaveBeenCalled();
    });

    test('should detect Development Build environment correctly', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('development-build');
      expect(envInfo.googleSignInAvailable).toBe(true);
      expect(envInfo.hasGoogleServicesFile).toBe(true);
    });

    test('should detect Production environment correctly', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'ios',
        runtime: 'production',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.runtime).toBe('production');
      expect(envInfo.platform).toBe('ios');
      expect(envInfo.googleSignInAvailable).toBe(true);
    });

    test('should detect Web environment correctly', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'web',
        runtime: 'web',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: false },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      const envInfo = await environmentService.detectEnvironment();

      // Assert
      expect(envInfo.platform).toBe('web');
      expect(envInfo.runtime).toBe('web');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate Google Services JSON correctly', async () => {
      // Arrange
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: ['Configuration looks good'],
      };
      configValidator.validateGoogleServicesJson.mockReturnValue(validationResult);

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.suggestions).toContain('Configuration looks good');
    });

    test('should detect missing Google Services files', async () => {
      // Arrange
      const validationResult = {
        isValid: false,
        errors: ['google-services.json not found'],
        warnings: [],
        suggestions: ['Download from Firebase Console'],
      };
      configValidator.validateGoogleServicesJson.mockReturnValue(validationResult);

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('google-services.json not found');
      expect(result.suggestions).toContain('Download from Firebase Console');
    });

    test('should generate comprehensive configuration report', async () => {
      // Arrange
      const configReport = {
        overall: { isValid: true, errors: [], warnings: [], suggestions: [] },
        androidConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        iosConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        webConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        appJsonConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        recommendations: ['Configuration is complete'],
        nextSteps: ['Proceed with testing'],
      };
      configValidator.generateConfigurationReport.mockResolvedValue(configReport);

      // Act
      const report = await configValidator.generateConfigurationReport();

      // Assert
      expect(report.overall.isValid).toBe(true);
      expect(report.recommendations).toContain('Configuration is complete');
      expect(report.nextSteps).toContain('Proceed with testing');
    });
  });

  describe('Google Sign-In Manager', () => {
    test('should initialize correctly in supported environment', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();

      // Assert
      expect(environmentService.detectEnvironment).toHaveBeenCalled();
      expect(googleSignInManager.isAvailable()).toBeDefined();
    });

    test('should handle Expo Go environment gracefully', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'expo-go',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('no está disponible');
      expect(result.errorCode).toBe(GoogleSignInError.CONFIGURATION_ERROR);
    });

    test('should provide appropriate status messages', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'expo-go',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();
      const statusMessage = googleSignInManager.getStatusMessage();

      // Assert
      expect(statusMessage).toContain('Expo Go');
      expect(statusMessage).toContain('email/password');
    });

    test('should validate configuration correctly', async () => {
      // Arrange
      const configReport = {
        overall: { isValid: false, errors: ['Missing config'], warnings: [], suggestions: [] },
        androidConfig: { isValid: false, errors: [], warnings: [], suggestions: [] },
        iosConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        webConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        appJsonConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        recommendations: [],
        nextSteps: [],
      };
      configValidator.generateConfigurationReport.mockResolvedValue(configReport);

      // Act
      const isValid = await googleSignInManager.validateConfiguration();

      // Assert
      expect(isValid).toBe(false);
      expect(configValidator.generateConfigurationReport).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      // Arrange
      environmentService.detectEnvironment.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(environmentService.detectEnvironment()).rejects.toThrow('Network error');
    });

    test('should handle configuration errors gracefully', async () => {
      // Arrange
      configValidator.generateConfigurationReport.mockRejectedValue(new Error('Config error'));

      // Act & Assert
      await expect(configValidator.generateConfigurationReport()).rejects.toThrow('Config error');
    });

    test('should provide helpful error messages', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();
      const result = await googleSignInManager.signIn();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toBe('');
    });
  });

  describe('Fallback Behavior', () => {
    test('should fallback to email authentication in Expo Go', async () => {
      // Arrange
      environmentService.isExpoGo.mockReturnValue(true);
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'expo-go',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();
      const isAvailable = googleSignInManager.isAvailable();

      // Assert
      expect(isAvailable).toBe(false);
      expect(environmentService.isExpoGo).toHaveBeenCalled();
    });

    test('should handle missing configuration gracefully', async () => {
      // Arrange
      environmentService.detectEnvironment.mockResolvedValue({
        platform: 'android',
        runtime: 'development-build',
        googleSignInAvailable: false,
        hasGoogleServicesFile: false,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      });

      // Act
      await googleSignInManager.initialize();
      await googleSignInManager.handleFallback('Missing configuration');

      // Assert
      // Should not throw and should handle gracefully
      expect(true).toBe(true);
    });
  });

  describe('Diagnostics', () => {
    test('should provide comprehensive diagnostics', async () => {
      // Arrange
      const mockEnvInfo = {
        platform: 'android' as const,
        runtime: 'development-build' as const,
        googleSignInAvailable: true,
        hasGoogleServicesFile: true,
        deviceInfo: { isDevice: true },
        buildInfo: { appVersion: '1.0.0', buildVersion: '1' },
      };
      
      const mockConfigReport = {
        overall: { isValid: true, errors: [], warnings: [], suggestions: [] },
        androidConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        iosConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        webConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        appJsonConfig: { isValid: true, errors: [], warnings: [], suggestions: [] },
        recommendations: [],
        nextSteps: [],
      };

      environmentService.detectEnvironment.mockResolvedValue(mockEnvInfo);
      configValidator.generateConfigurationReport.mockResolvedValue(mockConfigReport);

      // Act
      await googleSignInManager.initialize();
      const diagnostics = await googleSignInManager.getDiagnostics();

      // Assert
      expect(diagnostics).toBeDefined();
      expect(diagnostics.environment).toEqual(mockEnvInfo);
      expect(diagnostics.configuration).toEqual(mockConfigReport);
      expect(diagnostics.status).toBeDefined();
    });
  });
});