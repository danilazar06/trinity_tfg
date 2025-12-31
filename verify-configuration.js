#!/usr/bin/env node

/**
 * Script de verificación de configuración para Trinity
 * Verifica que todas las variables de entorno y configuraciones estén correctas
 */

const fs = require('fs');
const path = require('path');

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✅ ${description}: ${filePath}`, 'green');
    return true;
  } else {
    log(`❌ ${description}: ${filePath} - NO ENCONTRADO`, 'red');
    return false;
  }
}

function checkEnvVariable(envContent, varName, description) {
  const regex = new RegExp(`^${varName}=(.+)$`, 'm');
  const match = envContent.match(regex);
  
  if (match && match[1] && !match[1].includes('YOUR_') && !match[1].includes('PLACEHOLDER')) {
    log(`✅ ${description}: ${match[1]}`, 'green');
    return true;
  } else {
    log(`❌ ${description}: NO CONFIGURADO O PLACEHOLDER`, 'red');
    return false;
  }
}

function verifyConfiguration() {
  log('🔍 VERIFICACIÓN DE CONFIGURACIÓN DE TRINITY', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  let allGood = true;
  
  // 1. Verificar archivos principales
  log('\n📁 Verificando archivos principales...', 'blue');
  allGood &= checkFile('.env', 'Archivo de entorno raíz');
  allGood &= checkFile('backend/.env', 'Archivo de entorno backend');
  allGood &= checkFile('mobile/app.json', 'Configuración de Expo');
  allGood &= checkFile('mobile/google-services.json', 'Google Services para Android');
  allGood &= checkFile('mobile/src/config/aws-config.ts', 'Configuración de AWS');
  
  // 2. Verificar configuración de .env raíz
  if (fs.existsSync('.env')) {
    log('\n🌍 Verificando variables de entorno raíz...', 'blue');
    const rootEnv = fs.readFileSync('.env', 'utf8');
    
    allGood &= checkEnvVariable(rootEnv, 'AWS_ACCOUNT_ID', 'AWS Account ID');
    allGood &= checkEnvVariable(rootEnv, 'AWS_REGION', 'AWS Region');
    allGood &= checkEnvVariable(rootEnv, 'GRAPHQL_API_URL', 'GraphQL API URL');
    allGood &= checkEnvVariable(rootEnv, 'COGNITO_USER_POOL_ID', 'Cognito User Pool ID');
    allGood &= checkEnvVariable(rootEnv, 'COGNITO_CLIENT_ID', 'Cognito Client ID');
    allGood &= checkEnvVariable(rootEnv, 'TMDB_API_KEY', 'TMDB API Key');
    allGood &= checkEnvVariable(rootEnv, 'HF_API_TOKEN', 'Hugging Face API Token');
    
    // Variables de Google OAuth (pueden estar como placeholder)
    if (rootEnv.includes('GOOGLE_WEB_CLIENT_ID=YOUR_GOOGLE')) {
      log(`⚠️  Google OAuth Web Client ID: NECESITA CONFIGURACIÓN`, 'yellow');
    } else {
      allGood &= checkEnvVariable(rootEnv, 'GOOGLE_WEB_CLIENT_ID', 'Google OAuth Web Client ID');
    }
  }
  
  // 3. Verificar configuración de backend/.env
  if (fs.existsSync('backend/.env')) {
    log('\n🖥️  Verificando variables de entorno backend...', 'blue');
    const backendEnv = fs.readFileSync('backend/.env', 'utf8');
    
    allGood &= checkEnvVariable(backendEnv, 'APPSYNC_API_URL', 'AppSync API URL');
    allGood &= checkEnvVariable(backendEnv, 'APPSYNC_API_ID', 'AppSync API ID');
    allGood &= checkEnvVariable(backendEnv, 'COGNITO_USER_POOL_ID', 'Cognito User Pool ID (Backend)');
    allGood &= checkEnvVariable(backendEnv, 'USERS_TABLE', 'Users Table Name');
    allGood &= checkEnvVariable(backendEnv, 'ROOMS_TABLE', 'Rooms Table Name');
  }
  
  // 4. Verificar configuración de mobile/app.json
  if (fs.existsSync('mobile/app.json')) {
    log('\n📱 Verificando configuración de mobile...', 'blue');
    try {
      const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
      const extra = appJson.expo?.extra || {};
      
      if (extra.cognitoUserPoolId && extra.cognitoUserPoolId !== 'YOUR_COGNITO_USER_POOL_ID') {
        log(`✅ Cognito User Pool ID: ${extra.cognitoUserPoolId}`, 'green');
      } else {
        log(`❌ Cognito User Pool ID: NO CONFIGURADO`, 'red');
        allGood = false;
      }
      
      if (extra.googleWebClientId && !extra.googleWebClientId.includes('YOUR_GOOGLE')) {
        log(`✅ Google Web Client ID: ${extra.googleWebClientId}`, 'green');
      } else {
        log(`⚠️  Google Web Client ID: NECESITA CONFIGURACIÓN`, 'yellow');
      }
      
      if (extra.graphqlEndpoint && extra.graphqlEndpoint.includes('appsync-api')) {
        log(`✅ GraphQL Endpoint: ${extra.graphqlEndpoint}`, 'green');
      } else {
        log(`❌ GraphQL Endpoint: NO CONFIGURADO CORRECTAMENTE`, 'red');
        allGood = false;
      }
      
    } catch (error) {
      log(`❌ Error leyendo mobile/app.json: ${error.message}`, 'red');
      allGood = false;
    }
  }
  
  // 5. Verificar configuración de AWS
  if (fs.existsSync('mobile/src/config/aws-config.ts')) {
    log('\n☁️  Verificando configuración de AWS...', 'blue');
    const awsConfig = fs.readFileSync('mobile/src/config/aws-config.ts', 'utf8');
    
    if (awsConfig.includes('imx6fos5lnd3xkdchl4rqtv4pi.appsync-api')) {
      log(`✅ GraphQL Endpoint configurado correctamente`, 'green');
    } else {
      log(`❌ GraphQL Endpoint no configurado correctamente`, 'red');
      allGood = false;
    }
    
    if (awsConfig.includes('eu-west-1_6UxioIj4z')) {
      log(`✅ User Pool ID configurado correctamente`, 'green');
    } else {
      log(`❌ User Pool ID no configurado correctamente`, 'red');
      allGood = false;
    }
  }
  
  // 6. Verificar google-services.json
  if (fs.existsSync('mobile/google-services.json')) {
    log('\n🔐 Verificando Google Services...', 'blue');
    try {
      const googleServices = JSON.parse(fs.readFileSync('mobile/google-services.json', 'utf8'));
      
      if (googleServices.project_info?.project_number === '320120465080') {
        log(`✅ Google Services configurado con project number correcto`, 'green');
      } else {
        log(`⚠️  Google Services puede necesitar actualización`, 'yellow');
      }
      
      if (googleServices.client?.[0]?.client_info?.android_client_info?.package_name === 'com.trinity.app') {
        log(`✅ Package name configurado correctamente`, 'green');
      } else {
        log(`❌ Package name no configurado correctamente`, 'red');
        allGood = false;
      }
      
    } catch (error) {
      log(`❌ Error leyendo google-services.json: ${error.message}`, 'red');
      allGood = false;
    }
  }
  
  // 7. Resumen final
  log('\n' + '=' .repeat(50), 'cyan');
  if (allGood) {
    log('🎉 CONFIGURACIÓN COMPLETA Y CORRECTA', 'green');
    log('\n✅ Todos los archivos y variables están configurados correctamente', 'green');
    log('✅ La aplicación debería funcionar sin problemas', 'green');
    log('\n🚀 Próximos pasos:', 'blue');
    log('1. Compilar la aplicación: cd mobile && eas build -p android --profile preview', 'cyan');
    log('2. Iniciar el backend: cd backend && npm run start:dev', 'cyan');
    log('3. Probar la autenticación con Google Sign-In', 'cyan');
  } else {
    log('⚠️  CONFIGURACIÓN INCOMPLETA', 'yellow');
    log('\n❌ Algunos archivos o variables necesitan configuración', 'red');
    log('📋 Revisa los elementos marcados con ❌ arriba', 'yellow');
    log('\n🔧 Para configurar automáticamente:', 'blue');
    log('- En Linux/Mac: ./setup-complete-environment.sh', 'cyan');
    log('- En Windows: .\\setup-complete-environment.ps1', 'cyan');
  }
  
  log('\n📖 Para más información, revisa config-summary.md', 'blue');
  
  return allGood;
}

// Ejecutar verificación
if (require.main === module) {
  const success = verifyConfiguration();
  process.exit(success ? 0 : 1);
}

module.exports = { verifyConfiguration };