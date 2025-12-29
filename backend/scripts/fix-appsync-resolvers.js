#!/usr/bin/env node

/**
 * Script para corregir los resolvers de AppSync
 */

const { 
  AppSyncClient, 
  UpdateResolverCommand,
  ListResolversCommand
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

async function fixResolvers() {
  log('\n🔧 Corrigiendo resolvers de AppSync...', colors.bold);
  
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

    log(`📡 Corrigiendo resolvers para API: ${apiId}`, colors.blue);

    // Resolver corregido para publishMatchEvent
    const fixedMatchResolver = `{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "MATCH_FOUND",
    "matchId": "$util.parseJson($ctx.args.matchData).matchId",
    "mediaId": "$util.parseJson($ctx.args.matchData).mediaId",
    "mediaTitle": "$util.parseJson($ctx.args.matchData).mediaTitle",
    "participants": $util.parseJson($ctx.args.matchData).participants,
    "consensusType": "$util.parseJson($ctx.args.matchData).consensusType"
  }
}`;

    // Resolver corregido para publishRoomEvent
    const fixedRoomResolver = `{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "$ctx.args.eventType",
    "data": $util.parseJson($ctx.args.data)
  }
}`;

    // Resolver corregido para publishVoteEvent
    const fixedVoteResolver = `{
  "version": "2017-02-28",
  "payload": {
    "id": "$util.autoId()",
    "timestamp": "$util.time.nowISO8601()",
    "roomId": "$ctx.args.roomId",
    "eventType": "VOTE_UPDATE",
    "userId": "$util.parseJson($ctx.args.voteData).userId",
    "mediaId": "$util.parseJson($ctx.args.voteData).mediaId",
    "voteType": "$util.parseJson($ctx.args.voteData).voteType"
  }
}`;

    const resolversToFix = [
      {
        typeName: 'Mutation',
        fieldName: 'publishVoteEvent',
        requestTemplate: fixedVoteResolver,
        name: 'Vote Event'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishMatchEvent',
        requestTemplate: fixedMatchResolver,
        name: 'Match Event'
      },
      {
        typeName: 'Mutation',
        fieldName: 'publishRoomEvent',
        requestTemplate: fixedRoomResolver,
        name: 'Room Event'
      }
    ];

    let successCount = 0;

    for (const resolver of resolversToFix) {
      try {
        log(`🔧 Actualizando resolver: ${resolver.name}...`, colors.blue);
        
        const updateResolverCommand = new UpdateResolverCommand({
          apiId: apiId,
          typeName: resolver.typeName,
          fieldName: resolver.fieldName,
          dataSourceName: 'NoneDataSource',
          requestMappingTemplate: resolver.requestTemplate,
          responseMappingTemplate: '$util.toJson($ctx.result)',
        });

        await client.send(updateResolverCommand);
        log(`✅ Resolver actualizado: ${resolver.name}`, colors.green);
        successCount++;
      } catch (error) {
        log(`❌ Error actualizando resolver ${resolver.name}: ${error.message}`, colors.red);
      }
    }

    log('\n🎯 Resolvers corregidos!', colors.bold);
    log(`   ✅ Actualizados: ${successCount}/${resolversToFix.length}`, colors.green);
    
    return successCount === resolversToFix.length;

  } catch (error) {
    log(`❌ Error corrigiendo resolvers: ${error.message}`, colors.red);
    return false;
  }
}

async function main() {
  try {
    const success = await fixResolvers();
    
    if (success) {
      log('\n🎯 Resolvers corregidos exitosamente!', colors.bold);
      log('🔄 Ahora puedes probar AppSync nuevamente', colors.green);
    } else {
      log('\n❌ Error corrigiendo algunos resolvers', colors.red);
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