"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const appsync_publisher_1 = require("../utils/appsync-publisher");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * VoteHandler: Lógica Stop-on-Match
 * Implementa el algoritmo de votación que termina cuando todos los miembros votan
 */
const handler = async (event) => {
    console.log('🗳️ Vote Handler:', JSON.stringify(event, null, 2));
    const fieldName = event.info?.fieldName;
    const args = event.arguments;
    const { sub: userId } = event.identity; // Usuario autenticado
    try {
        switch (fieldName) {
            case 'vote':
                return await processVote(userId, args.roomId, args.movieId);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Procesar voto con algoritmo Stop-on-Match
 */
async function processVote(userId, roomId, movieId) {
    const timer = new metrics_1.PerformanceTimer('ProcessVote');
    console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
    try {
        // 1. Verificar que la sala existe y está ACTIVE
        const room = await getRoomAndValidate(roomId);
        // 2. Verificar que el usuario es miembro de la sala
        await validateUserMembership(userId, roomId);
        // 3. Prevenir votos duplicados del mismo usuario para la misma película
        await preventDuplicateVote(userId, roomId, movieId);
        // 4. Incrementar contador atómico en VotesTable
        const currentVotes = await incrementVoteCount(roomId, movieId);
        // 5. Obtener total de miembros activos en la sala
        const totalMembers = await getTotalActiveMembers(roomId);
        console.log(`📊 Votos actuales: ${currentVotes}, Miembros totales: ${totalMembers}`);
        // 6. Publicar evento de actualización de voto en tiempo real
        await (0, appsync_publisher_1.publishVoteUpdateEvent)(roomId, userId, movieId, 'LIKE', currentVotes, totalMembers);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('VOTE_CAST', roomId, userId, {
            movieId,
            currentVotes,
            totalMembers,
            progress: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0
        });
        // 7. Verificar si se alcanzó el consenso (Stop-on-Match)
        if (currentVotes >= totalMembers) {
            console.log('🎉 ¡Match encontrado! Actualizando sala y notificando...');
            // Actualizar sala con resultado
            await updateRoomWithMatch(roomId, movieId);
            // Obtener participantes para la notificación
            const participants = await getRoomParticipants(roomId);
            // Obtener título de la película
            const movieTitle = await (0, appsync_publisher_1.getMovieTitle)(movieId);
            // Publicar evento de match encontrado en tiempo real
            await (0, appsync_publisher_1.publishMatchFoundEvent)(roomId, movieId, movieTitle, participants);
            // Log business metric for match
            (0, metrics_1.logBusinessMetric)('MATCH_FOUND', roomId, userId, {
                movieId,
                movieTitle,
                participantCount: participants.length,
                votesRequired: totalMembers
            });
            timer.finish(true, undefined, {
                result: 'match_found',
                movieId,
                participantCount: participants.length
            });
            return {
                id: roomId,
                status: 'MATCHED',
                resultMovieId: movieId,
                hostId: room.hostId,
            };
        }
        // 8. Si no hay match, retornar sala actualizada
        timer.finish(true, undefined, {
            result: 'vote_recorded',
            progress: `${currentVotes}/${totalMembers}`
        });
        return {
            id: roomId,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
        };
    }
    catch (error) {
        (0, metrics_1.logError)('ProcessVote', error, { userId, roomId, movieId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Obtener y validar sala
 */
async function getRoomAndValidate(roomId) {
    const response = await docClient.send(new lib_dynamodb_1.GetCommand({
        TableName: process.env.ROOMS_TABLE,
        Key: { roomId },
    }));
    if (!response.Item) {
        throw new Error('Sala no encontrada');
    }
    const room = response.Item;
    if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
        throw new Error(`La sala no está disponible para votar. Estado actual: ${room.status}`);
    }
    return room;
}
/**
 * Validar que el usuario es miembro de la sala
 */
async function validateUserMembership(userId, roomId) {
    const response = await docClient.send(new lib_dynamodb_1.GetCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE,
        Key: { roomId, userId },
    }));
    if (!response.Item || !response.Item.isActive) {
        throw new Error('Usuario no es miembro activo de la sala');
    }
}
/**
 * Incrementar contador atómico de votos
 */
async function incrementVoteCount(roomId, movieId) {
    try {
        // Intentar actualizar voto existente
        const response = await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.VOTES_TABLE,
            Key: { roomId, movieId },
            UpdateExpression: 'ADD votes :increment SET updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':increment': 1,
                ':updatedAt': new Date().toISOString(),
            },
            ReturnValues: 'ALL_NEW',
        }));
        return response.Attributes?.votes || 1;
    }
    catch (error) {
        // Si el item no existe, crearlo
        const newVote = {
            roomId,
            movieId,
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.VOTES_TABLE,
            Item: newVote,
            ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(movieId)',
        }));
        return 1;
    }
}
/**
 * Obtener total de miembros activos en la sala
 */
