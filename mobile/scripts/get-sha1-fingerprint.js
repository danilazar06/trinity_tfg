#!/usr/bin/env node

/**
 * Script para obtener el SHA-1 fingerprint de EAS Build
 * Necesario para configurar Google Sign-In correctamente
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Obteniendo SHA-1 fingerprint de EAS Build...');

try {
  // Obtener información de credenciales de EAS
  console.log('📋 Ejecutando: eas credentials');
  
  const result = execSync('eas credentials', { 
    encoding: 'utf8',
    cwd: process.cwd()
  });
  
  console.log('✅ Resultado de EAS credentials:');
  console.log(result);
  
  // Buscar SHA-1 en la salida
  const sha1Match = result.match(/SHA1:\s*([A-F0-9:]{59})/i);
  const sha256Match = result.match(/SHA256:\s*([A-F0-9:]{95})/i);
  
  if (sha1Match) {
    console.log('\n🎯 SHA-1 Fingerprint encontrado:');
    console.log(sha1Match[1]);
    
    // Guardar en archivo para referencia
    const fingerprintInfo = {
      sha1: sha1Match[1],
      sha256: sha256Match ? sha256Match[1] : null,
      timestamp: new Date().toISOString(),
      packageName: 'com.trinity.app',
      projectNumber: '320120465080'
    };
    
    fs.writeFileSync(
      path.join(__dirname, '../fingerprints.json'), 
      JSON.stringify(fingerprintInfo, null, 2)
    );
    
    console.log('\n📝 Información guardada en fingerprints.json');
    
    console.log('\n🚀 Próximos pasos para configurar Google Cloud Console:');
    console.log('1. Ve a: https://console.cloud.google.com/');
    console.log('2. Selecciona proyecto: trinity-app-production');
    console.log('3. Ve a "APIs & Services" > "Credentials"');
    console.log('4. Edita el OAuth 2.0 Client ID para Android');
    console.log('5. Añade este SHA-1 fingerprint:', sha1Match[1]);
    console.log('6. Package name: com.trinity.app');
    
  } else {
    console.log('❌ No se pudo encontrar SHA-1 fingerprint en la salida');
    console.log('💡 Intenta ejecutar manualmente: eas credentials');
  }
  
} catch (error) {
  console.error('❌ Error ejecutando eas credentials:', error.message);
  
  console.log('\n💡 Alternativas:');
  console.log('1. Ejecuta manualmente: eas credentials');
  console.log('2. O usa: eas build:inspect --platform android');
  console.log('3. Busca el SHA-1 fingerprint en la salida');
  
  console.log('\n📋 Información necesaria para Google Cloud Console:');
  console.log('- Package name: com.trinity.app');
  console.log('- Project number: 320120465080');
  console.log('- SHA-1 fingerprint: [obtener de EAS credentials]');
}