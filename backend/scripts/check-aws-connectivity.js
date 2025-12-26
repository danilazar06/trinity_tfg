#!/usr/bin/env node

/**
 * Script independiente para verificar conectividad con AWS
 * Uso: node scripts/check-aws-connectivity.js
 */

const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { CognitoIdentityProviderClient, ListUserPoolsCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
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

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function checkCredentials() {
  log('\n🔐 Verificando credenciales AWS...', colors.bold);
  
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'eu-west-1';
  
  if (!accessKeyId || accessKeyId === 'your-aws-access-key-id') {
    logError('AWS_ACCESS_KEY_ID no está configurado correctamente');
    return false;
  }
  
  if (!secretAccessKey || secretAccessKey === 'your-aws-secret-access-key') {
    logError('AWS_SECRET_ACCESS_KEY no está configurado correctamente');
    return false;
  }
  
  logInfo(`Región configurada: ${region}`);
  logInfo(`Access Key ID: ${accessKeyId.substring(0, 8)}***`);
  
  try {
    const stsClient = new STSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    
    const command = new GetCallerIdentityCommand({});
    const result = await stsClient.send(command);
    
    logSuccess('Credenciales AWS válidas');
    logInfo(`Account ID: ${result.Account}`);
    logInfo(`User ARN: ${result.Arn}`);
    return true;
  } catch (error) {
    logError(`Error verificando credenciales: ${error.message}`);
    return false;
  }
}

async function checkDynamoDB() {
  log('\n🗄️  Verificando DynamoDB...', colors.bold);
  
  try {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const command = new ListTablesCommand({});
    const result = await client.send(command);
    
    const tableCount = result.TableNames?.length || 0;
    logSuccess(`DynamoDB conectado exitosamente`);
    logInfo(`Tablas encontradas: ${tableCount}`);
    
    if (result.TableNames && result.TableNames.length > 0) {
      logInfo(`Tablas: ${result.TableNames.join(', ')}`);
    }
    
    // Verificar tabla principal
    const mainTable = process.env.DYNAMODB_TABLE_NAME;
    if (mainTable && result.TableNames?.includes(mainTable)) {
      logSuccess(`Tabla principal '${mainTable}' encontrada`);
    } else if (mainTable) {
      logWarning(`Tabla principal '${mainTable}' no encontrada`);
    }
    
    return true;
  } catch (error) {
    logError(`Error conectando a DynamoDB: ${error.message}`);
    return false;
  }
}

async function checkCognito() {
  log('\n👤 Verificando Cognito...', colors.bold);
  
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  
  if (!userPoolId || userPoolId === 'your-cognito-user-pool-id') {
    logWarning('COGNITO_USER_POOL_ID no está configurado');
    return false;
  }
  
  try {
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const command = new ListUserPoolsCommand({ MaxResults: 10 });
    const result = await client.send(command);
    
    logSuccess('Cognito conectado exitosamente');
    logInfo(`User Pools encontrados: ${result.UserPools?.length || 0}`);
    
    // Verificar si el user pool configurado existe
    const configuredPool = result.UserPools?.find(pool => pool.Id === userPoolId);
    if (configuredPool) {
      logSuccess(`User Pool configurado '${userPoolId}' encontrado: ${configuredPool.Name}`);
    } else {
      logWarning(`User Pool configurado '${userPoolId}' no encontrado`);
    }
    
    return true;
  } catch (error) {
    logError(`Error conectando a Cognito: ${error.message}`);
    return false;
  }
}

async function checkS3() {
  log('\n🪣 Verificando S3...', colors.bold);
  
  try {
    const client = new S3Client({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const command = new ListBucketsCommand({});
    const result = await client.send(command);
    
    const bucketCount = result.Buckets?.length || 0;
    logSuccess(`S3 conectado exitosamente`);
    logInfo(`Buckets encontrados: ${bucketCount}`);
    
    if (result.Buckets && result.Buckets.length > 0) {
      result.Buckets.forEach(bucket => {
        logInfo(`  - ${bucket.Name} (creado: ${bucket.CreationDate?.toLocaleDateString()})`);
      });
    }
    
    return true;
  } catch (error) {
    logError(`Error conectando a S3: ${error.message}`);
    return false;
  }
}

async function main() {
  log('🚀 Iniciando verificación de conectividad AWS...', colors.bold);
  log('================================================', colors.blue);
  
  const results = {
    credentials: await checkCredentials(),
    dynamodb: await checkDynamoDB(),
    cognito: await checkCognito(),
    s3: await checkS3(),
  };
  
  log('\n📊 Resumen de verificación:', colors.bold);
  log('============================', colors.blue);
  
  const services = Object.entries(results);
  const successCount = services.filter(([, success]) => success).length;
  const totalServices = services.length;
  
  services.forEach(([service, success]) => {
    const status = success ? '✅ CONECTADO' : '❌ ERROR';
    const color = success ? colors.green : colors.red;
    log(`${service.toUpperCase().padEnd(12)} ${status}`, color);
  });
  
  log(`\n🎯 Resultado: ${successCount}/${totalServices} servicios conectados`, colors.bold);
  
  if (successCount === totalServices) {
    logSuccess('¡Todos los servicios AWS están funcionando correctamente!');
    process.exit(0);
  } else if (successCount > 0) {
    logWarning('Algunos servicios tienen problemas. Revisa la configuración.');
    process.exit(1);
  } else {
    logError('No se pudo conectar a ningún servicio AWS. Verifica las credenciales.');
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main().catch(error => {
    logError(`Error inesperado: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { checkCredentials, checkDynamoDB, checkCognito, checkS3 };