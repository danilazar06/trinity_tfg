/**
 * Script de diagnóstico para verificar el estado de autenticación
 * Ejecutar con: node debug-auth.js
 */

const AsyncStorage = require('@react-native-async-storage/async-storage').default;

async function debugAuth() {
  console.log('🔍 Diagnóstico de Autenticación\n');
  
  try {
    // Verificar tokens de Cognito
    const cognitoTokens = await AsyncStorage.getItem('cognitoTokens');
    console.log('📱 Tokens de Cognito:', cognitoTokens ? 'ENCONTRADOS' : 'NO ENCONTRADOS');
    
    if (cognitoTokens) {
      try {
        const tokens = JSON.parse(cognitoTokens);
        console.log('🔑 Access Token:', tokens.accessToken ? 'PRESENTE' : 'AUSENTE');
        console.log('🆔 ID Token:', tokens.idToken ? 'PRESENTE' : 'AUSENTE');
        console.log('🔄 Refresh Token:', tokens.refreshToken ? 'PRESENTE' : 'AUSENTE');
        
        // Verificar si el token está expirado
        if (tokens.accessToken) {
          try {
            const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
            const exp = payload.exp * 1000; // Convertir a milliseconds
            const now = Date.now();
            const isExpired = now > exp;
            
            console.log('⏰ Token expira:', new Date(exp).toLocaleString());
            console.log('🕐 Hora actual:', new Date(now).toLocaleString());
            console.log('❓ Token expirado:', isExpired ? 'SÍ' : 'NO');
          } catch (e) {
            console.log('⚠️ No se pudo decodificar el token');
          }
        }
      } catch (e) {
        console.log('❌ Error parseando tokens:', e.message);
      }
    }
    
    // Verificar token legacy
    const legacyToken = await AsyncStorage.getItem('authToken');
    console.log('🏛️ Token Legacy:', legacyToken ? 'ENCONTRADO' : 'NO ENCONTRADO');
    
    console.log('\n📋 Configuración AWS:');
    console.log('🌍 Región: eu-west-1');
    console.log('🔗 GraphQL: https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql');
    console.log('👤 User Pool: eu-west-1_6UxioIj4z');
    console.log('🔑 Client ID: 59dpqsm580j14ulkcha19shl64');
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  }
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  debugAuth();
}

module.exports = { debugAuth };