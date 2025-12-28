#!/usr/bin/env node

/**
 * Script para configurar Google como Identity Provider en AWS Cognito
 * 
 * Este script automatiza la configuración de Google OAuth en Cognito User Pool
 * 
 * Uso: node scripts/setup-google-identity-provider.js
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Configuración de AWS
AWS.config.update({
  region: process.env.COGNITO_REGION || 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PROVIDER_NAME = process.env.COGNITO_GOOGLE_PROVIDER_NAME || 'Google';

async function setupGoogleIdentityProvider() {
  console.log('🚀 Configurando Google como Identity Provider en Cognito...');
  
  // Validar variables de entorno
  if (!USER_POOL_ID) {
    console.error('❌ Error: COGNITO_USER_POOL_ID no está configurado');
    process.exit(1);
  }
  
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your_google_web_client_id_here') {
    console.error('❌ Error: GOOGLE_CLIENT_ID no está configurado correctamente');
    console.log('💡 Por favor, configura GOOGLE_CLIENT_ID en el archivo .env');
    process.exit(1);
  }
  
  if (!GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET === 'your_google_client_secret_here') {
    console.error('❌ Error: GOOGLE_CLIENT_SECRET no está configurado correctamente');
    console.log('💡 Por favor, configura GOOGLE_CLIENT_SECRET en el archivo .env');
    process.exit(1);
  }

  try {
    // Verificar si el Identity Provider ya existe
    console.log('🔍 Verificando si Google Identity Provider ya existe...');
    
    try {
      const existingProvider = await cognitoIdentityServiceProvider.describeIdentityProvider({
        UserPoolId: USER_POOL_ID,
        ProviderName: PROVIDER_NAME
      }).promise();
      
      console.log('✅ Google Identity Provider ya existe:', existingProvider.IdentityProvider.ProviderName);
      
      // Actualizar el provider existente
      console.log('🔄 Actualizando configuración del Identity Provider...');
      
      await cognitoIdentityServiceProvider.updateIdentityProvider({
        UserPoolId: USER_POOL_ID,
        ProviderName: PROVIDER_NAME,
        ProviderDetails: {
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          authorize_scopes: 'openid email profile'
        },
        AttributeMapping: {
          email: 'email',
          name: 'name',
          picture: 'picture',
          username: 'sub'
        }
      }).promise();
      
      console.log('✅ Google Identity Provider actualizado correctamente');
      
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        // El provider no existe, crearlo
        console.log('📝 Creando nuevo Google Identity Provider...');
        
        await cognitoIdentityServiceProvider.createIdentityProvider({
          UserPoolId: USER_POOL_ID,
          ProviderName: PROVIDER_NAME,
          ProviderType: 'Google',
          ProviderDetails: {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            authorize_scopes: 'openid email profile'
          },
          AttributeMapping: {
            email: 'email',
            name: 'name',
            picture: 'picture',
            username: 'sub'
          }
        }).promise();
        
        console.log('✅ Google Identity Provider creado correctamente');
      } else {
        throw error;
      }
    }

    // Configurar el App Client para usar Google
    console.log('🔧 Configurando App Client para usar Google...');
    
    const appClients = await cognitoIdentityServiceProvider.listUserPoolClients({
      UserPoolId: USER_POOL_ID
    }).promise();
    
    if (appClients.UserPoolClients && appClients.UserPoolClients.length > 0) {
      const clientId = appClients.UserPoolClients[0].ClientId;
      
      // Obtener configuración actual del cliente
      const clientDetails = await cognitoIdentityServiceProvider.describeUserPoolClient({
        UserPoolId: USER_POOL_ID,
        ClientId: clientId
      }).promise();
      
      const currentClient = clientDetails.UserPoolClient;
      
      // Actualizar cliente para incluir Google
      const supportedIdentityProviders = currentClient.SupportedIdentityProviders || [];
      if (!supportedIdentityProviders.includes(PROVIDER_NAME)) {
        supportedIdentityProviders.push(PROVIDER_NAME);
      }
      if (!supportedIdentityProviders.includes('COGNITO')) {
        supportedIdentityProviders.push('COGNITO');
      }
      
      await cognitoIdentityServiceProvider.updateUserPoolClient({
        UserPoolId: USER_POOL_ID,
        ClientId: clientId,
        ClientName: currentClient.ClientName,
        SupportedIdentityProviders: supportedIdentityProviders,
        CallbackURLs: currentClient.CallbackURLs || [
          'http://localhost:3000/auth/google/callback',
          'trinity://auth/callback'
        ],
        LogoutURLs: currentClient.LogoutURLs || [
          'http://localhost:3000/logout',
          'trinity://logout'
        ],
        AllowedOAuthFlows: ['code'],
        AllowedOAuthScopes: ['openid', 'email', 'profile'],
        AllowedOAuthFlowsUserPoolClient: true
      }).promise();
      
      console.log('✅ App Client configurado para usar Google');
    }

    console.log('\n🎉 Configuración completada exitosamente!');
    console.log('\n📋 Resumen de configuración:');
    console.log(`   User Pool ID: ${USER_POOL_ID}`);
    console.log(`   Provider Name: ${PROVIDER_NAME}`);
    console.log(`   Google Client ID: ${GOOGLE_CLIENT_ID.substring(0, 20)}...`);
    console.log(`   Scopes: openid email profile`);
    
    console.log('\n🔗 Próximos pasos:');
    console.log('   1. Verifica la configuración en AWS Cognito Console');
    console.log('   2. Configura las URLs de callback en Google Cloud Console');
    console.log('   3. Prueba la autenticación con Google');

  } catch (error) {
    console.error('❌ Error configurando Google Identity Provider:', error.message);
    
    if (error.code === 'InvalidParameterException') {
      console.log('💡 Verifica que el Google Client ID y Secret sean válidos');
    } else if (error.code === 'ResourceNotFoundException') {
      console.log('💡 Verifica que el User Pool ID sea correcto');
    } else if (error.code === 'UnauthorizedOperation') {
      console.log('💡 Verifica que las credenciales de AWS tengan permisos suficientes');
    }
    
    process.exit(1);
  }
}

// Ejecutar el script
if (require.main === module) {
  setupGoogleIdentityProvider();
}

module.exports = { setupGoogleIdentityProvider };