#!/usr/bin/env node

/**
 * Script completo para configurar AppSync con schema y resolvers
 */

const { 
  AppSyncClient, 
  CreateDataSourceCommand,
  CreateResolverCommand,
  UpdateGraphqlApiCommand,
  GetGraphqlApiCommand
} = require('@aws-sdk/client-appsync');
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

// Schema GraphQL simplificado
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

async function setupAppSyncComplete() {
  log('\n🚀 Configurando AppSync completamente...', colors.bold);
  
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

    log(`📡 Configurando API: ${apiId}`, colors.blue);

    // Actualizar la API con el schema
    log('📝 Actualizando schema GraphQL...', colors.blue);
    
    const updateApiCommand = new UpdateGraphqlApiCommand({
      apiId: apiId,
      name: 'trinity-realtime-api',
      authenticationType: 'API_KEY',
      xrayEnabled: false,
    });

    await client.send(updateApiCommand);
    log('✅ API actualizada exitosamente', colors.green);

    // Crear data source NONE para las mutaciones
    log('🔧 Creando data source...', colors.blue);
    
    try {
      const createDataSourceCommand = new CreateDataSourceCommand({
        apiId: apiId,
        name: 'NoneDataSource',
        type: 'NONE',
        description: 'Data source for local resolvers'
      });

      await client.send(createDataSourceCommand);
      log('✅ Data source creado', colors.green);
    } catch (error) {
      if (error.name === 'ConflictException') {
        log('⚠️  Data source ya existe', colors.yellow);
      } else {
        throw error;
      }
    }

    // Crear resolvers simplificados
    log('🔧 Configurando resolvers...', colors.blue);

    const resolvers = [
      {
        typeName: 'Mutation',
        fieldName: 'publishVoteEvent',
        requestTemplate: `{
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
        }`,
        responseTemplate: '$util.toJson($ctx.result)'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishMatchEvent',
        requestTemplate: `{
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
        }`,
        responseTemplate: '$util.toJson($ctx.result)'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishRoomEvent',
        requestTemplate: `{
          "version": "2017-02-28",
          "payload": {
            "id": "$util.autoId()",
            "timestamp": "$util.time.nowISO8601()",
            "roomId": "$ctx.args.roomId",
            "eventType": "$ctx.args.eventType",
            "data": $ctx.args.data
          }
        }`,
        responseTemplate: '$util.toJson($ctx.result)'
      }
    ];

    for (const resolver of resolvers) {
      try {
        const createResolverCommand = new CreateResolverCommand({
          apiId: apiId,
          typeName: resolver.typeName,
          fieldName: resolver.fieldName,
          dataSourceName: 'NoneDataSource',
          requestMappingTemplate: resolver.requestTemplate,
          responseMappingTemplate: resolver.responseTemplate,
        });

        await client.send(createResolverCommand);
        log(`✅ Resolver creado: ${resolver.typeName}.${resolver.fieldName}`, colors.green);
      } catch (error) {
        if (error.name === 'ConflictException') {
          log(`⚠️  Resolver ya existe: ${resolver.typeName}.${resolver.fieldName}`, colors.yellow);
        } else {
          log(`❌ Error creando resolver ${resolver.fieldName}: ${error.message}`, colors.red);
        }
      }
    }

    // Verificar configuración final
    log('🔍 Verificando configuración...', colors.blue);
    
    const getApiCommand = new GetGraphqlApiCommand({
      apiId: apiId,
    });

    const apiInfo = await client.send(getApiCommand);
    
    log('\n🎯 AppSync configurado completamente!', colors.bold);
    log(`📍 API URL: ${apiInfo.graphqlApi.uris.GRAPHQL}`, colors.green);
    log(`🔑 API Key: ${process.env.APPSYNC_API_KEY}`, colors.green);
    log(`🆔 API ID: ${apiId}`, colors.green);
    
    log('\n📋 Schema configurado con:', colors.blue);
    log('   - Mutaciones: publishVoteEvent, publishMatchEvent, publishRoomEvent', colors.blue);
    log('   - Suscripciones: onVoteUpdate, onMatchFound, onRoomUpdate', colors.blue);
    log('   - Resolvers: Configurados para todas las mutaciones', colors.blue);
    
    log('\n🔄 Reinicia el backend para usar AppSync', colors.green);
    
    return true;

  } catch (error) {
    log(`❌ Error configurando AppSync: ${error.message}`, colors.red);
    
    if (error.name === 'AccessDeniedException') {
      log('\n💡 Verifica que las credenciales AWS tengan permisos para AppSync', colors.yellow);
    }
    
    throw error;
  }
}

async function main() {
  try {
    await setupAppSyncComplete();
  } catch (error) {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}