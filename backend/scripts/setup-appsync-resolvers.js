#!/usr/bin/env node

/**
 * Script para configurar los resolvers de AppSync
 */

const { 
  AppSyncClient, 
  CreateDataSourceCommand,
  CreateResolverCommand,
  ListDataSourcesCommand
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

async function setupResolvers() {
  log('\n🔧 Configurando resolvers de AppSync...', colors.bold);
  
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

    log(`📡 Configurando resolvers para API: ${apiId}`, colors.blue);

    // Verificar si el data source existe
    log('🔍 Verificando data sources...', colors.blue);
    
    const listDataSourcesCommand = new ListDataSourcesCommand({
      apiId: apiId,
    });
    
    const dataSources = await client.send(listDataSourcesCommand);
    const noneDataSource = dataSources.dataSources?.find(ds => ds.name === 'NoneDataSource');
    
    if (!noneDataSource) {
      log('🔧 Creando data source NONE...', colors.blue);
      
      const createDataSourceCommand = new CreateDataSourceCommand({
        apiId: apiId,
        name: 'NoneDataSource',
        type: 'NONE',
        description: 'Data source for local resolvers'
      });

      await client.send(createDataSourceCommand);
      log('✅ Data source NONE creado', colors.green);
    } else {
      log('✅ Data source NONE ya existe', colors.green);
    }

    // Crear resolvers
    log('🔧 Configurando resolvers...', colors.blue);

    const resolvers = [
      {
        typeName: 'Query',
        fieldName: 'getApiInfo',
        requestTemplate: `{
          "version": "2017-02-28",
          "payload": "Trinity AppSync API v1.0"
        }`,
        responseTemplate: '$util.toJson($ctx.result)'
      },
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

    let successCount = 0;
    let existingCount = 0;

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
        successCount++;
      } catch (error) {
        if (error.name === 'ConflictException') {
          log(`⚠️  Resolver ya existe: ${resolver.typeName}.${resolver.fieldName}`, colors.yellow);
          existingCount++;
        } else {
          log(`❌ Error creando resolver ${resolver.fieldName}: ${error.message}`, colors.red);
        }
      }
    }

    log('\n🎯 Resolvers configurados!', colors.bold);
    log(`   ✅ Creados: ${successCount}`, colors.green);
    log(`   ⚠️  Ya existían: ${existingCount}`, colors.yellow);
    log(`   📊 Total: ${successCount + existingCount}/${resolvers.length}`, colors.blue);
    
    return true;

  } catch (error) {
    log(`❌ Error configurando resolvers: ${error.message}`, colors.red);
    return false;
  }
}

async function main() {
  try {
    const success = await setupResolvers();
    
    if (success) {
      log('\n🎯 AppSync completamente configurado!', colors.bold);
      log('📍 API URL: ' + process.env.APPSYNC_API_URL, colors.green);
      log('🔑 API Key: ' + process.env.APPSYNC_API_KEY, colors.green);
      log('🆔 API ID: ' + process.env.APPSYNC_API_ID, colors.green);
      
      log('\n📋 Funcionalidades disponibles:', colors.blue);
      log('   ✅ Mutaciones con resolvers configurados', colors.green);
      log('   ✅ Suscripciones en tiempo real', colors.green);
      log('   ✅ Data source NONE para eventos locales', colors.green);
      
      log('\n🔄 Reinicia el backend para usar AppSync', colors.green);
    } else {
      log('\n❌ Error configurando resolvers', colors.red);
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