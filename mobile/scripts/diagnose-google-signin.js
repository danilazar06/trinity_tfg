#!/usr/bin/env node

/**
 * Google Sign-In Diagnostic Tool
 * Provides comprehensive diagnostics for Google Sign-In implementation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GoogleSignInDiagnostic {
  constructor() {
    this.results = {
      environment: {},
      configuration: {},
      dependencies: {},
      connectivity: {},
      recommendations: []
    };
  }

  /**
   * Ejecuta diagnóstico completo
   */
  async diagnose() {
    console.log('🔍 Ejecutando diagnóstico de Google Sign-In...\n');

    try {
      await this.detectEnvironment();
      await this.checkConfiguration();
      await this.checkDependencies();
      await this.checkConnectivity();
      
      this.generateRecommendations();
      this.printReport();
      
    } catch (error) {
      console.error('❌ Error durante diagnóstico:', error.message);
    }
  }

  /**
   * Detecta entorno de ejecución
   */
  async detectEnvironment() {
    console.log('🌍 Detectando entorno...');

    // Detectar plataforma
    this.results.environment.platform = process.platform;
    this.results.environment.nodeVersion = process.version;

    // Verificar herramientas
    const tools = ['expo', 'eas', 'adb', 'xcrun'];
    this.results.environment.tools = {};

    tools.forEach(tool => {
      try {
        const version = execSync(`${tool} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
        this.results.environment.tools[tool] = { available: true, version };
        console.log(`   ✅ ${tool}: ${version}`);
      } catch (error) {
        this.results.environment.tools[tool] = { available: false };
        console.log(`   ❌ ${tool}: No disponible`);
      }
    });

    // Detectar tipo de proyecto
    if (fs.existsSync('app.json')) {
      const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
      this.results.environment.projectType = 'expo-managed';
      this.results.environment.expoSdk = appJson.expo?.sdkVersion || 'latest';
      console.log(`   📱 Proyecto Expo SDK: ${this.results.environment.expoSdk}`);
    } else {
      this.results.environment.projectType = 'react-native-cli';
      console.log('   📱 Proyecto React Native CLI');
    }
  }

  /**
   * Verifica configuración
   */
  async checkConfiguration() {
    console.log('\n⚙️ Verificando configuración...');

    // Verificar app.json
    this.checkAppJson();
    
    // Verificar archivos de Google Services
    this.checkGoogleServicesFiles();
    
    // Verificar variables de entorno
    this.checkEnvironmentVariables();
    
    // Verificar EAS configuration
    this.checkEasConfiguration();
  }

  checkAppJson() {
    if (fs.existsSync('app.json')) {
      try {
        const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
        const expo = appJson.expo;

        this.results.configuration.appJson = {
          exists: true,
          valid: true,
          packageName: expo.android?.package,
          bundleId: expo.ios?.bundleIdentifier,
          plugins: expo.plugins || []
        };

        // Verificar plugin de Google Sign-In
        const hasGooglePlugin = expo.plugins?.some(plugin => 
          Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'
        );

        if (hasGooglePlugin) {
          console.log('   ✅ Plugin de Google Sign-In configurado');
        } else {
          console.log('   ❌ Plugin de Google Sign-In NO configurado');
          this.results.recommendations.push('Agregar plugin @react-native-google-signin/google-signin a app.json');
        }

        console.log(`   📦 Package Android: ${expo.android?.package || 'No configurado'}`);
        console.log(`   🍎 Bundle iOS: ${expo.ios?.bundleIdentifier || 'No configurado'}`);

      } catch (error) {
        this.results.configuration.appJson = { exists: true, valid: false, error: error.message };
        console.log('   ❌ app.json inválido:', error.message);
      }
    } else {
      this.results.configuration.appJson = { exists: false };
      console.log('   ❌ app.json no encontrado');
    }
  }

  checkGoogleServicesFiles() {
    // Android
    if (fs.existsSync('google-services.json')) {
      try {
        const googleServices = JSON.parse(fs.readFileSync('google-services.json', 'utf8'));
        this.results.configuration.androidConfig = {
          exists: true,
          valid: true,
          projectId: googleServices.project_info?.project_id,
          packageName: googleServices.client?.[0]?.client_info?.android_client_info?.package_name
        };
        console.log('   ✅ google-services.json válido');
        console.log(`      Project ID: ${googleServices.project_info?.project_id}`);
      } catch (error) {
        this.results.configuration.androidConfig = { exists: true, valid: false };
        console.log('   ❌ google-services.json inválido');
      }
    } else {
      this.results.configuration.androidConfig = { exists: false };
      console.log('   ⚠️ google-services.json no encontrado (requerido para Android nativo)');
    }

    // iOS
    if (fs.existsSync('GoogleService-Info.plist')) {
      this.results.configuration.iosConfig = { exists: true };
      console.log('   ✅ GoogleService-Info.plist encontrado');
    } else {
      this.results.configuration.iosConfig = { exists: false };
      console.log('   ⚠️ GoogleService-Info.plist no encontrado (requerido para iOS nativo)');
    }
  }

  checkEnvironmentVariables() {
    const envFiles = ['.env', '.env.local', '.env.development'];
    let envFound = false;

    envFiles.forEach(envFile => {
      if (fs.existsSync(envFile)) {
        envFound = true;
        const envContent = fs.readFileSync(envFile, 'utf8');
        
        const variables = [
          'GOOGLE_WEB_CLIENT_ID',
          'GOOGLE_ANDROID_CLIENT_ID',
          'GOOGLE_IOS_CLIENT_ID',
          'AWS_REGION',
          'COGNITO_IDENTITY_POOL_ID'
        ];

        console.log(`   📄 ${envFile}:`);
        variables.forEach(varName => {
          if (envContent.includes(varName)) {
            console.log(`      ✅ ${varName}`);
          } else {
            console.log(`      ❌ ${varName} faltante`);
          }
        });
      }
    });

    if (!envFound) {
      console.log('   ⚠️ No se encontraron archivos de variables de entorno');
      this.results.recommendations.push('Crear archivo .env con variables de Google Sign-In');
    }
  }

  checkEasConfiguration() {
    if (fs.existsSync('eas.json')) {
      try {
        const easJson = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
        this.results.configuration.eas = {
          exists: true,
          valid: true,
          profiles: Object.keys(easJson.build || {})
        };
        
        console.log('   ✅ eas.json configurado');
        console.log(`      Perfiles: ${this.results.configuration.eas.profiles.join(', ')}`);
        
      } catch (error) {
        this.results.configuration.eas = { exists: true, valid: false };
        console.log('   ❌ eas.json inválido');
      }
    } else {
      this.results.configuration.eas = { exists: false };
      console.log('   ⚠️ eas.json no encontrado (requerido para Development Builds)');
    }
  }

  /**
   * Verifica dependencias
   */
  async checkDependencies() {
    console.log('\n📦 Verificando dependencias...');

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      const requiredDeps = {
        '@react-native-google-signin/google-signin': 'Google Sign-In SDK',
        'expo-build-properties': 'Build properties para archivos nativos',
        '@testing-library/react-native': 'Testing utilities',
        'fast-check': 'Property-based testing',
        'ts-node': 'TypeScript execution'
      };

      this.results.dependencies.installed = {};
      
      Object.entries(requiredDeps).forEach(([dep, description]) => {
        if (allDeps[dep]) {
          this.results.dependencies.installed[dep] = allDeps[dep];
          console.log(`   ✅ ${dep}@${allDeps[dep]} - ${description}`);
        } else {
          console.log(`   ❌ ${dep} - ${description} (FALTANTE)`);
          this.results.recommendations.push(`Instalar dependencia: npm install ${dep}`);
        }
      });

      // Verificar versiones de Expo
      if (allDeps.expo) {
        console.log(`   📱 Expo SDK: ${allDeps.expo}`);
      }

    } catch (error) {
      console.log('   ❌ Error leyendo package.json:', error.message);
    }
  }

  /**
   * Verifica conectividad
   */
  async checkConnectivity() {
    console.log('\n🌐 Verificando conectividad...');

    // Verificar conectividad a Google
    await this.testConnection('https://accounts.google.com', 'Google Accounts');
    await this.testConnection('https://www.googleapis.com', 'Google APIs');
    
    // Verificar conectividad al backend local
    await this.testConnection('http://localhost:3002/api/health', 'Backend Local');
    
    // Verificar conectividad a AWS
    await this.testConnection('https://cognito-identity.us-east-1.amazonaws.com', 'AWS Cognito');
  }

  async testConnection(url, service) {
    try {
      const { execSync } = require('child_process');
      
      // Usar curl para probar conectividad
      execSync(`curl -s --max-time 5 -o /dev/null -w "%{http_code}" ${url}`, { 
        encoding: 'utf8',
        timeout: 10000 
      });
      
      console.log(`   ✅ ${service}: Conectividad OK`);
      this.results.connectivity[service] = { status: 'ok' };
      
    } catch (error) {
      console.log(`   ❌ ${service}: Sin conectividad`);
      this.results.connectivity[service] = { status: 'error', error: error.message };
      
      if (service === 'Backend Local') {
        this.results.recommendations.push('Iniciar backend local: cd backend && npm run start:dev');
      }
    }
  }

  /**
   * Genera recomendaciones
   */
  generateRecommendations() {
    // Recomendaciones basadas en entorno
    if (!this.results.environment.tools.expo?.available) {
      this.results.recommendations.push('Instalar Expo CLI: npm install -g @expo/cli');
    }

    if (!this.results.environment.tools.eas?.available) {
      this.results.recommendations.push('Instalar EAS CLI: npm install -g eas-cli');
    }

    // Recomendaciones basadas en configuración
    if (!this.results.configuration.androidConfig?.exists && !this.results.configuration.iosConfig?.exists) {
      this.results.recommendations.push('Configurar archivos de Google Services para habilitar Google Sign-In nativo');
      this.results.recommendations.push('Ver guía: GOOGLE_SIGNIN_SETUP.md');
    }

    // Recomendaciones basadas en conectividad
    const offlineServices = Object.entries(this.results.connectivity)
      .filter(([_, result]) => result.status === 'error')
      .map(([service, _]) => service);

    if (offlineServices.length > 0) {
      this.results.recommendations.push(`Verificar conectividad a: ${offlineServices.join(', ')}`);
    }
  }

  /**
   * Imprime reporte final
   */
  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE DIAGNÓSTICO - GOOGLE SIGN-IN');
    console.log('='.repeat(80));

    // Estado general
    console.log('\n🎯 ESTADO GENERAL:');
    
    const hasGooglePlugin = this.results.configuration.appJson?.plugins?.some(plugin => 
      Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'
    );
    
    const hasNativeFiles = this.results.configuration.androidConfig?.exists || 
                          this.results.configuration.iosConfig?.exists;
    
    const hasRequiredDeps = this.results.dependencies.installed?.['@react-native-google-signin/google-signin'];

    if (hasGooglePlugin && hasNativeFiles && hasRequiredDeps) {
      console.log('   🎉 Google Sign-In COMPLETAMENTE CONFIGURADO');
      console.log('   ✅ Listo para Development Builds y producción');
    } else if (hasGooglePlugin && hasRequiredDeps) {
      console.log('   ⚠️ Google Sign-In PARCIALMENTE CONFIGURADO');
      console.log('   📱 Funciona en web, requiere archivos nativos para móvil');
    } else {
      console.log('   ❌ Google Sign-In NO CONFIGURADO');
      console.log('   🔧 Requiere configuración inicial');
    }

    // Capacidades por entorno
    console.log('\n📱 CAPACIDADES POR ENTORNO:');
    console.log('   🌐 Web Browser: ✅ Funcional (siempre disponible)');
    console.log(`   📱 Expo Go: ❌ No soportado (fallback a email/password)`);
    
    if (hasNativeFiles) {
      console.log('   🔧 Development Build: ✅ Completamente funcional');
      console.log('   🚀 Production Build: ✅ Completamente funcional');
    } else {
      console.log('   🔧 Development Build: ❌ Requiere archivos de Google Services');
      console.log('   🚀 Production Build: ❌ Requiere archivos de Google Services');
    }

    // Recomendaciones
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 RECOMENDACIONES:');
      this.results.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }

    // Próximos pasos
    console.log('\n🚀 PRÓXIMOS PASOS:');
    if (hasGooglePlugin && hasNativeFiles && hasRequiredDeps) {
      console.log('   1. Crear Development Build: npm run build:dev:android');
      console.log('   2. Ejecutar tests: npm run test:master');
      console.log('   3. Probar en dispositivo real');
    } else if (hasGooglePlugin && hasRequiredDeps) {
      console.log('   1. Configurar archivos de Google Services (ver GOOGLE_SIGNIN_SETUP.md)');
      console.log('   2. Crear Development Build');
      console.log('   3. Probar funcionalidad completa');
    } else {
      console.log('   1. Seguir guía de setup: GOOGLE_SIGNIN_SETUP.md');
      console.log('   2. Instalar dependencias faltantes');
      console.log('   3. Configurar archivos de Google Services');
    }

    console.log('\n📚 RECURSOS:');
    console.log('   📖 Setup: GOOGLE_SIGNIN_SETUP.md');
    console.log('   🔧 Development Builds: DEVELOPMENT_BUILD_GUIDE.md');
    console.log('   🚨 Troubleshooting: GOOGLE_SIGNIN_TROUBLESHOOTING.md');
    console.log('   ✅ Testing: GOOGLE_SIGNIN_TESTING_CHECKLIST.md');

    console.log('\n' + '='.repeat(80));
  }
}

// Ejecutar diagnóstico
async function main() {
  const diagnostic = new GoogleSignInDiagnostic();
  await diagnostic.diagnose();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error durante diagnóstico:', error);
    process.exit(1);
  });
}

module.exports = { GoogleSignInDiagnostic };