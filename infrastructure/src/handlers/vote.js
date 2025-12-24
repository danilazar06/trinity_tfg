"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
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
    console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
    // 1. Verificar que la sala existe y está ACTIVE
    const room = await getRoomAndValidate(roomId);
    // 2. Verificar que el usuario es miembro de la sala
    await validateUserMembership(userId, roomId);
    // 3. Incrementar contador atómico en VotesTable
    const currentVotes = await incrementVoteCount(roomId, movieId);
    // 4. Obtener total de miembros activos en la sala
    const totalMembers = await getTotalActiveMembers(roomId);
    console.log(`📊 Votos actuales: ${currentVotes}, Miembros totales: ${totalMembers}`);
    // 5. Verificar si se alcanzó el consenso (Stop-on-Match)
    if (currentVotes >= totalMembers) {
        console.log('🎉 ¡Match encontrado! Actualizando sala...');
        // Actualizar sala con resultado
        await updateRoomWithMatch(roomId, movieId);
        return {
            id: roomId,
            status: 'MATCHED',
            resultMovieId: movieId,
            hostId: room.hostId,
        };
    }
    // 6. Si no hay match, retornar sala actualizada
    return {
        id: roomId,
        status: room.status,
        resultMovieId: room.resultMovieId,
        hostId: room.hostId,
    };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUVwSCxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBaUI1RDs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBcUMsS0FBSyxFQUFFLEtBQWdDLEVBQUUsRUFBRTtJQUNsRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWpFLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBZSxDQUFDLENBQUMsc0JBQXNCO0lBRXJFLElBQUk7UUFDRixRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLE1BQU07Z0JBQ1QsT0FBTyxNQUFNLFdBQVcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFOUQ7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsU0FBUyxFQUFFLENBQUMsQ0FBQztTQUMzRDtLQUNGO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsU0FBUyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxLQUFLLENBQUM7S0FDYjtBQUNILENBQUMsQ0FBQztBQW5CVyxRQUFBLE9BQU8sV0FtQmxCO0FBRUY7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QkFBc0IsRUFBRSxrQkFBa0I7UUFDMUMsZ0JBQWdCLEVBQUUsb0JBQW9CO1FBQ3RDLHlCQUF5QixFQUFFO1lBQ3pCLFNBQVMsRUFBRSxNQUFNO1lBQ2pCLFNBQVMsRUFBRSxJQUFJO1NBQ2hCO1FBQ0QsTUFBTSxFQUFFLE9BQU87S0FDaEIsQ0FBQyxDQUFDLENBQUM7SUFFSixPQUFPLFFBQVEsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxNQUFjLEVBQUUsT0FBZTtJQUNoRSxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSw0QkFBYSxDQUFDO1FBQ3JDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVk7UUFDbkMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFO1FBQ2YsZ0JBQWdCLEVBQUUseUVBQXlFO1FBQzNGLHdCQUF3QixFQUFFO1lBQ3hCLFNBQVMsRUFBRSxRQUFRLEVBQUUsNENBQTRDO1NBQ2xFO1FBQ0QseUJBQXlCLEVBQUU7WUFDekIsU0FBUyxFQUFFLFNBQVM7WUFDcEIsVUFBVSxFQUFFLE9BQU87WUFDbkIsWUFBWSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1NBQ3ZDO0tBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSixPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsTUFBTSxvQ0FBb0MsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUM3RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kLCBVcGRhdGVDb21tYW5kLCBRdWVyeUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgUm9vbSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVm90ZSB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIHZvdGVzOiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWb3RlSGFuZGxlcjogTMOzZ2ljYSBTdG9wLW9uLU1hdGNoXHJcbiAqIEltcGxlbWVudGEgZWwgYWxnb3JpdG1vIGRlIHZvdGFjacOzbiBxdWUgdGVybWluYSBjdWFuZG8gdG9kb3MgbG9zIG1pZW1icm9zIHZvdGFuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+Xs++4jyBWb3RlIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1ZvdGUodXNlcklkLCBhcmdzLnJvb21JZCwgYXJncy5tb3ZpZUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb2Nlc2FyIHZvdG8gY29uIGFsZ29yaXRtbyBTdG9wLW9uLU1hdGNoXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVm90ZSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbT4ge1xyXG4gIGNvbnNvbGUubG9nKGDwn5ez77iPIFByb2Nlc2FuZG8gdm90bzogVXN1YXJpbyAke3VzZXJJZH0sIFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG5cclxuICAvLyAxLiBWZXJpZmljYXIgcXVlIGxhIHNhbGEgZXhpc3RlIHkgZXN0w6EgQUNUSVZFXHJcbiAgY29uc3Qgcm9vbSA9IGF3YWl0IGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQpO1xyXG4gIFxyXG4gIC8vIDIuIFZlcmlmaWNhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICBhd2FpdCB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZCwgcm9vbUlkKTtcclxuICBcclxuICAvLyAzLiBJbmNyZW1lbnRhciBjb250YWRvciBhdMOzbWljbyBlbiBWb3Rlc1RhYmxlXHJcbiAgY29uc3QgY3VycmVudFZvdGVzID0gYXdhaXQgaW5jcmVtZW50Vm90ZUNvdW50KHJvb21JZCwgbW92aWVJZCk7XHJcbiAgXHJcbiAgLy8gNC4gT2J0ZW5lciB0b3RhbCBkZSBtaWVtYnJvcyBhY3Rpdm9zIGVuIGxhIHNhbGFcclxuICBjb25zdCB0b3RhbE1lbWJlcnMgPSBhd2FpdCBnZXRUb3RhbEFjdGl2ZU1lbWJlcnMocm9vbUlkKTtcclxuICBcclxuICBjb25zb2xlLmxvZyhg8J+TiiBWb3RvcyBhY3R1YWxlczogJHtjdXJyZW50Vm90ZXN9LCBNaWVtYnJvcyB0b3RhbGVzOiAke3RvdGFsTWVtYmVyc31gKTtcclxuICBcclxuICAvLyA1LiBWZXJpZmljYXIgc2kgc2UgYWxjYW56w7MgZWwgY29uc2Vuc28gKFN0b3Atb24tTWF0Y2gpXHJcbiAgaWYgKGN1cnJlbnRWb3RlcyA+PSB0b3RhbE1lbWJlcnMpIHtcclxuICAgIGNvbnNvbGUubG9nKCfwn46JIMKhTWF0Y2ggZW5jb250cmFkbyEgQWN0dWFsaXphbmRvIHNhbGEuLi4nKTtcclxuICAgIFxyXG4gICAgLy8gQWN0dWFsaXphciBzYWxhIGNvbiByZXN1bHRhZG9cclxuICAgIGF3YWl0IHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkLCBtb3ZpZUlkKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgc3RhdHVzOiAnTUFUQ0hFRCcsXHJcbiAgICAgIHJlc3VsdE1vdmllSWQ6IG1vdmllSWQsXHJcbiAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyA2LiBTaSBubyBoYXkgbWF0Y2gsIHJldG9ybmFyIHNhbGEgYWN0dWFsaXphZGFcclxuICByZXR1cm4ge1xyXG4gICAgaWQ6IHJvb21JZCxcclxuICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHkgdmFsaWRhciBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tQW5kVmFsaWRhdGUocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICBLZXk6IHsgcm9vbUlkIH0sXHJcbiAgfSkpO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLkl0ZW0pIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignU2FsYSBubyBlbmNvbnRyYWRhJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByb29tID0gcmVzcG9uc2UuSXRlbTtcclxuICBcclxuICBpZiAocm9vbS5zdGF0dXMgIT09ICdBQ1RJVkUnICYmIHJvb20uc3RhdHVzICE9PSAnV0FJVElORycpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgTGEgc2FsYSBubyBlc3TDoSBkaXNwb25pYmxlIHBhcmEgdm90YXIuIEVzdGFkbyBhY3R1YWw6ICR7cm9vbS5zdGF0dXN9YCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcm9vbTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgfSkpO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLkl0ZW0gfHwgIXJlc3BvbnNlLkl0ZW0uaXNBY3RpdmUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignVXN1YXJpbyBubyBlcyBtaWVtYnJvIGFjdGl2byBkZSBsYSBzYWxhJyk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSW5jcmVtZW50YXIgY29udGFkb3IgYXTDs21pY28gZGUgdm90b3NcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudFZvdGVDb3VudChyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICB0cnkge1xyXG4gICAgLy8gSW50ZW50YXIgYWN0dWFsaXphciB2b3RvIGV4aXN0ZW50ZVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkLCBtb3ZpZUlkIH0sXHJcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdBREQgdm90ZXMgOmluY3JlbWVudCBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOmluY3JlbWVudCc6IDEsXHJcbiAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIH0sXHJcbiAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZS5BdHRyaWJ1dGVzPy52b3RlcyB8fCAxO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgLy8gU2kgZWwgaXRlbSBubyBleGlzdGUsIGNyZWFybG9cclxuICAgIGNvbnN0IG5ld1ZvdGU6IFZvdGUgPSB7XHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgbW92aWVJZCxcclxuICAgICAgdm90ZXM6IDEsXHJcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgSXRlbTogbmV3Vm90ZSxcclxuICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKHJvb21JZCkgQU5EIGF0dHJpYnV0ZV9ub3RfZXhpc3RzKG1vdmllSWQpJyxcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gMTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHRvdGFsIGRlIG1pZW1icm9zIGFjdGl2b3MgZW4gbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VG90YWxBY3RpdmVNZW1iZXJzKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgRmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgU2VsZWN0OiAnQ09VTlQnLFxyXG4gIH0pKTtcclxuXHJcbiAgcmV0dXJuIHJlc3BvbnNlLkNvdW50IHx8IDA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBY3R1YWxpemFyIHNhbGEgY29uIHJlc3VsdGFkbyBkZWwgbWF0Y2hcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgS2V5OiB7IHJvb21JZCB9LFxyXG4gICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCAjc3RhdHVzID0gOnN0YXR1cywgcmVzdWx0TW92aWVJZCA9IDptb3ZpZUlkLCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcclxuICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xyXG4gICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLCAvLyAnc3RhdHVzJyBlcyBwYWxhYnJhIHJlc2VydmFkYSBlbiBEeW5hbW9EQlxyXG4gICAgfSxcclxuICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgJzpzdGF0dXMnOiAnTUFUQ0hFRCcsXHJcbiAgICAgICc6bW92aWVJZCc6IG1vdmllSWQsXHJcbiAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgfSxcclxuICB9KSk7XHJcblxyXG4gIGNvbnNvbGUubG9nKGDinIUgU2FsYSAke3Jvb21JZH0gYWN0dWFsaXphZGEgY29uIG1hdGNoOiBwZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG59Il19