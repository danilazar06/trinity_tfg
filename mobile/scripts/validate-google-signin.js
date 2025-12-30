#!/usr/bin/env node

/**
 * Google Sign-In Validation Script
 * Validates complete Google Sign-In implementation and configuration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GoogleSignInValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.validationResults = {};
  }

  /**
   * Ejecuta validación completa
   */
  async validate() {
    console.log('🔍 Validando implementación de Google Sign-In...\n');

    // Validaciones
    this.validateProjectStructure();
    this.validateConfiguration();
    this.validateDependencies();
    this.validateImplementation();
    this.validateDocumentation();
    this.validateTests();

    // Generar reporte
    this.generateReport();
  }

  /**
   * Valida estructura del proyecto
   */
  validateProjectStructure() {
    console.log('📁 Validando estructura del proyecto...');

    const requiredFiles = [
      'app.json',
      'eas.json',
      'package.json',
      'src/services/googleSignInManager.ts',
      'src/services/environmentService.ts',
      'src/services/configurationValidator.ts',
      'src/context/EnhancedAuthContext.tsx',
      'src/components/GoogleSignInButton.tsx',
      'src/hooks/useGoogleSignIn.ts',
      'src/types/googleSignIn.ts',
    ];

    const requiredDirectories = [
      'src/services/auth-strategies',
      'src/tests/properties',
      'src/tests/automated',
      'src/tests/e2e',
      'scripts',
    ];

    // Verificar archivos
    requiredFiles.forEach(file => {
      if (fs.existsSync(file)) {
        this.info.push(`✅ ${file}`);
      } else {
        this.errors.push(`❌ Archivo faltante: ${file}`);
      }
    });

    // Verificar directorios
    requiredDirectories.forEach(dir => {
      if (fs.existsSync(dir)) {
        this.info.push(`✅ ${dir}/`);
      } else {
        this.errors.push(`❌ Directorio faltante: ${dir}/`);
      }
    });

    this.validationResults.structure = {
      passed: this.errors.length === 0,
      details: `${requiredFiles.length + requiredDirectories.length - this.errors.length}/${requiredFiles.length + requiredDirectories.length} elementos encontrados`
    };
  }

  /**
   * Valida configuración
   */
  validateConfiguration() {
    console.log('⚙️ Validando configuración...');

    // Validar app.json
    this.validateAppJson();
    
    // Validar eas.json
    this.validateEasJson();
    
    // Validar archivos de Google Services
    this.validateGoogleServicesFiles();
    
    // Validar variables de entorno
    this.validateEnvironmentVariables();
  }

  validateAppJson() {
    try {
      const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
      const expo = appJson.expo;

      // Verificar plugins
      const plugins = expo.plugins || [];
      const hasGoogleSignInPlugin = plugins.some(plugin => 
        Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'
      );

      if (hasGoogleSignInPlugin) {
        this.info.push('✅ Plugin de Google Sign-In configurado en app.json');
      } else {
        this.errors.push('❌ Plugin de Google Sign-In faltante en app.json');
      }

      // Verificar configuración de plataformas
      if (expo.android?.package) {
        this.info.push(`✅ Package Android: ${expo.android.package}`);
      } else {
        this.warnings.push('⚠️ Package Android no configurado');
      }

      if (expo.ios?.bundleIdentifier) {
        this.info.push(`✅ Bundle ID iOS: ${expo.ios.bundleIdentifier}`);
      } else {
        this.warnings.push('⚠️ Bundle ID iOS no configurado');
      }

    } catch (error) {
      this.errors.push(`❌ Error leyendo app.json: ${error.message}`);
    }
  }

  validateEasJson() {
    try {
      const easJson = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
      
      if (easJson.build?.development) {
        this.info.push('✅ Perfil de development build configurado');
      } else {
        this.warnings.push('⚠️ Perfil de development build no configurado');
      }

      if (easJson.build?.production) {
        this.info.push('✅ Perfil de production build configurado');
      } else {
        this.warnings.push('⚠️ Perfil de production build no configurado');
      }

    } catch (error) {
      this.warnings.push(`⚠️ eas.json no encontrado o inválido: ${error.message}`);
    }
  }

  validateGoogleServicesFiles() {
    // google-services.json (Android)
    if (fs.existsSync('google-services.json')) {
      try {
        const googleServices = JSON.parse(fs.readFileSync('google-services.json', 'utf8'));
        if (googleServices.project_info && googleServices.client) {
          this.info.push('✅ google-services.json válido');
        } else {
          this.warnings.push('⚠️ google-services.json tiene formato incorrecto');
        }
      } catch (error) {
        this.warnings.push('⚠️ google-services.json no es JSON válido');
      }
    } else {
      this.warnings.push('⚠️ google-services.json no encontrado (requerido para Android nativo)');
    }

    // GoogleService-Info.plist (iOS)
    if (fs.existsSync('GoogleService-Info.plist')) {
      this.info.push('✅ GoogleService-Info.plist encontrado');
    } else {
      this.warnings.push('⚠️ GoogleService-Info.plist no encontrado (requerido para iOS nativo)');
    }
  }

  validateEnvironmentVariables() {
    const envFile = '.env';
    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      
      const requiredVars = [
        'GOOGLE_WEB_CLIENT_ID',
        'AWS_REGION',
        'COGNITO_IDENTITY_POOL_ID',
        'COGNITO_USER_POOL_ID',
        'COGNITO_USER_POOL_CLIENT_ID'
      ];

      requiredVars.forEach(varName => {
        if (envContent.includes(varName)) {
          this.info.push(`✅ Variable de entorno: ${varName}`);
        } else {
          this.warnings.push(`⚠️ Variable de entorno faltante: ${varName}`);
        }
      });
    } else {
      this.warnings.push('⚠️ Archivo .env no encontrado');
    }
  }

  /**
   * Valida dependencias
   */
  validateDependencies() {
    console.log('📦 Validando dependencias...');

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      const requiredDeps = [
        '@react-native-google-signin/google-signin',
        'expo-build-properties',
        '@testing-library/react-native',
        'fast-check',
        'ts-node'
      ];

      requiredDeps.forEach(dep => {
        if (dependencies[dep]) {
          this.info.push(`✅ Dependencia: ${dep}@${dependencies[dep]}`);
        } else {
          this.errors.push(`❌ Dependencia faltante: ${dep}`);
        }
      });

      this.validationResults.dependencies = {
        passed: requiredDeps.every(dep => dependencies[dep]),
        details: `${requiredDeps.filter(dep => dependencies[dep]).length}/${requiredDeps.length} dependencias encontradas`
      };

    } catch (error) {
      this.errors.push(`❌ Error leyendo package.json: ${error.message}`);
    }
  }

  /**
   * Valida implementación
   */
  validateImplementation() {
    console.log('🔧 Validando implementación...');

    // Verificar servicios principales
    this.validateService('src/services/googleSignInManager.ts', [
      'class GoogleSignInManager',
      'async initialize',
      'async signIn',
      'isAvailable',
      'getCapabilities'
    ]);

    this.validateService('src/services/environmentService.ts', [
      'class EnvironmentService',
      'detectEnvironment',
      'isExpoGo',
      'isDevelopmentBuild'
    ]);

    // Verificar componentes
    this.validateComponent('src/components/GoogleSignInButton.tsx', [
      'GoogleSignInButton',
      'useEnhancedAuth',
      'TouchableOpacity'
    ]);

    // Verificar contexto
    this.validateComponent('src/context/EnhancedAuthContext.tsx', [
      'EnhancedAuthProvider',
      'useEnhancedAuth',
      'signInWithGoogle'
    ]);

    // Verificar estrategias
    const strategiesDir = 'src/services/auth-strategies';
    if (fs.existsSync(strategiesDir)) {
      const strategies = fs.readdirSync(strategiesDir);
      if (strategies.length >= 3) {
        this.info.push(`✅ ${strategies.length} estrategias de autenticación implementadas`);
      } else {
        this.warnings.push('⚠️ Pocas estrategias de autenticación implementadas');
      }
    }
  }

  validateService(filePath, requiredElements) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const missingElements = requiredElements.filter(element => !content.includes(element));
      
      if (missingElements.length === 0) {
        this.info.push(`✅ ${filePath} - implementación completa`);
      } else {
        this.warnings.push(`⚠️ ${filePath} - elementos faltantes: ${missingElements.join(', ')}`);
      }
    } else {
      this.errors.push(`❌ Archivo faltante: ${filePath}`);
    }
  }

  validateComponent(filePath, requiredElements) {
    this.validateService(filePath, requiredElements);
  }

  /**
   * Valida documentación
   */
  validateDocumentation() {
    console.log('📚 Validando documentación...');

    const requiredDocs = [
      'README.md',
      'GOOGLE_SIGNIN_SETUP.md',
      'DEVELOPMENT_BUILD_GUIDE.md',
      'GOOGLE_SIGNIN_TROUBLESHOOTING.md',
      'GOOGLE_SIGNIN_TESTING_CHECKLIST.md'
    ];

    requiredDocs.forEach(doc => {
      if (fs.existsSync(doc)) {
        const content = fs.readFileSync(doc, 'utf8');
        if (content.length > 1000) {
          this.info.push(`✅ ${doc} (${Math.round(content.length/1000)}k chars)`);
        } else {
          this.warnings.push(`⚠️ ${doc} parece incompleto`);
        }
      } else {
        this.errors.push(`❌ Documentación faltante: ${doc}`);
      }
    });

    this.validationResults.documentation = {
      passed: requiredDocs.every(doc => fs.existsSync(doc)),
      details: `${requiredDocs.filter(doc => fs.existsSync(doc)).length}/${requiredDocs.length} documentos encontrados`
    };
  }

  /**
   * Valida tests
   */
  validateTests() {
    console.log('🧪 Validando tests...');

    const testFiles = [
      'src/tests/googleSignInIntegration.test.ts',
      'src/tests/environmentDetection.test.ts',
      'src/tests/configurationValidation.test.ts',
      'src/tests/properties/googleSignInProperties.test.ts',
      'src/tests/properties/authenticationFlowProperties.test.ts',
      'src/tests/automated/environmentBehavior.test.ts',
      'src/tests/automated/configurationScenarios.test.ts',
      'src/tests/e2e/googleSignInFlow.test.ts',
      'src/tests/e2e/authenticationIntegration.test.ts',
      'src/tests/run-google-signin-tests.ts'
    ];

    let testCount = 0;
    testFiles.forEach(testFile => {
      if (fs.existsSync(testFile)) {
        const content = fs.readFileSync(testFile, 'utf8');
        const testMatches = content.match(/test\(|it\(/g);
        const testCaseCount = testMatches ? testMatches.length : 0;
        testCount += testCaseCount;
        
        this.info.push(`✅ ${testFile} (${testCaseCount} tests)`);
      } else {
        this.errors.push(`❌ Test faltante: ${testFile}`);
      }
    });

    this.validationResults.tests = {
      passed: testFiles.every(file => fs.existsSync(file)),
      details: `${testCount} test cases en ${testFiles.filter(file => fs.existsSync(file)).length}/${testFiles.length} archivos`
    };
  }

  /**
   * Genera reporte final
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE VALIDACIÓN - GOOGLE SIGN-IN');
    console.log('='.repeat(80));

    // Resumen por categoría
    console.log('\n📋 RESUMEN POR CATEGORÍA:');
    Object.entries(this.validationResults).forEach(([category, result]) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`   ${status} ${category.toUpperCase()}: ${result.details}`);
    });

    // Errores críticos
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORES CRÍTICOS:');
      this.errors.forEach(error => console.log(`   ${error}`));
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('\n⚠️ ADVERTENCIAS:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    // Estado general
    console.log('\n🎯 ESTADO GENERAL:');
    const criticalIssues = this.errors.length;
    const warnings = this.warnings.length;

    if (criticalIssues === 0 && warnings === 0) {
      console.log('   🎉 EXCELENTE: Implementación completa y lista para producción');
    } else if (criticalIssues === 0 && warnings <= 3) {
      console.log('   ✅ BUENO: Implementación funcional con advertencias menores');
    } else if (criticalIssues <= 2) {
      console.log('   ⚠️ ACEPTABLE: Algunos problemas que deben corregirse');
    } else {
      console.log('   ❌ CRÍTICO: Múltiples problemas que impiden el funcionamiento');
    }

    // Recomendaciones
    console.log('\n💡 PRÓXIMOS PASOS:');
    if (criticalIssues > 0) {
      console.log('   1. Corregir errores críticos listados arriba');
      console.log('   2. Ejecutar validación nuevamente');
    } else {
      console.log('   1. Revisar y corregir advertencias si es necesario');
      console.log('   2. Ejecutar tests: npm run test:master');
      console.log('   3. Probar en Development Build');
      console.log('   4. Validar en dispositivos reales');
    }

    console.log('\n' + '='.repeat(80));

    // Código de salida
    if (criticalIssues > 0) {
      process.exit(1);
    }
  }
}

// Ejecutar validación
async function main() {
  const validator = new GoogleSignInValidator();
  await validator.validate();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error durante validación:', error);
    process.exit(1);
  });
}

module.exports = { GoogleSignInValidator };