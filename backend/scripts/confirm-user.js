#!/usr/bin/env node

/**
 * Script para confirmar un usuario en Cognito
 */

const { CognitoIdentityProviderClient, AdminConfirmSignUpCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
require('dotenv').config();

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function confirmUser() {
  log('\n🔐 Confirmando usuario...', colors.bold);
  
  try {
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const username = 'test@example.com';
    
    // Confirmar usuario directamente (admin)
    const confirmCommand = new AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    
    await client.send(confirmCommand);
    log(`✅ Usuario confirmado: ${username}`, colors.green);
    
    // Establecer contraseña permanente
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: 'TempPassword123!',
      Permanent: true,
    });
    
    await client.send(setPasswordCommand);
    log(`✅ Contraseña establecida`, colors.green);
    
    return { email: username, password: 'TempPassword123!' };
    
  } catch (error) {
    log(`❌ Error confirmando usuario: ${error.message}`, colors.red);
    throw error;
  }
}

async function testLogin(credentials) {
  log('\n🧪 Probando login...', colors.bold);
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      log('✅ Login exitoso!', colors.green);
      log(`Usuario: ${data.user.email}`, colors.blue);
      log(`Token: ${data.tokens.accessToken.substring(0, 50)}...`, colors.blue);
      return data;
    } else {
      const error = await response.json();
      log(`❌ Error en login: ${error.message}`, colors.red);
      return null;
    }
  } catch (error) {
    log(`❌ Error probando login: ${error.message}`, colors.red);
    return null;
  }
}

async function main() {
  const credentials = await confirmUser();
  const loginResult = await testLogin(credentials);
  
  if (loginResult) {
    log('\n🎯 Credenciales de prueba funcionando:', colors.bold);
    log(`Email: ${credentials.email}`, colors.blue);
    log(`Password: ${credentials.password}`, colors.blue);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  });
}