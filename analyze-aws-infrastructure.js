const { AppSyncClient, GetGraphqlApiCommand, GetSchemaCreationStatusCommand, ListDataSourcesCommand, ListResolversCommand } = require('@aws-sdk/client-appsync');
const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');

// Load credentials from .env file
require('dotenv').config();

const config = {
  region: 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

async function analyzeInfrastructure() {
  console.log('🔍 ANALIZANDO INFRAESTRUCTURA AWS PARA SISTEMA DE VOTACIÓN EN TIEMPO REAL\n');
  console.log('=' .repeat(80));

  try {
    // 1. Analizar AppSync
    console.log('\n📡 1. APPSYNC - API GraphQL en Tiempo Real');
    console.log('-' .repeat(80));
    
    const appsyncClient = new AppSyncClient(config);
    const apiId = 'epjtt2y3fzh53ii6omzj6n6h5a';
    
    const apiCommand = new GetGraphqlApiCommand({ apiId });
    const apiResponse = await appsyncClient.send(apiCommand);
    
    console.log(`   Nombre: ${apiResponse.graphqlApi.name}`);
    console.log(`   API ID: ${apiResponse.graphqlApi.apiId}`);
    console.log(`   Endpoint: ${apiResponse.graphqlApi.uris.GRAPHQL}`);
    console.log(`   Realtime Endpoint: ${apiResponse.graphqlApi.uris.REALTIME}`);
    console.log(`   Tipo de Autenticación: ${apiResponse.graphqlApi.authenticationType}`);
    console.log(`   Estado: ${apiResponse.graphqlApi.xrayEnabled ? '✅ X-Ray habilitado' : '⚠️ X-Ray deshabilitado'}`);

    // 2. Listar Data Sources
    console.log('\n📊 2. DATA SOURCES (Fuentes de Datos)');
    console.log('-' .repeat(80));
    
    const dataSourcesCommand = new ListDataSourcesCommand({ apiId });
    const dataSourcesResponse = await appsyncClient.send(dataSourcesCommand);
    
    if (dataSourcesResponse.dataSources && dataSourcesResponse.dataSources.length > 0) {
      dataSourcesResponse.dataSources.forEach((ds, index) => {
        console.log(`\n   ${index + 1}. ${ds.name}`);
        console.log(`      Tipo: ${ds.type}`);
        if (ds.dynamodbConfig) {
          console.log(`      Tabla DynamoDB: ${ds.dynamodbConfig.tableName}`);
          console.log(`      Region: ${ds.dynamodbConfig.awsRegion}`);
        }
        if (ds.lambdaConfig) {
          console.log(`      Lambda ARN: ${ds.lambdaConfig.lambdaFunctionArn}`);
        }
      });
    } else {
      console.log('   ⚠️ No se encontraron data sources configurados');
    }

    // 3. Analizar DynamoDB Tables
    console.log('\n\n🗄️  3. DYNAMODB - Tablas de Base de Datos');
    console.log('-' .repeat(80));
    
    const dynamoClient = new DynamoDBClient(config);
    const tablesCommand = new ListTablesCommand({});
    const tablesResponse = await dynamoClient.send(tablesCommand);
    
    console.log(`   Total de tablas: ${tablesResponse.TableNames.length}\n`);
    
    for (const tableName of tablesResponse.TableNames) {
      if (tableName.includes('trinity') || tableName.includes('room') || tableName.includes('vote') || tableName.includes('campaign')) {
        const describeCommand = new DescribeTableCommand({ TableName: tableName });
        const tableInfo = await dynamoClient.send(describeCommand);
        
        console.log(`   📋 ${tableName}`);
        console.log(`      Estado: ${tableInfo.Table.TableStatus}`);
        console.log(`      Items (aprox): ${tableInfo.Table.ItemCount || 0}`);
        console.log(`      Clave Primaria: ${tableInfo.Table.KeySchema.map(k => `${k.AttributeName} (${k.KeyType})`).join(', ')}`);
        
        if (tableInfo.Table.GlobalSecondaryIndexes) {
          console.log(`      GSI: ${tableInfo.Table.GlobalSecondaryIndexes.length} índices secundarios`);
          tableInfo.Table.GlobalSecondaryIndexes.forEach(gsi => {
            console.log(`         - ${gsi.IndexName}`);
          });
        }
        
        if (tableInfo.Table.StreamSpecification && tableInfo.Table.StreamSpecification.StreamEnabled) {
          console.log(`      ✅ DynamoDB Streams: HABILITADO (${tableInfo.Table.StreamSpecification.StreamViewType})`);
          console.log(`         Stream ARN: ${tableInfo.Table.LatestStreamArn}`);
        } else {
          console.log(`      ⚠️ DynamoDB Streams: DESHABILITADO`);
        }
        console.log('');
      }
    }

    // 4. Analizar Lambda Functions
    console.log('\n⚡ 4. LAMBDA FUNCTIONS');
    console.log('-' .repeat(80));
    
    const lambdaClient = new LambdaClient(config);
    const functionsCommand = new ListFunctionsCommand({});
    const functionsResponse = await lambdaClient.send(functionsCommand);
    
    const relevantFunctions = functionsResponse.Functions.filter(f => 
      f.FunctionName.includes('trinity') || 
      f.FunctionName.includes('vote') || 
      f.FunctionName.includes('room') ||
      f.FunctionName.includes('campaign')
    );
    
    console.log(`   Total de funciones relevantes: ${relevantFunctions.length}\n`);
    
    relevantFunctions.forEach((func, index) => {
      console.log(`   ${index + 1}. ${func.FunctionName}`);
      console.log(`      Runtime: ${func.Runtime}`);
      console.log(`      Última modificación: ${func.LastModified}`);
      console.log(`      Memoria: ${func.MemorySize}MB`);
      console.log(`      Timeout: ${func.Timeout}s`);
      console.log('');
    });

    // 5. Resumen y Recomendaciones
    console.log('\n' + '=' .repeat(80));
    console.log('📝 RESUMEN Y ANÁLISIS\n');
    
    console.log('✅ Componentes Encontrados:');
    console.log(`   - AppSync API: ${apiResponse.graphqlApi.name}`);
    console.log(`   - Data Sources: ${dataSourcesResponse.dataSources?.length || 0}`);
    console.log(`   - Tablas DynamoDB: ${tablesResponse.TableNames.length}`);
    console.log(`   - Lambda Functions: ${relevantFunctions.length}`);
    
    console.log('\n⚠️ Para Sistema de Votación en Tiempo Real se necesita:');
    console.log('   1. ✅ AppSync GraphQL API (CONFIGURADO)');
    console.log('   2. ✅ Endpoint Realtime (DISPONIBLE)');
    console.log('   3. ❓ Schema GraphQL con Subscriptions (REVISAR)');
    console.log('   4. ❓ Resolvers para Mutations y Subscriptions (REVISAR)');
    console.log('   5. ❓ DynamoDB Streams habilitados (REVISAR TABLAS)');
    
    console.log('\n🔍 Próximos pasos:');
    console.log('   1. Revisar el schema GraphQL de AppSync');
    console.log('   2. Verificar que existan subscriptions para votos en tiempo real');
    console.log('   3. Confirmar que las tablas de votación tengan Streams habilitados');
    console.log('   4. Revisar los resolvers de AppSync');
    
    console.log('\n' + '=' .repeat(80));

  } catch (error) {
    console.error('\n❌ Error al analizar infraestructura:', error.message);
    console.error('   Stack:', error.stack);
  }
}

analyzeInfrastructure();
