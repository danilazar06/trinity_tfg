#!/usr/bin/env node

/**
 * Script para encontrar User Pools de Cognito existentes
 */

const { CognitoIdentityProviderClient, ListUserPoolsCommand, DescribeUserPoolCommand, ListUserPoolClientsCommand } = require('@aws-sdk/client-cognito-identity-provider');
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

async function findCognitoPools() {
  log('\n🔍 Buscando User Pools de Cognito...', colors.bold);
  
  try {
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const command = new ListUserPoolsCommand({ MaxResults: 60 });
    const result = await client.send(command);
    
    if (!result.UserPools || result.UserPools.length === 0) {
      log('❌ No se encontraron User Pools', colors.red);
      return null;
    }
    
    log(`✅ Encontrados ${result.UserPools.length} User Pools:`, colors.green);
    
    for (const pool of result.UserPools) {
      log(`\n📋 User Pool: ${pool.Name}`, colors.blue);
      log(`   ID: ${pool.Id}`, colors.reset);
      log(`   Creado: ${pool.CreationDate?.toLocaleDateString()}`, colors.reset);
      
      // Obtener clientes del User Pool
      try {
        const clientsCommand = new ListUserPoolClientsCommand({
          UserPoolId: pool.Id,
          MaxResults: 60
        });
        const clientsResult = await client.send(clientsCommand);
        
        if (clientsResult.UserPoolClients && clientsResult.UserPoolClients.length > 0) {
          log(`   📱 Clientes encontrados:`, colors.yellow);
          for (const poolClient of clientsResult.UserPoolClients) {
            log(`      - ${poolClient.ClientName}: ${poolClient.ClientId}`, colors.reset);
          }
        } else {
          log(`   📱 Sin clientes configurados`, colors.yellow);
        }
      } catch (error) {
        log(`   ❌ Error obteniendo clientes: ${error.message}`, colors.red);
      }
    }
    
    // Retornar el primer User Pool encontrado
    return result.UserPools[0];
    
  } catch (error) {
    log(`❌ Error buscando User Pools: ${error.message}`, colors.red);
    return null;
  }
}

async function main() {
  const pool = await findCognitoPools();
  
  if (pool) {
    log('\n🎯 Configuración sugerida para .env:', colors.bold);
    log(`COGNITO_USER_POOL_ID=${pool.Id}`, colors.green);
    
    // Intentar obtener el primer cliente
    try {
      const client = new CognitoIdentityProviderClient({
        region: process.env.AWS_REGION || 'eu-west-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      
      const clientsCommand = new ListUserPoolClientsCommand({
        UserPoolId: pool.Id,
        MaxResults: 1
      });
      const clientsResult = await client.send(clientsCommand);
      
      if (clientsResult.UserPoolClients && clientsResult.UserPoolClients.length > 0) {
        const firstClient = clientsResult.UserPoolClients[0];
        log(`COGNITO_CLIENT_ID=${firstClient.ClientId}`, colors.green);
      }
    } catch (error) {
      log(`⚠️  No se pudo obtener Client ID automáticamente`, colors.yellow);
    }
  } else {
    log('\n💡 No se encontraron User Pools. Necesitas crear uno primero.', colors.yellow);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  });
}