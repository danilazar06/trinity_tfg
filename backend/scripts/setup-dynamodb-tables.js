#!/usr/bin/env node

/**
 * Script para crear todas las tablas de DynamoDB necesarias para Trinity
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Configurar AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB();

// Definición de tablas
const tables = [
  {
    TableName: 'trinity-users-dev',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
      StreamEnabled: false
    }
  },
  {
    TableName: 'trinity-movies-cache-dev',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true
    }
  },
  {
    TableName: 'trinity-analytics-dev',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true
    }
  }
];

async function checkTableExists(tableName) {
  try {
    await dynamodb.describeTable({ TableName: tableName }).promise();
    return true;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(tableConfig) {
  try {
    console.log(`🔨 Creating table: ${tableConfig.TableName}`);
    
    const result = await dynamodb.createTable(tableConfig).promise();
    console.log(`✅ Table ${tableConfig.TableName} created successfully`);
    
    // Wait for table to be active
    console.log(`⏳ Waiting for table ${tableConfig.TableName} to be active...`);
    await dynamodb.waitFor('tableExists', { TableName: tableConfig.TableName }).promise();
    console.log(`🎉 Table ${tableConfig.TableName} is now active`);
    
    return result;
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log(`⚠️  Table ${tableConfig.TableName} already exists`);
      return null;
    }
    throw error;
  }
}

async function setupAllTables() {
  console.log('🚀 Setting up DynamoDB tables for Trinity...\n');
  
  try {
    for (const tableConfig of tables) {
      const exists = await checkTableExists(tableConfig.TableName);
      
      if (exists) {
        console.log(`✅ Table ${tableConfig.TableName} already exists`);
      } else {
        await createTable(tableConfig);
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('🎉 All DynamoDB tables are ready!');
    console.log('\n📋 Tables created/verified:');
    tables.forEach(table => {
      console.log(`   - ${table.TableName}`);
    });
    
    console.log('\n🔧 Configuration for .env:');
    console.log('USERS_TABLE=trinity-users-dev');
    console.log('MOVIES_CACHE_TABLE=trinity-movies-cache-dev');
    console.log('ANALYTICS_TABLE=trinity-analytics-dev');
    
  } catch (error) {
    console.error('❌ Error setting up tables:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

async function main() {
  // Verify AWS credentials
  try {
    const sts = new AWS.STS();
    const identity = await sts.getCallerIdentity().promise();
    console.log(`🔐 AWS Identity verified: ${identity.Arn}`);
    console.log(`📍 Region: ${AWS.config.region}\n`);
  } catch (error) {
    console.error('❌ AWS credentials not configured properly:', error.message);
    console.error('Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }
  
  await setupAllTables();
}

if (require.main === module) {
  main();
}