#!/usr/bin/env node

/**
 * Script para crear y confirmar un usuario de prueba en Cognito
 */

const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
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

async function createTestUser() {
  log('\n🧪 Creando usuario de prueba...', colors.bold);
  
  try {
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const email = 'test@trinity.com';
    const username = email; // Usar email como username
    const password = 'TestPassword123!';
    
    // Crear usuario
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'email_verified',
          Value: 'true',
        },
      ],
      MessageAction: 'SUPPRESS', // No enviar email de bienvenida
      TemporaryPassword: password,
    });
    
    await client.send(createCommand);
    log(`✅ Usuario creado: ${email}`, colors.green);
    
    // Establecer contraseña permanente
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    });
    
    await client.send(setPasswordCommand);
    log(`✅ Contraseña establecida`, colors.green);
    
    log('\n🎯 Credenciales de prueba:', colors.bold);
    log(`Email: ${email}`, colors.blue);
    log(`Password: ${password}`, colors.blue);
    
    return { email, password };
    
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      log('⚠️  El usuario ya existe', colors.yellow);
      return { email: 'test@trinity.com', password: 'TestPassword123!' };
    } else {
      log(`❌ Error creando usuario: ${error.message}`, colors.red);
      throw error;
    }
  }
}

async function main() {
  const credentials = await createTestUser();
  
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
    } else {
      const error = await response.json();
      log(`❌ Error en login: ${error.message}`, colors.red);
    }
  } catch (error) {
    log(`❌ Error probando login: ${error.message}`, colors.red);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  });
}