async function getTotalActiveMembers(roomId) {
    const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
            ':roomId': roomId,
            ':active': true,
        },
        Select: 'COUNT',
    }));
    return response.Count || 0;
}
/**
 * Actualizar sala con resultado del match
 */
async function updateRoomWithMatch(roomId, movieId) {
    await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: process.env.ROOMS_TABLE,
        Key: { roomId },
        UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status', // 'status' es palabra reservada en DynamoDB
        },
        ExpressionAttributeValues: {
            ':status': 'MATCHED',
            ':movieId': movieId,
            ':updatedAt': new Date().toISOString(),
        },
    }));
    console.log(`✅ Sala ${roomId} actualizada con match: película ${movieId}`);
}
/**
 * Prevenir votos duplicados del mismo usuario para la misma película
 */
async function preventDuplicateVote(userId, roomId, movieId) {
    const roomMovieId = `${roomId}_${movieId}`;
    try {
        // Verificar si el usuario ya votó por esta película en esta sala
        const existingVote = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.USER_VOTES_TABLE,
            Key: { userId, roomMovieId },
        }));
        if (existingVote.Item) {
            throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
        }
        // Registrar el voto para prevenir duplicados
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USER_VOTES_TABLE,
            Item: {
                userId,
                roomMovieId,
                roomId,
                movieId,
                votedAt: new Date().toISOString(),
                voteType: 'LIKE' // Trinity solo tiene votos positivos
            },
            ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(roomMovieId)'
        }));
        console.log(`✅ Voto registrado: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
    }
    catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
        }
        throw error;
    }
}
/**
 * Obtener lista de participantes de la sala
 */
async function getRoomParticipants(roomId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true,
            },
            ProjectionExpression: 'userId',
        }));
        return response.Items?.map(item => item.userId) || [];
    }
    catch (error) {
        console.warn('⚠️ Error obteniendo participantes:', error);
        return [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCxrRUFBMkc7QUFDM0csOENBQWlGO0FBRWpGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFpQjVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7SUFDeEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxRQUFlLENBQUMsQ0FBQyxzQkFBc0I7SUFFckUsSUFBSTtRQUNGLFFBQVEsU0FBUyxFQUFFO1lBQ2pCLEtBQUssTUFBTTtnQkFDVCxPQUFPLE1BQU0sV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUU5RDtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLDJCQUEyQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQzNEO0tBQ0Y7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxTQUFTLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLEtBQUssQ0FBQztLQUNiO0FBQ0gsQ0FBQyxDQUFDO0FBbkJXLFFBQUEsT0FBTyxXQW1CbEI7QUFFRjs7R0FFRztBQUNILEtBQUssVUFBVSxXQUFXLENBQUMsTUFBYyxFQUFFLE1BQWMsRUFBRSxPQUFlO0lBQ3hFLE1BQU0sS0FBSyxHQUFHLElBQUksMEJBQWdCLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsTUFBTSxVQUFVLE1BQU0sY0FBYyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBRTNGLElBQUk7UUFDRixnREFBZ0Q7UUFDaEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU5QyxvREFBb0Q7UUFDcEQsTUFBTSxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFN0Msd0VBQXdFO1FBQ3hFLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwRCxnREFBZ0Q7UUFDaEQsTUFBTSxZQUFZLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFL0Qsa0RBQWtEO1FBQ2xELE1BQU0sWUFBWSxHQUFHLE1BQU0scUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsWUFBWSx1QkFBdUIsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUVyRiw2REFBNkQ7UUFDN0QsTUFBTSxJQUFBLDBDQUFzQixFQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFMUYsc0JBQXNCO1FBQ3RCLElBQUEsMkJBQWlCLEVBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7WUFDN0MsT0FBTztZQUNQLFlBQVk7WUFDWixZQUFZO1lBQ1osUUFBUSxFQUFFLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNyRSxDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsSUFBSSxZQUFZLElBQUksWUFBWSxFQUFFO1lBQ2hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMERBQTBELENBQUMsQ0FBQztZQUV4RSxnQ0FBZ0M7WUFDaEMsTUFBTSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFM0MsNkNBQTZDO1lBQzdDLE1BQU0sWUFBWSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFdkQsZ0NBQWdDO1lBQ2hDLE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBQSxpQ0FBYSxFQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRWhELHFEQUFxRDtZQUNyRCxNQUFNLElBQUEsMENBQXNCLEVBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFFeEUsZ0NBQWdDO1lBQ2hDLElBQUEsMkJBQWlCLEVBQUMsYUFBYSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7Z0JBQy9DLE9BQU87Z0JBQ1AsVUFBVTtnQkFDVixnQkFBZ0IsRUFBRSxZQUFZLENBQUMsTUFBTTtnQkFDckMsYUFBYSxFQUFFLFlBQVk7YUFDNUIsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO2dCQUM1QixNQUFNLEVBQUUsYUFBYTtnQkFDckIsT0FBTztnQkFDUCxnQkFBZ0IsRUFBRSxZQUFZLENBQUMsTUFBTTthQUN0QyxDQUFDLENBQUM7WUFFSCxPQUFPO2dCQUNMLEVBQUUsRUFBRSxNQUFNO2dCQUNWLE1BQU0sRUFBRSxTQUFTO2dCQUNqQixhQUFhLEVBQUUsT0FBTztnQkFDdEIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO2FBQ3BCLENBQUM7U0FDSDtRQUVELGdEQUFnRDtRQUNoRCxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDNUIsTUFBTSxFQUFFLGVBQWU7WUFDdkIsUUFBUSxFQUFFLEdBQUcsWUFBWSxJQUFJLFlBQVksRUFBRTtTQUM1QyxDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ0wsRUFBRSxFQUFFLE1BQU07WUFDVixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2pDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtTQUNwQixDQUFDO0tBRUg7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLElBQUEsa0JBQVEsRUFBQyxhQUFhLEVBQUUsS0FBYyxFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFHLEtBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNLEtBQUssQ0FBQztLQUNiO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLGtCQUFrQixDQUFDLE1BQWM7SUFDOUMsTUFBTSxRQUFRLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQVUsQ0FBQztRQUNuRCxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1FBQ25DLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRTtLQUNoQixDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO1FBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztLQUN2QztJQUVELE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFFM0IsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUN6RCxNQUFNLElBQUksS0FBSyxDQUFDLHlEQUF5RCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztLQUN6RjtJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLHNCQUFzQixDQUFDLE1BQWMsRUFBRSxNQUFjO0lBQ2xFLE1BQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7UUFDbkQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQW1CO1FBQzFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7S0FDeEIsQ0FBQyxDQUFDLENBQUM7SUFFSixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO1FBQzdDLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztLQUM1RDtBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxNQUFjLEVBQUUsT0FBZTtJQUMvRCxJQUFJO1FBQ0YscUNBQXFDO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLDRCQUFhLENBQUM7WUFDdEQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBWTtZQUNuQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO1lBQ3hCLGdCQUFnQixFQUFFLGlEQUFpRDtZQUNuRSx5QkFBeUIsRUFBRTtnQkFDekIsWUFBWSxFQUFFLENBQUM7Z0JBQ2YsWUFBWSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2FBQ3ZDO1lBQ0QsWUFBWSxFQUFFLFNBQVM7U0FDeEIsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxJQUFJLENBQUMsQ0FBQztLQUV4QztJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsZ0NBQWdDO1FBQ2hDLE1BQU0sT0FBTyxHQUFTO1lBQ3BCLE1BQU07WUFDTixPQUFPO1lBQ1AsS0FBSyxFQUFFLENBQUM7WUFDUixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1NBQ3BDLENBQUM7UUFFRixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSx5QkFBVSxDQUFDO1lBQ2xDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVk7WUFDbkMsSUFBSSxFQUFFLE9BQU87WUFDYixtQkFBbUIsRUFBRSxnRUFBZ0U7U0FDdEYsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLENBQUMsQ0FBQztLQUNWO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLHFCQUFxQixDQUFDLE1BQWM7SUFDakQsTUFBTSxRQUFRLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksMkJBQVksQ0FBQztRQUNyRCxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBbUI7UUFDMUMsc0JBQXNCLEVBQUUsa0JBQWtCO1FBQzFDLGdCQUFnQixFQUFFLG9CQUFvQjtRQUN0Qyx5QkFBeUIsRUFBRTtZQUN6QixTQUFTLEVBQUUsTUFBTTtZQUNqQixTQUFTLEVBQUUsSUFBSTtTQUNoQjtRQUNELE1BQU0sRUFBRSxPQUFPO0tBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBRUosT0FBTyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsbUJBQW1CLENBQUMsTUFBYyxFQUFFLE9BQWU7SUFDaEUsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksNEJBQWEsQ0FBQztRQUNyQyxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1FBQ25DLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRTtRQUNmLGdCQUFnQixFQUFFLHlFQUF5RTtRQUMzRix3QkFBd0IsRUFBRTtZQUN4QixTQUFTLEVBQUUsUUFBUSxFQUFFLDRDQUE0QztTQUNsRTtRQUNELHlCQUF5QixFQUFFO1lBQ3pCLFNBQVMsRUFBRSxTQUFTO1lBQ3BCLFVBQVUsRUFBRSxPQUFPO1lBQ25CLFlBQVksRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUN2QztLQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUosT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLE1BQU0sb0NBQW9DLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDN0UsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLG9CQUFvQixDQUFDLE1BQWMsRUFBRSxNQUFjLEVBQUUsT0FBZTtJQUNqRixNQUFNLFdBQVcsR0FBRyxHQUFHLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztJQUUzQyxJQUFJO1FBQ0YsaUVBQWlFO1FBQ2pFLE1BQU0sWUFBWSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7WUFDdkQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWlCO1lBQ3hDLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUU7U0FDN0IsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLFlBQVksQ0FBQyxJQUFJLEVBQUU7WUFDckIsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLE1BQU0sNEJBQTRCLE9BQU8sZUFBZSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1NBQzlGO1FBRUQsNkNBQTZDO1FBQzdDLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7WUFDbEMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWlCO1lBQ3hDLElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFdBQVc7Z0JBQ1gsTUFBTTtnQkFDTixPQUFPO2dCQUNQLE9BQU8sRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDakMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxxQ0FBcUM7YUFDdkQ7WUFDRCxtQkFBbUIsRUFBRSxvRUFBb0U7U0FDMUYsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixNQUFNLFVBQVUsTUFBTSxjQUFjLE9BQU8sRUFBRSxDQUFDLENBQUM7S0FFMUY7SUFBQyxPQUFPLEtBQVUsRUFBRTtRQUNuQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssaUNBQWlDLEVBQUU7WUFDcEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLE1BQU0sNEJBQTRCLE9BQU8sZUFBZSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1NBQzlGO1FBQ0QsTUFBTSxLQUFLLENBQUM7S0FDYjtBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxNQUFjO0lBQy9DLElBQUk7UUFDRixNQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSwyQkFBWSxDQUFDO1lBQ3JELFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFtQjtZQUMxQyxzQkFBc0IsRUFBRSxrQkFBa0I7WUFDMUMsZ0JBQWdCLEVBQUUsb0JBQW9CO1lBQ3RDLHlCQUF5QixFQUFFO2dCQUN6QixTQUFTLEVBQUUsTUFBTTtnQkFDakIsU0FBUyxFQUFFLElBQUk7YUFDaEI7WUFDRCxvQkFBb0IsRUFBRSxRQUFRO1NBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxRQUFRLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7S0FDdkQ7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsT0FBTyxFQUFFLENBQUM7S0FDWDtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQsIFVwZGF0ZUNvbW1hbmQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQsIHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQsIGdldE1vdmllVGl0bGUgfSBmcm9tICcuLi91dGlscy9hcHBzeW5jLXB1Ymxpc2hlcic7XHJcbmltcG9ydCB7IGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgUm9vbSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVm90ZSB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIHZvdGVzOiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWb3RlSGFuZGxlcjogTMOzZ2ljYSBTdG9wLW9uLU1hdGNoXHJcbiAqIEltcGxlbWVudGEgZWwgYWxnb3JpdG1vIGRlIHZvdGFjacOzbiBxdWUgdGVybWluYSBjdWFuZG8gdG9kb3MgbG9zIG1pZW1icm9zIHZvdGFuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+Xs++4jyBWb3RlIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1ZvdGUodXNlcklkLCBhcmdzLnJvb21JZCwgYXJncy5tb3ZpZUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb2Nlc2FyIHZvdG8gY29uIGFsZ29yaXRtbyBTdG9wLW9uLU1hdGNoXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVm90ZSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ1Byb2Nlc3NWb3RlJyk7XHJcbiAgY29uc29sZS5sb2coYPCfl7PvuI8gUHJvY2VzYW5kbyB2b3RvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyAxLiBWZXJpZmljYXIgcXVlIGxhIHNhbGEgZXhpc3RlIHkgZXN0w6EgQUNUSVZFXHJcbiAgICBjb25zdCByb29tID0gYXdhaXQgZ2V0Um9vbUFuZFZhbGlkYXRlKHJvb21JZCk7XHJcbiAgICBcclxuICAgIC8vIDIuIFZlcmlmaWNhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICAgIGF3YWl0IHZhbGlkYXRlVXNlck1lbWJlcnNoaXAodXNlcklkLCByb29tSWQpO1xyXG4gICAgXHJcbiAgICAvLyAzLiBQcmV2ZW5pciB2b3RvcyBkdXBsaWNhZG9zIGRlbCBtaXNtbyB1c3VhcmlvIHBhcmEgbGEgbWlzbWEgcGVsw61jdWxhXHJcbiAgICBhd2FpdCBwcmV2ZW50RHVwbGljYXRlVm90ZSh1c2VySWQsIHJvb21JZCwgbW92aWVJZCk7XHJcbiAgICBcclxuICAgIC8vIDQuIEluY3JlbWVudGFyIGNvbnRhZG9yIGF0w7NtaWNvIGVuIFZvdGVzVGFibGVcclxuICAgIGNvbnN0IGN1cnJlbnRWb3RlcyA9IGF3YWl0IGluY3JlbWVudFZvdGVDb3VudChyb29tSWQsIG1vdmllSWQpO1xyXG4gICAgXHJcbiAgICAvLyA1LiBPYnRlbmVyIHRvdGFsIGRlIG1pZW1icm9zIGFjdGl2b3MgZW4gbGEgc2FsYVxyXG4gICAgY29uc3QgdG90YWxNZW1iZXJzID0gYXdhaXQgZ2V0VG90YWxBY3RpdmVNZW1iZXJzKHJvb21JZCk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn5OKIFZvdG9zIGFjdHVhbGVzOiAke2N1cnJlbnRWb3Rlc30sIE1pZW1icm9zIHRvdGFsZXM6ICR7dG90YWxNZW1iZXJzfWApO1xyXG4gICAgXHJcbiAgICAvLyA2LiBQdWJsaWNhciBldmVudG8gZGUgYWN0dWFsaXphY2nDs24gZGUgdm90byBlbiB0aWVtcG8gcmVhbFxyXG4gICAgYXdhaXQgcHVibGlzaFZvdGVVcGRhdGVFdmVudChyb29tSWQsIHVzZXJJZCwgbW92aWVJZCwgJ0xJS0UnLCBjdXJyZW50Vm90ZXMsIHRvdGFsTWVtYmVycyk7XHJcbiAgICBcclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdWT1RFX0NBU1QnLCByb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICBtb3ZpZUlkLFxyXG4gICAgICBjdXJyZW50Vm90ZXMsXHJcbiAgICAgIHRvdGFsTWVtYmVycyxcclxuICAgICAgcHJvZ3Jlc3M6IHRvdGFsTWVtYmVycyA+IDAgPyAoY3VycmVudFZvdGVzIC8gdG90YWxNZW1iZXJzKSAqIDEwMCA6IDBcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyA3LiBWZXJpZmljYXIgc2kgc2UgYWxjYW56w7MgZWwgY29uc2Vuc28gKFN0b3Atb24tTWF0Y2gpXHJcbiAgICBpZiAoY3VycmVudFZvdGVzID49IHRvdGFsTWVtYmVycykge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+OiSDCoU1hdGNoIGVuY29udHJhZG8hIEFjdHVhbGl6YW5kbyBzYWxhIHkgbm90aWZpY2FuZG8uLi4nKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEFjdHVhbGl6YXIgc2FsYSBjb24gcmVzdWx0YWRvXHJcbiAgICAgIGF3YWl0IHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkLCBtb3ZpZUlkKTtcclxuICAgICAgXHJcbiAgICAgIC8vIE9idGVuZXIgcGFydGljaXBhbnRlcyBwYXJhIGxhIG5vdGlmaWNhY2nDs25cclxuICAgICAgY29uc3QgcGFydGljaXBhbnRzID0gYXdhaXQgZ2V0Um9vbVBhcnRpY2lwYW50cyhyb29tSWQpO1xyXG4gICAgICBcclxuICAgICAgLy8gT2J0ZW5lciB0w610dWxvIGRlIGxhIHBlbMOtY3VsYVxyXG4gICAgICBjb25zdCBtb3ZpZVRpdGxlID0gYXdhaXQgZ2V0TW92aWVUaXRsZShtb3ZpZUlkKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFB1YmxpY2FyIGV2ZW50byBkZSBtYXRjaCBlbmNvbnRyYWRvIGVuIHRpZW1wbyByZWFsXHJcbiAgICAgIGF3YWl0IHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQocm9vbUlkLCBtb3ZpZUlkLCBtb3ZpZVRpdGxlLCBwYXJ0aWNpcGFudHMpO1xyXG4gICAgICBcclxuICAgICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpYyBmb3IgbWF0Y2hcclxuICAgICAgbG9nQnVzaW5lc3NNZXRyaWMoJ01BVENIX0ZPVU5EJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgICBtb3ZpZUlkLFxyXG4gICAgICAgIG1vdmllVGl0bGUsXHJcbiAgICAgICAgcGFydGljaXBhbnRDb3VudDogcGFydGljaXBhbnRzLmxlbmd0aCxcclxuICAgICAgICB2b3Rlc1JlcXVpcmVkOiB0b3RhbE1lbWJlcnNcclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IFxyXG4gICAgICAgIHJlc3VsdDogJ21hdGNoX2ZvdW5kJyxcclxuICAgICAgICBtb3ZpZUlkLFxyXG4gICAgICAgIHBhcnRpY2lwYW50Q291bnQ6IHBhcnRpY2lwYW50cy5sZW5ndGggXHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogcm9vbUlkLFxyXG4gICAgICAgIHN0YXR1czogJ01BVENIRUQnLFxyXG4gICAgICAgIHJlc3VsdE1vdmllSWQ6IG1vdmllSWQsXHJcbiAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gOC4gU2kgbm8gaGF5IG1hdGNoLCByZXRvcm5hciBzYWxhIGFjdHVhbGl6YWRhXHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IFxyXG4gICAgICByZXN1bHQ6ICd2b3RlX3JlY29yZGVkJyxcclxuICAgICAgcHJvZ3Jlc3M6IGAke2N1cnJlbnRWb3Rlc30vJHt0b3RhbE1lbWJlcnN9YCBcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdQcm9jZXNzVm90ZScsIGVycm9yIGFzIEVycm9yLCB7IHVzZXJJZCwgcm9vbUlkLCBtb3ZpZUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB5IHZhbGlkYXIgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Um9vbUFuZFZhbGlkYXRlKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgS2V5OiB7IHJvb21JZCB9LFxyXG4gIH0pKTtcclxuXHJcbiAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgcm9vbSA9IHJlc3BvbnNlLkl0ZW07XHJcbiAgXHJcbiAgaWYgKHJvb20uc3RhdHVzICE9PSAnQUNUSVZFJyAmJiByb29tLnN0YXR1cyAhPT0gJ1dBSVRJTkcnKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYExhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyLiBFc3RhZG8gYWN0dWFsOiAke3Jvb20uc3RhdHVzfWApO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJvb207XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWYWxpZGFyIHF1ZSBlbCB1c3VhcmlvIGVzIG1pZW1icm8gZGUgbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVVc2VyTWVtYmVyc2hpcCh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gIH0pKTtcclxuXHJcbiAgaWYgKCFyZXNwb25zZS5JdGVtIHx8ICFyZXNwb25zZS5JdGVtLmlzQWN0aXZlKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzdWFyaW8gbm8gZXMgbWllbWJybyBhY3Rpdm8gZGUgbGEgc2FsYScpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEluY3JlbWVudGFyIGNvbnRhZG9yIGF0w7NtaWNvIGRlIHZvdG9zXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBpbmNyZW1lbnRWb3RlQ291bnQocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIEludGVudGFyIGFjdHVhbGl6YXIgdm90byBleGlzdGVudGVcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFVwZGF0ZUNvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCwgbW92aWVJZCB9LFxyXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiAnQUREIHZvdGVzIDppbmNyZW1lbnQgU0VUIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgJzppbmNyZW1lbnQnOiAxLFxyXG4gICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB9LFxyXG4gICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gcmVzcG9uc2UuQXR0cmlidXRlcz8udm90ZXMgfHwgMTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIC8vIFNpIGVsIGl0ZW0gbm8gZXhpc3RlLCBjcmVhcmxvXHJcbiAgICBjb25zdCBuZXdWb3RlOiBWb3RlID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIHZvdGVzOiAxLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IG5ld1ZvdGUsXHJcbiAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhyb29tSWQpIEFORCBhdHRyaWJ1dGVfbm90X2V4aXN0cyhtb3ZpZUlkKScsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIDE7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB0b3RhbCBkZSBtaWVtYnJvcyBhY3Rpdm9zIGVuIGxhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFRvdGFsQWN0aXZlTWVtYmVycyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tSWQgPSA6cm9vbUlkJyxcclxuICAgIEZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgfSxcclxuICAgIFNlbGVjdDogJ0NPVU5UJyxcclxuICB9KSk7XHJcblxyXG4gIHJldHVybiByZXNwb25zZS5Db3VudCB8fCAwO1xyXG59XHJcblxyXG4vKipcclxuICogQWN0dWFsaXphciBzYWxhIGNvbiByZXN1bHRhZG8gZGVsIG1hdGNoXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVSb29tV2l0aE1hdGNoKHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgIEtleTogeyByb29tSWQgfSxcclxuICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI3N0YXR1cyA9IDpzdGF0dXMsIHJlc3VsdE1vdmllSWQgPSA6bW92aWVJZCwgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgJyNzdGF0dXMnOiAnc3RhdHVzJywgLy8gJ3N0YXR1cycgZXMgcGFsYWJyYSByZXNlcnZhZGEgZW4gRHluYW1vREJcclxuICAgIH0sXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICc6c3RhdHVzJzogJ01BVENIRUQnLFxyXG4gICAgICAnOm1vdmllSWQnOiBtb3ZpZUlkLFxyXG4gICAgICAnOnVwZGF0ZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH0sXHJcbiAgfSkpO1xyXG5cclxuICBjb25zb2xlLmxvZyhg4pyFIFNhbGEgJHtyb29tSWR9IGFjdHVhbGl6YWRhIGNvbiBtYXRjaDogcGVsw61jdWxhICR7bW92aWVJZH1gKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFByZXZlbmlyIHZvdG9zIGR1cGxpY2Fkb3MgZGVsIG1pc21vIHVzdWFyaW8gcGFyYSBsYSBtaXNtYSBwZWzDrWN1bGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3Qgcm9vbU1vdmllSWQgPSBgJHtyb29tSWR9XyR7bW92aWVJZH1gO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBWZXJpZmljYXIgc2kgZWwgdXN1YXJpbyB5YSB2b3TDsyBwb3IgZXN0YSBwZWzDrWN1bGEgZW4gZXN0YSBzYWxhXHJcbiAgICBjb25zdCBleGlzdGluZ1ZvdGUgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUl9WT1RFU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyB1c2VySWQsIHJvb21Nb3ZpZUlkIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKGV4aXN0aW5nVm90ZS5JdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVnaXN0cmFyIGVsIHZvdG8gcGFyYSBwcmV2ZW5pciBkdXBsaWNhZG9zXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUl9WT1RFU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgcm9vbU1vdmllSWQsXHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgdm90ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHZvdGVUeXBlOiAnTElLRScgLy8gVHJpbml0eSBzb2xvIHRpZW5lIHZvdG9zIHBvc2l0aXZvc1xyXG4gICAgICB9LFxyXG4gICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKSBBTkQgYXR0cmlidXRlX25vdF9leGlzdHMocm9vbU1vdmllSWQpJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgVm90byByZWdpc3RyYWRvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICB9XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGxpc3RhIGRlIHBhcnRpY2lwYW50ZXMgZGUgbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Um9vbVBhcnRpY2lwYW50cyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgIEZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgJzpyb29tSWQnOiByb29tSWQsXHJcbiAgICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBQcm9qZWN0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCcsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3BvbnNlLkl0ZW1zPy5tYXAoaXRlbSA9PiBpdGVtLnVzZXJJZCkgfHwgW107XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIG9idGVuaWVuZG8gcGFydGljaXBhbnRlczonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG59Il19