/**
 * Configuration Validation Tests
 * Tests for validating Google Services configuration files and app.json settings
 */

import ConfigurationValidator from '../services/configurationValidator';
import EnvironmentService from '../services/environmentService';

// Mock dependencies
jest.mock('../services/environmentService');
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      plugins: [
        '@react-native-google-signin/google-signin',
        ['expo-build-properties', {
          android: { googleServicesFile: './google-services.json' },
          ios: { googleServicesFile: './GoogleService-Info.plist' }
        }]
      ],
      scheme: 'trinity',
      android: { package: 'com.trinity.app' },
      ios: { bundleIdentifier: 'com.trinity.app' },
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

describe('Configuration Validation', () => {
  let configValidator: ConfigurationValidator;
  let mockEnvironmentService: jest.Mocked<EnvironmentService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEnvironmentService = {
      isExpoGo: jest.fn(),
      isDevelopmentBuild: jest.fn(),
      isProduction: jest.fn(),
      isWeb: jest.fn(),
    } as any;

    (EnvironmentService.getInstance as jest.Mock) = jest.fn(() => mockEnvironmentService);
    
    configValidator = ConfigurationValidator.getInstance();
  });

  describe('Google Services JSON Validation', () => {
    test('should validate Android configuration correctly', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'android';

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.suggestions).toContain('Configuración de Android parece correcta');
    });

    test('should skip validation for non-Android platforms', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'ios';

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.warnings).toContain('Validación de google-services.json solo aplica para Android');
    });

    test('should detect missing Android configuration', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'android';
      
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['@react-native-google-signin/google-signin'];

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('google-services.json no encontrado o mal configurado');
      expect(result.suggestions).toContain('1. Descarga google-services.json desde Firebase Console');
    });

    test('should provide Expo Go warnings', () => {
      // Arrange
      mockEnvironmentService.isExpoGo.mockReturnValue(true);

      // Act
      const result = configValidator.validateGoogleServicesJson();

      // Assert
      expect(result.warnings).toContain('google-services.json no se usa en Expo Go');
      expect(result.suggestions).toContain('Crea un Development Build para usar Google Services');
    });
  });

  describe('Google Services Plist Validation', () => {
    test('should validate iOS configuration correctly', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'ios';

      // Act
      const result = configValidator.validateGoogleServicesPlist();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.suggestions).toContain('Configuración de iOS parece correcta');
    });

    test('should skip validation for non-iOS platforms', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'android';

      // Act
      const result = configValidator.validateGoogleServicesPlist();

      // Assert
      expect(result.warnings).toContain('Validación de GoogleService-Info.plist solo aplica para iOS');
    });

    test('should detect missing iOS configuration', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'ios';
      
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['@react-native-google-signin/google-signin'];

      // Act
      const result = configValidator.validateGoogleServicesPlist();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('GoogleService-Info.plist no encontrado o mal configurado');
      expect(result.suggestions).toContain('1. Descarga GoogleService-Info.plist desde Firebase Console');
    });
  });

  describe('App.json Configuration Validation', () => {
    test('should validate complete app.json configuration', () => {
      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.isValid).toBe(true);
    });

    test('should detect missing Google Sign-In plugin', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['expo-router'];

      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Plugin de Google Sign-In no configurado en app.json');
      expect(result.suggestions).toContain('Agrega "@react-native-google-signin/google-signin" a plugins en app.json');
    });

    test('should warn about missing build properties plugin', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['@react-native-google-signin/google-signin'];

      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.warnings).toContain('Plugin expo-build-properties no configurado');
      expect(result.suggestions).toContain('Considera agregar expo-build-properties para configurar Google Services files');
    });

    test('should warn about missing URL scheme', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      delete Constants.expoConfig.scheme;

      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.warnings).toContain('URL scheme no configurado');
      expect(result.suggestions).toContain('Configura un scheme único para deep linking');
    });

    test('should warn about missing Android package name', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'android';
      
      const Constants = require('expo-constants').default;
      delete Constants.expoConfig.android;

      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.warnings).toContain('Package name de Android no configurado');
      expect(result.suggestions).toContain('Configura android.package en app.json');
    });

    test('should warn about missing iOS bundle identifier', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'ios';
      
      const Constants = require('expo-constants').default;
      delete Constants.expoConfig.ios;

      // Act
      const result = configValidator.validateAppJsonConfiguration();

      // Assert
      expect(result.warnings).toContain('Bundle identifier de iOS no configurado');
      expect(result.suggestions).toContain('Configura ios.bundleIdentifier en app.json');
    });
  });

  describe('Configuration Report Generation', () => {
    test('should generate comprehensive configuration report', async () => {
      // Arrange
      mockEnvironmentService.isExpoGo.mockReturnValue(false);

      // Act
      const report = await configValidator.generateConfigurationReport();

      // Assert
      expect(report.overall).toBeDefined();
      expect(report.androidConfig).toBeDefined();
      expect(report.iosConfig).toBeDefined();
      expect(report.webConfig).toBeDefined();
      expect(report.appJsonConfig).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.nextSteps).toBeDefined();
    });

    test('should provide Expo Go recommendations', async () => {
      // Arrange
      mockEnvironmentService.isExpoGo.mockReturnValue(true);

      // Act
      const report = await configValidator.generateConfigurationReport();

      // Assert
      expect(report.recommendations).toContain('🔄 Migra a Development Build para usar Google Sign-In nativo');
      expect(report.recommendations).toContain('📱 Usa autenticación email/password como alternativa en Expo Go');
      expect(report.nextSteps).toContain('1. Configura EAS Build');
    });

    test('should provide configuration error recommendations', async () => {
      // Arrange
      mockEnvironmentService.isExpoGo.mockReturnValue(false);
      
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = [];

      // Act
      const report = await configValidator.generateConfigurationReport();

      // Assert
      expect(report.recommendations).toContain('📦 Instala dependencias de Google Sign-In');
      expect(report.recommendations).toContain('⚙️ Configura archivos de Google Services');
      expect(report.nextSteps).toContain('1. npm install @react-native-google-signin/google-signin');
    });

    test('should provide success recommendations for valid configuration', async () => {
      // Arrange
      mockEnvironmentService.isExpoGo.mockReturnValue(false);

      // Act
      const report = await configValidator.generateConfigurationReport();

      // Assert
      if (report.overall.isValid) {
        expect(report.recommendations).toContain('✅ Configuración parece correcta');
        expect(report.recommendations).toContain('🧪 Procede con testing de Google Sign-In');
        expect(report.nextSteps).toContain('1. Prueba Google Sign-In en dispositivo real');
      }
    });
  });

  describe('Web Configuration Validation', () => {
    test('should provide web-specific guidance', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'web';

      // Act
      const result = configValidator['validateWebConfiguration']();

      // Assert
      expect(result.suggestions).toContain('Para web, configura Google OAuth en Firebase Console');
      expect(result.suggestions).toContain('Agrega dominio autorizado en OAuth settings');
      expect(result.suggestions).toContain('Usa Google Sign-In JavaScript SDK para web');
    });

    test('should skip web validation for non-web platforms', () => {
      // Arrange
      const { Platform } = require('react-native');
      Platform.OS = 'android';

      // Act
      const result = configValidator['validateWebConfiguration']();

      // Assert
      expect(result.warnings).toContain('Validación web solo aplica para plataforma web');
    });
  });

  describe('Plugin Detection', () => {
    test('should detect Google Sign-In plugin correctly', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['@react-native-google-signin/google-signin'];

      // Act
      const hasPlugin = configValidator['checkGoogleSignInPlugin'](Constants.expoConfig);

      // Assert
      expect(hasPlugin).toBe(true);
    });

    test('should detect Google Sign-In plugin with configuration', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = [
        ['@react-native-google-signin/google-signin', { iosUrlScheme: 'com.example.app' }]
      ];

      // Act
      const hasPlugin = configValidator['checkGoogleSignInPlugin'](Constants.expoConfig);

      // Assert
      expect(hasPlugin).toBe(true);
    });

    test('should detect build properties plugin correctly', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = [
        ['expo-build-properties', { android: { googleServicesFile: './google-services.json' } }]
      ];

      // Act
      const hasPlugin = configValidator['checkBuildPropertiesPlugin'](Constants.expoConfig);

      // Assert
      expect(hasPlugin).toBe(true);
    });

    test('should not detect missing plugins', () => {
      // Arrange
      const Constants = require('expo-constants').default;
      Constants.expoConfig.plugins = ['expo-router'];

      // Act
      const hasGoogleSignIn = configValidator['checkGoogleSignInPlugin'](Constants.expoConfig);
      const hasBuildProperties = configValidator['checkBuildPropertiesPlugin'](Constants.expoConfig);

      // Assert
      expect(hasGoogleSignIn).toBe(false);
      expect(hasBuildProperties).toBe(false);
    });
  });

  describe('Report Printing', () => {
    test('should print configuration report without errors', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const report = await configValidator.generateConfigurationReport();

      // Act
      configValidator.printConfigurationReport(report);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('📋 Google Sign-In Configuration Report');
      expect(consoleSpy).toHaveBeenCalledWith('=====================================');

      consoleSpy.mockRestore();
    });
  });
});