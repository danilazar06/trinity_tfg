#!/usr/bin/env node

/**
 * Script para configurar el schema y resolvers de AppSync
 */

const { AppSyncClient, StartSchemaCreationCommand, GetSchemaCreationStatusCommand, CreateResolverCommand } = require('@aws-sdk/client-appsync');
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

const schema = `
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

// Resolver templates para las mutaciones (solo publican eventos)
const voteEventResolver = `
{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "VOTE_UPDATE",
    "userId": "$ctx.args.voteData.userId",
    "mediaId": "$ctx.args.voteData.mediaId",
    "voteType": "$ctx.args.voteData.voteType"
  }
}
`;

const matchEventResolver = `
{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "MATCH_FOUND",
    "matchId": "$ctx.args.matchData.matchId",
    "mediaId": "$ctx.args.matchData.mediaId",
    "mediaTitle": "$ctx.args.matchData.mediaTitle",
    "participants": $ctx.args.matchData.participants,
    "consensusType": "$ctx.args.matchData.consensusType"
  }
}
`;

const roomEventResolver = `
{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "$ctx.args.eventType",
    "data": $ctx.args.data
  }
}
`;

async function configureAppSyncSchema() {
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
      throw new Error('APPSYNC_API_ID no encontrado en .env. Ejecuta setup-appsync.js primero.');
    }

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
    const maxAttempts = 30;

    while (schemaStatus === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusCommand = new GetSchemaCreationStatusCommand({
        apiId: apiId,
      });
      
      const statusResult = await client.send(statusCommand);
      schemaStatus = statusResult.status;
      attempts++;
      
      log(`📊 Estado del schema: ${schemaStatus}`, colors.yellow);
    }

    if (schemaStatus !== 'SUCCESS') {
      throw new Error(`Schema creation failed with status: ${schemaStatus}`);
    }

    log('✅ Schema creado exitosamente', colors.green);

    // Crear resolvers para las mutaciones
    log('🔧 Configurando resolvers...', colors.blue);

    const resolvers = [
      {
        typeName: 'Mutation',
        fieldName: 'publishVoteEvent',
        dataSourceName: 'NONE',
        requestMappingTemplate: voteEventResolver,
        responseMappingTemplate: '$util.toJson($ctx.result)'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishMatchEvent',
        dataSourceName: 'NONE',
        requestMappingTemplate: matchEventResolver,
        responseMappingTemplate: '$util.toJson($ctx.result)'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishRoomEvent',
        dataSourceName: 'NONE',
        requestMappingTemplate: roomEventResolver,
        responseMappingTemplate: '$util.toJson($ctx.result)'
      }
    ];

    for (const resolver of resolvers) {
      try {
        const createResolverCommand = new CreateResolverCommand({
          apiId: apiId,
          typeName: resolver.typeName,
          fieldName: resolver.fieldName,
          dataSourceName: resolver.dataSourceName,
          requestMappingTemplate: resolver.requestMappingTemplate,
          responseMappingTemplate: resolver.responseMappingTemplate,
        });

        await client.send(createResolverCommand);
        log(`✅ Resolver creado: ${resolver.typeName}.${resolver.fieldName}`, colors.green);
      } catch (error) {
        if (error.name === 'ConflictException') {
          log(`⚠️  Resolver ya existe: ${resolver.typeName}.${resolver.fieldName}`, colors.yellow);
        } else {
          throw error;
        }
      }
    }

    log('\n🎯 AppSync configurado completamente!', colors.bold);
    log('🔄 Reinicia el backend para usar las notificaciones en tiempo real', colors.green);
    
    return true;

  } catch (error) {
    log(`❌ Error configurando AppSync: ${error.message}`, colors.red);
    throw error;
  }
}

async function main() {
  try {
    await configureAppSyncSchema();
  } catch (error) {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}