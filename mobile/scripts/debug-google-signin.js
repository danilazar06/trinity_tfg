#!/usr/bin/env node

/**
 * Script de debugging para Google Sign-In
 * Ayuda a diagnosticar el error DEVELOPER_ERROR
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Diagnóstico de Google Sign-In - DEVELOPER_ERROR');
console.log('='.repeat(60));

// 1. Verificar configuración en app.json
console.log('\n📋 1. Verificando app.json...');
const appJsonPath = path.join(__dirname, '../app.json');
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  
  console.log('✅ app.json encontrado');
  console.log('📦 Package name:', appJson.expo.android?.package);
  console.log('🔑 Google Web Client ID:', appJson.expo.extra?.googleWebClientId);
  console.log('🤖 Google Android Client ID:', appJson.expo.extra?.googleAndroidClientId);
  
  // Verificar plugin de Google Sign-In
  const googlePlugin = appJson.expo.plugins?.find(plugin => 
    Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'
  );
  
  if (googlePlugin) {
    console.log('✅ Plugin de Google Sign-In configurado');
    console.log('🔗 iOS URL Scheme:', googlePlugin[1]?.iosUrlScheme);
  } else {
    console.log('❌ Plugin de Google Sign-In NO encontrado');
  }
} else {
  console.log('❌ app.json NO encontrado');
}

// 2. Verificar google-services.json
console.log('\n📋 2. Verificando google-services.json...');
const googleServicesPath = path.join(__dirname, '../google-services.json');
if (fs.existsSync(googleServicesPath)) {
  const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
  
  console.log('✅ google-services.json encontrado');
  console.log('🏗️ Project ID:', googleServices.project_info?.project_id);
  console.log('🔢 Project Number:', googleServices.project_info?.project_number);
  
  const client = googleServices.client?.[0];
  if (client) {
    console.log('📦 Package Name:', client.client_info?.android_client_info?.package_name);
    
    const oauthClients = client.oauth_client || [];
    console.log('🔑 OAuth Clients encontrados:', oauthClients.length);
    
    oauthClients.forEach((oauth, index) => {
      console.log(`   ${index + 1}. Type ${oauth.client_type}: ${oauth.client_id}`);
      if (oauth.android_info) {
        console.log(`      Package: ${oauth.android_info.package_name}`);
        console.log(`      SHA1: ${oauth.android_info.certificate_hash || 'NO CONFIGURADO'}`);
      }
    });
  }
} else {
  console.log('❌ google-services.json NO encontrado');
}

// 3. Verificar configuración AWS
console.log('\n📋 3. Verificando configuración AWS...');
const awsConfigPath = path.join(__dirname, '../src/config/aws-config.ts');
if (fs.existsSync(awsConfigPath)) {
  console.log('✅ aws-config.ts encontrado');
  // No leer el contenido por seguridad, solo confirmar existencia
} else {
  console.log('❌ aws-config.ts NO encontrado');
}

// 4. Generar configuración de debugging
console.log('\n📋 4. Generando configuración de debugging...');

const debugConfig = {
  timestamp: new Date().toISOString(),
  platform: 'android',
  environment: 'production',
  debugging: {
    enableVerboseLogging: true,
    logGoogleSignInSteps: true,
    logCognitoSteps: true,
    logNetworkRequests: true
  },
  troubleshooting: {
    commonIssues: [
      'SHA-1 fingerprint no configurado en Google Cloud Console',
      'Package name no coincide entre app.json y Google Console',
      'Client ID incorrecto o no válido',
      'Google Services JSON desactualizado',
      'Cognito Identity Provider mal configurado'
    ],
    nextSteps: [
      'Verificar logs de la aplicación',
      'Comprobar configuración en Google Cloud Console',
      'Validar configuración de Cognito',
      'Revisar certificados y fingerprints'
    ]
  }
};

fs.writeFileSync(
  path.join(__dirname, '../debug-config.json'),
  JSON.stringify(debugConfig, null, 2)
);

console.log('✅ Configuración de debugging guardada en debug-config.json');

// 5. Instrucciones para obtener logs
console.log('\n📋 5. Cómo obtener logs detallados:');
console.log('');
console.log('🤖 Para Android (APK):');
console.log('1. Conecta tu dispositivo por USB');
console.log('2. Habilita "Depuración USB" en Opciones de desarrollador');
console.log('3. Ejecuta: adb logcat | grep -i "trinity\\|google\\|cognito\\|auth"');
console.log('4. O usa: adb logcat *:E | grep -i "error"');
console.log('');
console.log('📱 Alternativa con Expo:');
console.log('1. Instala Expo Dev Tools: npx @expo/cli@latest');
console.log('2. Ejecuta: npx expo start --dev-client');
console.log('3. Conecta tu dispositivo y ve los logs en tiempo real');
console.log('');
console.log('🔍 Logs específicos a buscar:');
console.log('- "DEVELOPER_ERROR"');
console.log('- "GoogleSignIn"');
console.log('- "OAuth"');
console.log('- "Cognito"');
console.log('- "Authentication failed"');
console.log('- "Invalid client"');

console.log('\n📋 6. Verificaciones adicionales:');
console.log('');
console.log('🔑 Google Cloud Console:');
console.log('1. Ve a: https://console.cloud.google.com/');
console.log('2. Proyecto: trinity-app-production');
console.log('3. APIs & Services > Credentials');
console.log('4. Verifica que el OAuth 2.0 Client ID para Android tenga:');
console.log('   - Package name: com.trinity.app');
console.log('   - SHA-1 fingerprint configurado');
console.log('');
console.log('☁️ AWS Cognito:');
console.log('1. Ve a: https://console.aws.amazon.com/cognito/');
console.log('2. User Pools > eu-west-1_6UxioIj4z');
console.log('3. Sign-in experience > Federated identity provider sign-in');
console.log('4. Verifica que Google esté configurado y activo');

console.log('\n🚀 Próximo paso recomendado:');
console.log('Ejecuta los comandos de logging mientras reproduces el error');
console.log('y comparte los logs para un diagnóstico más preciso.');