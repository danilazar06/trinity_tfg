#!/usr/bin/env node

/**
 * Script para configurar solo el schema de AppSync
 */

const { AppSyncClient, StartSchemaCreationCommand, GetSchemaCreationStatusCommand } = require('@aws-sdk/client-appsync');
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

// Schema GraphQL simplificado y corregido
const schema = `
schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}

type Query {
  # Placeholder query - AppSync requires at least one query
  getApiInfo: String
}

type Mutation {
  publishVoteEvent(roomId: ID!, voteData: AWSJSON!): VoteEvent
  publishMatchEvent(roomId: ID!, matchData: AWSJSON!): MatchEvent  
  publishRoomEvent(roomId: ID!, eventType: String!, data: AWSJSON!): RoomEvent
}

type Subscription {
  onVoteUpdate(roomId: ID!): VoteEvent
    @aws_subscribe(mutations: ["publishVoteEvent"])
  onMatchFound(roomId: ID!): MatchEvent
    @aws_subscribe(mutations: ["publishMatchEvent"])
  onRoomUpdate(roomId: ID!): RoomEvent
    @aws_subscribe(mutations: ["publishRoomEvent"])
}

type VoteEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  userId: ID!
  mediaId: String!
  voteType: String!
}

type MatchEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  matchId: ID!
  mediaId: String!
  mediaTitle: String!
  participants: [String!]!
  consensusType: String!
}

type RoomEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  data: AWSJSON!
}

scalar AWSJSON
scalar AWSDateTime
`;

async function setupSchema() {
  log('\n📋 Configurando schema de AppSync...', colors.bold);
  
  try {
    const client = new AppSyncClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const apiId = process.env.APPSYNC_API_ID;
    if (!apiId) {
      throw new Error('APPSYNC_API_ID no encontrado en .env');
    }

    log(`📡 Configurando schema para API: ${apiId}`, colors.blue);

    // Crear schema
    log('📝 Creando schema GraphQL...', colors.blue);
    
    const createSchemaCommand = new StartSchemaCreationCommand({
      apiId: apiId,
      definition: Buffer.from(schema, 'utf8'),
    });

    await client.send(createSchemaCommand);

    // Esperar a que el schema se cree
    log('⏳ Esperando que el schema se active...', colors.yellow);
    
    let schemaStatus = 'PROCESSING';
    let attempts = 0;
    const maxAttempts = 60; // Aumentar el tiempo de espera

    while (schemaStatus === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const statusCommand = new GetSchemaCreationStatusCommand({
          apiId: apiId,
        });
        
        const statusResult = await client.send(statusCommand);
        schemaStatus = statusResult.status;
        attempts++;
        
        log(`📊 Estado del schema: ${schemaStatus} (intento ${attempts}/${maxAttempts})`, colors.yellow);
        
        if (statusResult.details) {
          log(`📋 Detalles: ${statusResult.details}`, colors.blue);
        }
      } catch (error) {
        log(`⚠️  Error verificando estado: ${error.message}`, colors.yellow);
        attempts++;
      }
    }

    if (schemaStatus === 'SUCCESS') {
      log('✅ Schema creado exitosamente', colors.green);
      
      log('\n🎯 Schema configurado con:', colors.bold);
      log('   ✅ Mutaciones: publishVoteEvent, publishMatchEvent, publishRoomEvent', colors.green);
      log('   ✅ Suscripciones: onVoteUpdate, onMatchFound, onRoomUpdate', colors.green);
      log('   ✅ Tipos: VoteEvent, MatchEvent, RoomEvent', colors.green);
      
      return true;
    } else if (schemaStatus === 'FAILED') {
      log('❌ Schema creation failed', colors.red);
      return false;
    } else {
      log(`⚠️  Schema creation timeout. Status: ${schemaStatus}`, colors.yellow);
      return false;
    }

  } catch (error) {
    log(`❌ Error configurando schema: ${error.message}`, colors.red);
    
    if (error.name === 'BadRequestException') {
      log('\n💡 El schema puede tener errores de sintaxis', colors.yellow);
    }
    
    return false;
  }
}

async function main() {
  try {
    const success = await setupSchema();
    
    if (success) {
      log('\n🎯 Schema configurado exitosamente!', colors.bold);
      log('🔄 Ahora puedes configurar los resolvers', colors.green);
      log('📝 Ejecuta: node scripts/setup-appsync-resolvers.js', colors.blue);
    } else {
      log('\n❌ Error configurando schema', colors.red);
      process.exit(1);
    }
    
  } catch (error) {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}