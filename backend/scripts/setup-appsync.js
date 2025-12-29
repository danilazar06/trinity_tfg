#!/usr/bin/env node

/**
 * Script para configurar AppSync para notificaciones en tiempo real
 */

const { AppSyncClient, CreateGraphqlApiCommand, CreateApiKeyCommand, PutGraphqlApiEnvironmentVariablesCommand } = require('@aws-sdk/client-appsync');
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

async function setupAppSync() {
  log('\n🚀 Configurando AppSync para notificaciones en tiempo real...', colors.bold);
  
  try {
    const client = new AppSyncClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Crear API GraphQL
    log('📡 Creando API GraphQL...', colors.blue);
    
    const createApiCommand = new CreateGraphqlApiCommand({
      name: 'trinity-realtime-api',
      authenticationType: 'API_KEY',
      xrayEnabled: false,
    });

    const apiResult = await client.send(createApiCommand);
    const apiId = apiResult.graphqlApi.apiId;
    const apiUrl = apiResult.graphqlApi.uris.GRAPHQL;

    log(`✅ API GraphQL creada: ${apiId}`, colors.green);
    log(`📍 URL: ${apiUrl}`, colors.green);

    // Crear API Key
    log('🔑 Creando API Key...', colors.blue);
    
    const createKeyCommand = new CreateApiKeyCommand({
      apiId: apiId,
      description: 'Trinity Real-time API Key',
      expires: Math.floor(Date.now() / 1000) + (364 * 24 * 60 * 60), // 364 días (máximo permitido)
    });

    const keyResult = await client.send(createKeyCommand);
    const apiKey = keyResult.apiKey.id;

    log(`✅ API Key creada: ${apiKey}`, colors.green);

    // Mostrar configuración para .env
    log('\n📝 Añade estas líneas a tu archivo .env:', colors.bold);
    log(`APPSYNC_API_URL=${apiUrl}`, colors.yellow);
    log(`APPSYNC_API_KEY=${apiKey}`, colors.yellow);
    log(`APPSYNC_API_ID=${apiId}`, colors.yellow);

    // Crear schema básico
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

    log('\n📋 Schema GraphQL básico creado', colors.green);
    log('⚠️  Nota: Debes configurar el schema y los resolvers en la consola de AWS AppSync', colors.yellow);
    log(`🔗 Consola: https://console.aws.amazon.com/appsync/home?region=${process.env.AWS_REGION || 'eu-west-1'}#/apis/${apiId}/schema`, colors.blue);

    return {
      apiId,
      apiUrl,
      apiKey,
      schema
    };

  } catch (error) {
    log(`❌ Error configurando AppSync: ${error.message}`, colors.red);
    
    // Si el error es por permisos, sugerir alternativa
    if (error.name === 'AccessDeniedException' || error.name === 'UnauthorizedOperation') {
      log('\n💡 Alternativa: Usar WebSockets para notificaciones en tiempo real', colors.yellow);
      log('   Esto no requiere configuración adicional de AWS', colors.yellow);
      return null;
    }
    
    throw error;
  }
}

async function main() {
  try {
    const result = await setupAppSync();
    
    if (result) {
      log('\n🎯 AppSync configurado exitosamente!', colors.bold);
      log('📝 Actualiza tu archivo .env con las variables mostradas arriba', colors.green);
      log('🔄 Reinicia el backend para aplicar los cambios', colors.green);
    } else {
      log('\n🔄 Configurando alternativa con WebSockets...', colors.yellow);
      // Aquí podríamos configurar WebSockets como alternativa
    }
    
  } catch (error) {
    log(`❌ Error inesperado: ${error.message}`, colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}