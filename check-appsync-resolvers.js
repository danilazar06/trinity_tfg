// Script para verificar los resolvers de AppSync
require('dotenv').config();

const { AppSyncClient, ListResolversCommand, GetResolverCommand } = require('@aws-sdk/client-appsync');

const config = {
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const client = new AppSyncClient(config);
const apiId = 'epjtt2y3fzh53ii6omzj6n6h5a';

async function main() {
    try {
        console.log('📋 Verificando resolvers de AppSync...\n');

        // Listar resolvers de Query
        console.log('=== QUERY RESOLVERS ===\n');
        const queryResolvers = await client.send(new ListResolversCommand({
            apiId: apiId,
            typeName: 'Query'
        }));

        if (queryResolvers.resolvers) {
            queryResolvers.resolvers.forEach(r => {
                console.log(`  ${r.fieldName}:`);
                console.log(`    DataSource: ${r.dataSourceName || 'NONE'}`);
                console.log(`    Kind: ${r.kind}`);
                console.log('');
            });
        }

        // Verificar específicamente getUserRooms
        console.log('\n=== DETALLE getUserRooms ===\n');
        try {
            const getUserRoomsResolver = await client.send(new GetResolverCommand({
                apiId: apiId,
                typeName: 'Query',
                fieldName: 'getUserRooms'
            }));
            
            console.log('Resolver encontrado:');
            console.log(`  DataSource: ${getUserRoomsResolver.resolver.dataSourceName}`);
            console.log(`  Kind: ${getUserRoomsResolver.resolver.kind}`);
            
            if (getUserRoomsResolver.resolver.requestMappingTemplate) {
                console.log('\n  Request Template:');
                console.log(getUserRoomsResolver.resolver.requestMappingTemplate.substring(0, 500));
            }
            
        } catch (e) {
            console.log('❌ NO HAY RESOLVER para getUserRooms!');
            console.log('   Este es el problema - necesitamos crear el resolver.');
        }

        // Verificar getMyHistory (que es el alias)
        console.log('\n=== DETALLE getMyHistory ===\n');
        try {
            const getMyHistoryResolver = await client.send(new GetResolverCommand({
                apiId: apiId,
                typeName: 'Query',
                fieldName: 'getMyHistory'
            }));
            
            console.log('Resolver encontrado:');
            console.log(`  DataSource: ${getMyHistoryResolver.resolver.dataSourceName}`);
            console.log(`  Kind: ${getMyHistoryResolver.resolver.kind}`);
            
        } catch (e) {
            console.log('❌ NO HAY RESOLVER para getMyHistory!');
        }

        // Listar resolvers de Mutation para comparar
        console.log('\n=== MUTATION RESOLVERS ===\n');
        const mutationResolvers = await client.send(new ListResolversCommand({
            apiId: apiId,
            typeName: 'Mutation'
        }));

        if (mutationResolvers.resolvers) {
            mutationResolvers.resolvers.forEach(r => {
                if (r.fieldName.toLowerCase().includes('room')) {
                    console.log(`  ${r.fieldName}: ${r.dataSourceName || 'NONE'}`);
                }
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
