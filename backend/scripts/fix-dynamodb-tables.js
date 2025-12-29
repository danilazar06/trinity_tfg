#!/usr/bin/env node

/**
 * Script para verificar y crear tablas faltantes de DynamoDB
 */

const { DynamoDBClient, ListTablesCommand, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
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

async function checkAndCreateTables() {
  log('\n🔍 Verificando tablas de DynamoDB...', colors.bold);
  
  try {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    // Listar tablas existentes
    const listCommand = new ListTablesCommand({});
    const result = await client.send(listCommand);
    const existingTables = result.TableNames || [];
    
    log(`✅ Tablas existentes: ${existingTables.join(', ')}`, colors.green);
    
    // Tablas requeridas
    const requiredTables = [
      'trinity-users-dev',
      'trinity-rooms-dev', 
      'trinity-room-members-dev',
      'trinity-movies-cache-dev',
      'trinity-votes-dev',
      'trinity-analytics-dev', // Esta probablemente falta
      'trinity-events-dev'     // Esta probablemente falta
    ];
    
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length === 0) {
      log('✅ Todas las tablas requeridas existen', colors.green);
      return true;
    }
    
    log(`⚠️  Tablas faltantes: ${missingTables.join(', ')}`, colors.yellow);
    
    // Crear tablas faltantes
    for (const tableName of missingTables) {
      log(`🔨 Creando tabla: ${tableName}`, colors.blue);
      
      const createParams = {
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      };
      
      try {
        const createCommand = new CreateTableCommand(createParams);
        await client.send(createCommand);
        log(`✅ Tabla creada: ${tableName}`, colors.green);
        
        // Esperar a que la tabla esté activa
        log(`⏳ Esperando que ${tableName} esté activa...`, colors.yellow);
        await waitForTableActive(client, tableName);
        
      } catch (error) {
        if (error.name === 'ResourceInUseException') {
          log(`⚠️  Tabla ${tableName} ya existe`, colors.yellow);
        } else {
          log(`❌ Error creando tabla ${tableName}: ${error.message}`, colors.red);
        }
      }
    }
    
    return true;
    
  } catch (error) {
    log(`❌ Error verificando tablas: ${error.message}`, colors.red);
    return false;
  }
}

async function waitForTableActive(client, tableName, maxWaitTime = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const describeCommand = new DescribeTableCommand({ TableName: tableName });
      const result = await client.send(describeCommand);
      
      if (result.Table.TableStatus === 'ACTIVE') {
        log(`✅ Tabla ${tableName} está activa`, colors.green);
        return true;
      }
      
      log(`⏳ Tabla ${tableName} estado: ${result.Table.TableStatus}`, colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      log(`❌ Error verificando estado de ${tableName}: ${error.message}`, colors.red);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  log(`⚠️  Timeout esperando que ${tableName} esté activa`, colors.yellow);
  return false;
}

async function main() {
  const success = await checkAndCreateTables();
  
  if (success) {
    log('\n🎯 Verificación completada. Reinicia el backend para aplicar cambios.', colors.bold);
  } else {
    log('\n❌ Hubo errores en la verificación', colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  });
}