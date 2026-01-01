#!/usr/bin/env node

/**
 * Script para corregir la configuración de Google Sign-In
 * Resuelve el error DEVELOPER_ERROR configurando los Client IDs correctos
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigiendo configuración de Google Sign-In...');

// Leer configuración actual
const appJsonPath = path.join(__dirname, '../app.json');
const googleServicesPath = path.join(__dirname, '../google-services.json');

if (!fs.existsSync(appJsonPath)) {
  console.error('❌ No se encontró app.json');
  process.exit(1);
}

if (!fs.existsSync(googleServicesPath)) {
  console.error('❌ No se encontró google-services.json');
  process.exit(1);
}

// Leer archivos
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));

console.log('📋 Configuración actual detectada:');
console.log('- Project Number:', googleServices.project_info.project_number);
console.log('- Project ID:', googleServices.project_info.project_id);
console.log('- Package Name:', appJson.expo.android.package);

// Extraer Client IDs del google-services.json
const oauthClients = googleServices.client[0].oauth_client;
const webClientId = oauthClients.find(client => client.client_type === 3)?.client_id;
const androidClientId = oauthClients.find(client => client.client_type === 1)?.client_id;

console.log('\n🔍 Client IDs encontrados:');
console.log('- Web Client ID:', webClientId);
console.log('- Android Client ID:', androidClientId);

if (!webClientId || !androidClientId) {
  console.error('❌ No se pudieron extraer los Client IDs del google-services.json');
  console.log('\n💡 Solución:');
  console.log('1. Ve a Google Cloud Console: https://console.cloud.google.com/');
  console.log('2. Selecciona tu proyecto: trinity-app-production');
  console.log('3. Ve a "APIs & Services" > "Credentials"');
  console.log('4. Descarga el google-services.json actualizado');
  console.log('5. Reemplaza el archivo mobile/google-services.json');
  process.exit(1);
}

// Actualizar app.json con los Client IDs correctos
appJson.expo.extra.googleWebClientId = webClientId;
appJson.expo.extra.googleAndroidClientId = androidClientId;

// Actualizar el iosUrlScheme con el formato correcto
const urlScheme = webClientId.split('.')[0];
appJson.expo.plugins.forEach(plugin => {
  if (Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin') {
    plugin[1].iosUrlScheme = urlScheme;
  }
});

// Guardar app.json actualizado
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));

console.log('\n✅ Configuración actualizada:');
console.log('- app.json actualizado con Client IDs correctos');
console.log('- iosUrlScheme configurado:', urlScheme);

console.log('\n🚀 Próximos pasos:');
console.log('1. Ejecutar: eas build --platform android --profile production');
console.log('2. Instalar el nuevo APK en tu dispositivo');
console.log('3. Probar Google Sign-In');

console.log('\n📝 Nota: Si el error persiste, verifica que:');
console.log('- El SHA-1 fingerprint esté configurado en Google Cloud Console');
console.log('- El package name coincida: com.trinity.app');
console.log('- Los Client IDs sean del proyecto correcto');