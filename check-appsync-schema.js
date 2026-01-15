#!/usr/bin/env node

/**
 * Script para verificar qué subscriptions están definidas en el schema de AppSync
 */

const { execSync } = require('child_process');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';

console.log('🔍 Verificando schema de AppSync...\n');

try {
  // Obtener el schema actual
  console.log('📥 Descargando schema actual de AppSync...');
  execSync(`aws appsync get-graphql-api --api-id ${API_ID} --region ${REGION} --query "graphqlApi.name" --output text`, {
    stdio: 'inherit'
  });

  // Listar todos los tipos
  console.log('\n📋 Listando tipos en el schema...');
  const typesOutput = execSync(
    `aws appsync list-types --api-id ${API_ID} --region ${REGION} --format SDL --no-cli-pager --query "types[?name=='Subscription'].name" --output json`,
    { encoding: 'utf-8' }
  );
  
  console.log('Tipos encontrados:', typesOutput);

  // Intentar obtener el schema completo
  console.log('\n📄 Intentando obtener schema completo...');
  try {
    execSync(
      `aws appsync get-type --api-id ${API_ID} --region ${REGION} --type-name Subscription --format SDL --no-cli-pager`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    console.log('⚠️  No se pudo obtener el tipo Subscription directamente');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
