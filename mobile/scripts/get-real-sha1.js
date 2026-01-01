#!/usr/bin/env node

/**
 * Script para obtener el SHA-1 fingerprint real de EAS Build
 * Necesario para configurar Google Cloud Console correctamente
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Obteniendo SHA-1 fingerprint real de EAS Build...');
console.log('='.repeat(60));

async function getRealFingerprint() {
  try {
    console.log('📋 Método 1: Intentando obtener desde EAS credentials...');
    
    // Intentar obtener credenciales de EAS
    try {
      const result = execSync('eas credentials --platform android', { 
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 30000
      });
      
      console.log('✅ Resultado de EAS credentials:');
      console.log(result);
      
      // Buscar SHA-1 en la salida
      const sha1Match = result.match(/SHA1[:\s]*([A-F0-9:]{59})/i);
      const sha256Match = result.match(/SHA256[:\s]*([A-F0-9:]{95})/i);
      
      if (sha1Match) {
        console.log('\n🎯 SHA-1 Fingerprint encontrado:');
        console.log(sha1Match[1]);
        
        return {
          sha1: sha1Match[1],
          sha256: sha256Match ? sha256Match[1] : null,
          method: 'eas-credentials'
        };
      }
    } catch (error) {
      console.log('⚠️ EAS credentials falló:', error.message);
    }
    
    console.log('\n📋 Método 2: Intentando desde build logs...');
    
    // Intentar obtener desde el último build
    try {
      const buildResult = execSync('eas build:list --platform android --limit 1 --json', { 
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 15000
      });
      
      const builds = JSON.parse(buildResult);
      if (builds.length > 0) {
        const latestBuild = builds[0];
        console.log('📦 Último build encontrado:');
        console.log('- ID:', latestBuild.id);
        console.log('- Status:', latestBuild.status);
        console.log('- Created:', latestBuild.createdAt);
        console.log('- Platform:', latestBuild.platform);
        
        // El SHA-1 no está disponible directamente en la lista
        console.log('\n💡 Para obtener el SHA-1 fingerprint:');
        console.log('1. Ve a: https://expo.dev/accounts/trinity-apk/projects/trinity/builds');
        console.log('2. Busca el build:', latestBuild.id);
        console.log('3. En los detalles del build, busca "Certificate fingerprint"');
      }
    } catch (error) {
      console.log('⚠️ Build list falló:', error.message);
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
    return null;
  }
}

async function main() {
  const fingerprint = await getRealFingerprint();
  
  if (fingerprint) {
    // Guardar información
    const fingerprintInfo = {
      sha1: fingerprint.sha1,
      sha256: fingerprint.sha256,
      timestamp: new Date().toISOString(),
      packageName: 'com.trinity.app',
      projectNumber: '320120465080',
      method: fingerprint.method
    };
    
    fs.writeFileSync(
      path.join(__dirname, '../real-fingerprints.json'), 
      JSON.stringify(fingerprintInfo, null, 2)
    );
    
    console.log('\n📝 Información guardada en real-fingerprints.json');
    
    console.log('\n🚀 Próximos pasos para Google Cloud Console:');
    console.log('1. Ve a: https://console.cloud.google.com/');
    console.log('2. Selecciona proyecto: trinity-app-production');
    console.log('3. Ve a "APIs & Services" > "Credentials"');
    console.log('4. Crea o edita OAuth 2.0 Client ID para Android:');
    console.log('   - Application type: Android');
    console.log('   - Package name: com.trinity.app');
    console.log('   - SHA-1 certificate fingerprint:', fingerprint.sha1);
    console.log('5. Copia el Client ID generado');
    console.log('6. Actualiza google-services.json con el Client ID real');
    
  } else {
    console.log('\n❌ No se pudo obtener el SHA-1 fingerprint automáticamente');
    
    console.log('\n💡 Alternativas manuales:');
    console.log('\n🌐 Opción 1 - Expo Dashboard:');
    console.log('1. Ve a: https://expo.dev/accounts/trinity-apk/projects/trinity/builds');
    console.log('2. Busca tu último build de Android');
    console.log('3. Haz clic en el build para ver detalles');
    console.log('4. Busca "Certificate fingerprint" o "SHA-1"');
    
    console.log('\n📱 Opción 2 - Desde APK instalado:');
    console.log('1. Conecta tu dispositivo por USB');
    console.log('2. Habilita "Depuración USB"');
    console.log('3. Ejecuta: adb shell pm list packages | grep trinity');
    console.log('4. Ejecuta: adb shell dumpsys package com.trinity.app | grep -A1 "signatures"');
    
    console.log('\n🔧 Opción 3 - Keytool (si tienes el keystore):');
    console.log('1. keytool -list -v -keystore path/to/keystore.jks');
    console.log('2. Busca "SHA1" en la salida');
    
    console.log('\n📋 Una vez que tengas el SHA-1:');
    console.log('1. Configúralo en Google Cloud Console');
    console.log('2. Descarga el nuevo google-services.json');
    console.log('3. Reemplaza el archivo en mobile/google-services.json');
    console.log('4. Recompila el APK');
  }
}

main();