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
                // Extraer parámetros del input según el schema GraphQL
                const { roomId, movieId, voteType } = args.input;
                return await processVote(userId, roomId, movieId, voteType);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        // Mejorar mensajes de error para el usuario
        if (error instanceof Error) {
            // Si es un error de sistema interno, no exponer detalles técnicos
            if (error.message.includes('Error interno del sistema')) {
                throw error; // Ya tiene un mensaje amigable
            }
            // Para otros errores, proporcionar contexto adicional
            if (error.message.includes('Sala no encontrada')) {
                throw new Error('La sala especificada no existe o no tienes acceso a ella.');
            }
            if (error.message.includes('Usuario no es miembro activo')) {
                throw new Error('No eres miembro de esta sala o tu membresía no está activa.');
            }
            if (error.message.includes('ya votó por la película')) {
                throw new Error('Ya has votado por esta película en esta sala.');
            }
            if (error.message.includes('no está disponible para votar')) {
                throw new Error('Esta sala no está disponible para votar en este momento.');
            }
            // Errores de red o conectividad
            if (error.message.includes('Network') || error.message.includes('timeout')) {
                throw new Error('Problema de conexión. Por favor, verifica tu conexión a internet e inténtalo de nuevo.');
            }
            // Errores de autorización
            if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
                throw new Error('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            }
            // Errores de validación de datos
            if (error.message.includes('ValidationException') || error.message.includes('Invalid')) {
                throw new Error('Los datos enviados no son válidos. Por favor, inténtalo de nuevo.');
            }
            // Error genérico para casos no manejados específicamente
            throw new Error('Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.');
        }
        throw error;
    }
};
exports.handler = handler;
/**
 * Procesar voto con algoritmo Stop-on-Match
 * Solo procesa votos LIKE - los DISLIKE se ignoran según el algoritmo
 */
async function processVote(userId, roomId, movieId, voteType) {
    const timer = new metrics_1.PerformanceTimer('ProcessVote');
    console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}, Tipo: ${voteType}`);
    try {
        // 1. Verificar que la sala existe y está ACTIVE
        const room = await getRoomAndValidate(roomId);
        // 2. Verificar que el usuario es miembro de la sala
        await validateUserMembership(userId, roomId);
        // 3. Solo procesar votos LIKE - ignorar DISLIKE según algoritmo Stop-on-Match
        if (voteType !== 'LIKE') {
            console.log(`⏭️ Ignorando voto ${voteType} según algoritmo Stop-on-Match`);
            return {
                id: roomId,
                status: room.status,
                resultMovieId: room.resultMovieId,
                hostId: room.hostId,
            };
        }
        // 4. Prevenir votos duplicados del mismo usuario para la misma película
        await preventDuplicateVote(userId, roomId, movieId);
        // 5. Incrementar contador atómico en VotesTable
        const currentVotes = await incrementVoteCount(roomId, movieId);
        // 6. Obtener total de miembros activos en la sala
        const totalMembers = await getTotalActiveMembers(roomId);
        console.log(`📊 Votos actuales: ${currentVotes}, Miembros totales: ${totalMembers}`);
        // 7. Publicar evento de actualización de voto en tiempo real
        await (0, appsync_publisher_1.publishVoteUpdateEvent)(roomId, userId, movieId, 'LIKE', currentVotes, totalMembers);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('VOTE_CAST', roomId, userId, {
            movieId,
            currentVotes,
            totalMembers,
            progress: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0
        });
        // 8. Verificar si se alcanzó el consenso (Stop-on-Match)
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
        // 9. Si no hay match, retornar sala actualizada
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
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            console.log('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
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
        catch (error) {
            // Distinguir entre errores de clave y errores de negocio
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOMS_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para getRoomAndValidate');
                    throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                }
                console.log(`🔄 Reintentando getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            // Re-lanzar errores de negocio tal como están
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo validar la sala después de múltiples intentos.');
}
/**
 * Validar que el usuario es miembro de la sala
 */
async function validateUserMembership(userId, roomId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
            }));
            if (!response.Item || !response.Item.isActive) {
                throw new Error('Usuario no es miembro activo de la sala');
            }
            return; // Success
        }
        catch (error) {
            // Distinguir entre errores de clave y errores de negocio
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOM_MEMBERS_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para validateUserMembership');
                    throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                }
                console.log(`🔄 Reintentando validateUserMembership (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            // Re-lanzar errores de negocio tal como están
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo validar la membresía después de múltiples intentos.');
}
/**
 * Incrementar contador atómico de votos con manejo mejorado de concurrencia
 */
async function incrementVoteCount(roomId, movieId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            // Intentar actualizar voto existente con operación atómica
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
            const voteCount = response.Attributes?.votes || 1;
            console.log(`✅ Voto incrementado: Sala ${roomId}, Película ${movieId}, Total: ${voteCount}`);
            return voteCount;
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en VOTES_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Si el item no existe, intentar crearlo
            if (error.name === 'ResourceNotFoundException' || !error.name) {
                try {
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
                    console.log(`✅ Nuevo voto creado: Sala ${roomId}, Película ${movieId}, Total: 1`);
                    return 1;
                }
                catch (putError) {
                    if (putError.name === 'ValidationException' && putError.message.includes('key element does not match')) {
                        console.error('❌ Error de estructura de clave en VOTES_TABLE (PUT):', putError.message);
                        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                    }
                    // Si falla la condición, significa que otro proceso creó el item
                    // Reintentar la operación UPDATE
                    if (putError.name === 'ConditionalCheckFailedException') {
                        attempt++;
                        if (attempt >= maxRetries) {
                            console.error('❌ Máximo de reintentos alcanzado para incrementar voto');
                            throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
                        }
                        console.log(`🔄 Reintentando incremento de voto (intento ${attempt + 1}/${maxRetries})`);
                        continue;
                    }
                    throw putError;
                }
            }
            // Para otros errores, reintentamos si no hemos alcanzado el máximo
            attempt++;
            if (attempt >= maxRetries) {
                console.error('❌ Error incrementando voto después de múltiples intentos:', error);
                throw error;
            }
            console.log(`🔄 Reintentando incremento de voto debido a error (intento ${attempt + 1}/${maxRetries}):`, error.name);
            // Pequeña pausa antes del reintento para evitar condiciones de carrera
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
    }
    throw new Error('Error interno del sistema. No se pudo procesar el voto después de múltiples intentos.');
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
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            console.log('🔍 DEBUG: updateRoomWithMatch usando clave:', { PK: roomId, SK: 'ROOM' });
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
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
            return; // Success
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOMS_TABLE (UPDATE):', error.message);
                throw new Error('Error interno del sistema al actualizar la sala.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para updateRoomWithMatch');
                    throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
                }
                console.log(`🔄 Reintentando updateRoomWithMatch (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            console.error('❌ Error actualizando sala con match:', error);
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
}
/**
 * Prevenir votos duplicados del mismo usuario para la misma película con manejo de concurrencia
 */
async function preventDuplicateVote(userId, roomId, movieId) {
    const roomMovieId = `${roomId}_${movieId}`;
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            // Verificar si el usuario ya votó por esta película en esta sala
            const existingVote = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.USER_VOTES_TABLE,
                Key: { userId, roomMovieId },
            }));
            if (existingVote.Item) {
                throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
            }
            // Registrar el voto para prevenir duplicados con condición atómica
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
            return; // Éxito, salir de la función
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en USER_VOTES_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Si falla la condición, significa que el usuario ya votó (condición de carrera)
            if (error.name === 'ConditionalCheckFailedException') {
                // Verificar nuevamente si realmente ya votó
                const doubleCheck = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.USER_VOTES_TABLE,
                    Key: { userId, roomMovieId },
                }));
                if (doubleCheck.Item) {
                    throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
                }
                // Si no existe el item pero falló la condición, reintentamos
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para prevenir voto duplicado');
                    throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
                }
                console.log(`🔄 Reintentando registro de voto (intento ${attempt + 1}/${maxRetries})`);
                // Pequeña pausa antes del reintento
                await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                continue;
            }
            // Para otros errores, reintentamos si no hemos alcanzado el máximo
            if (attempt < maxRetries - 1) {
                attempt++;
                console.log(`🔄 Reintentando prevención de voto duplicado (intento ${attempt + 1}/${maxRetries}):`, error.name);
                await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo registrar el voto después de múltiples intentos.');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCxrRUFBMkc7QUFDM0csOENBQWlGO0FBRWpGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFpQjVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7SUFDeEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxRQUFlLENBQUMsQ0FBQyxzQkFBc0I7SUFFckUsSUFBSTtRQUNGLFFBQVEsU0FBUyxFQUFFO1lBQ2pCLEtBQUssTUFBTTtnQkFDVCx1REFBdUQ7Z0JBQ3ZELE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQ2pELE9BQU8sTUFBTSxXQUFXLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFOUQ7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsU0FBUyxFQUFFLENBQUMsQ0FBQztTQUMzRDtLQUNGO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLGNB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QUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsT0FBTyxFQUFFLENBQUM7S0FDWDtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQsIFVwZGF0ZUNvbW1hbmQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQsIHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQsIGdldE1vdmllVGl0bGUgfSBmcm9tICcuLi91dGlscy9hcHBzeW5jLXB1Ymxpc2hlcic7XHJcbmltcG9ydCB7IGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgUm9vbSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVm90ZSB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIHZvdGVzOiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWb3RlSGFuZGxlcjogTMOzZ2ljYSBTdG9wLW9uLU1hdGNoXHJcbiAqIEltcGxlbWVudGEgZWwgYWxnb3JpdG1vIGRlIHZvdGFjacOzbiBxdWUgdGVybWluYSBjdWFuZG8gdG9kb3MgbG9zIG1pZW1icm9zIHZvdGFuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+Xs++4jyBWb3RlIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICAvLyBFeHRyYWVyIHBhcsOhbWV0cm9zIGRlbCBpbnB1dCBzZWfDum4gZWwgc2NoZW1hIEdyYXBoUUxcclxuICAgICAgICBjb25zdCB7IHJvb21JZCwgbW92aWVJZCwgdm90ZVR5cGUgfSA9IGFyZ3MuaW5wdXQ7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHByb2Nlc3NWb3RlKHVzZXJJZCwgcm9vbUlkLCBtb3ZpZUlkLCB2b3RlVHlwZSk7XHJcbiAgICAgIFxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmFjacOzbiBubyBzb3BvcnRhZGE6ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZW4gJHtmaWVsZE5hbWV9OmAsIGVycm9yKTtcclxuICAgIFxyXG4gICAgLy8gTWVqb3JhciBtZW5zYWplcyBkZSBlcnJvciBwYXJhIGVsIHVzdWFyaW9cclxuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgIC8vIFNpIGVzIHVuIGVycm9yIGRlIHNpc3RlbWEgaW50ZXJubywgbm8gZXhwb25lciBkZXRhbGxlcyB0w6ljbmljb3NcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEnKSkge1xyXG4gICAgICAgIHRocm93IGVycm9yOyAvLyBZYSB0aWVuZSB1biBtZW5zYWplIGFtaWdhYmxlXHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcHJvcG9yY2lvbmFyIGNvbnRleHRvIGFkaWNpb25hbFxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnU2FsYSBubyBlbmNvbnRyYWRhJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xhIHNhbGEgZXNwZWNpZmljYWRhIG5vIGV4aXN0ZSBvIG5vIHRpZW5lcyBhY2Nlc28gYSBlbGxhLicpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVXN1YXJpbyBubyBlcyBtaWVtYnJvIGFjdGl2bycpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBlcmVzIG1pZW1icm8gZGUgZXN0YSBzYWxhIG8gdHUgbWVtYnJlc8OtYSBubyBlc3TDoSBhY3RpdmEuJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd5YSB2b3TDsyBwb3IgbGEgcGVsw61jdWxhJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lhIGhhcyB2b3RhZG8gcG9yIGVzdGEgcGVsw61jdWxhIGVuIGVzdGEgc2FsYS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ25vIGVzdMOhIGRpc3BvbmlibGUgcGFyYSB2b3RhcicpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFc3RhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyIGVuIGVzdGUgbW9tZW50by4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyBjb25lY3RpdmlkYWRcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ05ldHdvcmsnKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Byb2JsZW1hIGRlIGNvbmV4acOzbi4gUG9yIGZhdm9yLCB2ZXJpZmljYSB0dSBjb25leGnDs24gYSBpbnRlcm5ldCBlIGludMOpbnRhbG8gZGUgbnVldm8uJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgYXV0b3JpemFjacOzblxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVW5hdXRob3JpemVkJykgfHwgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRm9yYmlkZGVuJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1R1IHNlc2nDs24gaGEgZXhwaXJhZG8uIFBvciBmYXZvciwgaW5pY2lhIHNlc2nDs24gZGUgbnVldm8uJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgdmFsaWRhY2nDs24gZGUgZGF0b3NcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1ZhbGlkYXRpb25FeGNlcHRpb24nKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdJbnZhbGlkJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvcyBkYXRvcyBlbnZpYWRvcyBubyBzb24gdsOhbGlkb3MuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2by4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRXJyb3IgZ2Vuw6lyaWNvIHBhcmEgY2Fzb3Mgbm8gbWFuZWphZG9zIGVzcGVjw61maWNhbWVudGVcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPY3VycmnDsyB1biBlcnJvciBpbmVzcGVyYWRvLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb2Nlc2FyIHZvdG8gY29uIGFsZ29yaXRtbyBTdG9wLW9uLU1hdGNoXHJcbiAqIFNvbG8gcHJvY2VzYSB2b3RvcyBMSUtFIC0gbG9zIERJU0xJS0Ugc2UgaWdub3JhbiBzZWfDum4gZWwgYWxnb3JpdG1vXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVm90ZSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZywgdm90ZVR5cGU6IHN0cmluZyk6IFByb21pc2U8Um9vbT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ1Byb2Nlc3NWb3RlJyk7XHJcbiAgY29uc29sZS5sb2coYPCfl7PvuI8gUHJvY2VzYW5kbyB2b3RvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUaXBvOiAke3ZvdGVUeXBlfWApO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gMS4gVmVyaWZpY2FyIHF1ZSBsYSBzYWxhIGV4aXN0ZSB5IGVzdMOhIEFDVElWRVxyXG4gICAgY29uc3Qgcm9vbSA9IGF3YWl0IGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQpO1xyXG4gICAgXHJcbiAgICAvLyAyLiBWZXJpZmljYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZCwgcm9vbUlkKTtcclxuICAgIFxyXG4gICAgLy8gMy4gU29sbyBwcm9jZXNhciB2b3RvcyBMSUtFIC0gaWdub3JhciBESVNMSUtFIHNlZ8O6biBhbGdvcml0bW8gU3RvcC1vbi1NYXRjaFxyXG4gICAgaWYgKHZvdGVUeXBlICE9PSAnTElLRScpIHtcclxuICAgICAgY29uc29sZS5sb2coYOKPre+4jyBJZ25vcmFuZG8gdm90byAke3ZvdGVUeXBlfSBzZWfDum4gYWxnb3JpdG1vIFN0b3Atb24tTWF0Y2hgKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogcm9vbUlkLFxyXG4gICAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIDQuIFByZXZlbmlyIHZvdG9zIGR1cGxpY2Fkb3MgZGVsIG1pc21vIHVzdWFyaW8gcGFyYSBsYSBtaXNtYSBwZWzDrWN1bGFcclxuICAgIGF3YWl0IHByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZCwgcm9vbUlkLCBtb3ZpZUlkKTtcclxuICAgIFxyXG4gICAgLy8gNS4gSW5jcmVtZW50YXIgY29udGFkb3IgYXTDs21pY28gZW4gVm90ZXNUYWJsZVxyXG4gICAgY29uc3QgY3VycmVudFZvdGVzID0gYXdhaXQgaW5jcmVtZW50Vm90ZUNvdW50KHJvb21JZCwgbW92aWVJZCk7XHJcbiAgICBcclxuICAgIC8vIDYuIE9idGVuZXIgdG90YWwgZGUgbWllbWJyb3MgYWN0aXZvcyBlbiBsYSBzYWxhXHJcbiAgICBjb25zdCB0b3RhbE1lbWJlcnMgPSBhd2FpdCBnZXRUb3RhbEFjdGl2ZU1lbWJlcnMocm9vbUlkKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfk4ogVm90b3MgYWN0dWFsZXM6ICR7Y3VycmVudFZvdGVzfSwgTWllbWJyb3MgdG90YWxlczogJHt0b3RhbE1lbWJlcnN9YCk7XHJcbiAgICBcclxuICAgIC8vIDcuIFB1YmxpY2FyIGV2ZW50byBkZSBhY3R1YWxpemFjacOzbiBkZSB2b3RvIGVuIHRpZW1wbyByZWFsXHJcbiAgICBhd2FpdCBwdWJsaXNoVm90ZVVwZGF0ZUV2ZW50KHJvb21JZCwgdXNlcklkLCBtb3ZpZUlkLCAnTElLRScsIGN1cnJlbnRWb3RlcywgdG90YWxNZW1iZXJzKTtcclxuICAgIFxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1ZPVEVfQ0FTVCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIGN1cnJlbnRWb3RlcyxcclxuICAgICAgdG90YWxNZW1iZXJzLFxyXG4gICAgICBwcm9ncmVzczogdG90YWxNZW1iZXJzID4gMCA/IChjdXJyZW50Vm90ZXMgLyB0b3RhbE1lbWJlcnMpICogMTAwIDogMFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIDguIFZlcmlmaWNhciBzaSBzZSBhbGNhbnrDsyBlbCBjb25zZW5zbyAoU3RvcC1vbi1NYXRjaClcclxuICAgIGlmIChjdXJyZW50Vm90ZXMgPj0gdG90YWxNZW1iZXJzKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn46JIMKhTWF0Y2ggZW5jb250cmFkbyEgQWN0dWFsaXphbmRvIHNhbGEgeSBub3RpZmljYW5kby4uLicpO1xyXG4gICAgICBcclxuICAgICAgLy8gQWN0dWFsaXphciBzYWxhIGNvbiByZXN1bHRhZG9cclxuICAgICAgYXdhaXQgdXBkYXRlUm9vbVdpdGhNYXRjaChyb29tSWQsIG1vdmllSWQpO1xyXG4gICAgICBcclxuICAgICAgLy8gT2J0ZW5lciBwYXJ0aWNpcGFudGVzIHBhcmEgbGEgbm90aWZpY2FjacOzblxyXG4gICAgICBjb25zdCBwYXJ0aWNpcGFudHMgPSBhd2FpdCBnZXRSb29tUGFydGljaXBhbnRzKHJvb21JZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBPYnRlbmVyIHTDrXR1bG8gZGUgbGEgcGVsw61jdWxhXHJcbiAgICAgIGNvbnN0IG1vdmllVGl0bGUgPSBhd2FpdCBnZXRNb3ZpZVRpdGxlKG1vdmllSWQpO1xyXG4gICAgICBcclxuICAgICAgLy8gUHVibGljYXIgZXZlbnRvIGRlIG1hdGNoIGVuY29udHJhZG8gZW4gdGllbXBvIHJlYWxcclxuICAgICAgYXdhaXQgcHVibGlzaE1hdGNoRm91bmRFdmVudChyb29tSWQsIG1vdmllSWQsIG1vdmllVGl0bGUsIHBhcnRpY2lwYW50cyk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIGZvciBtYXRjaFxyXG4gICAgICBsb2dCdXNpbmVzc01ldHJpYygnTUFUQ0hfRk9VTkQnLCByb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgbW92aWVUaXRsZSxcclxuICAgICAgICBwYXJ0aWNpcGFudENvdW50OiBwYXJ0aWNpcGFudHMubGVuZ3RoLFxyXG4gICAgICAgIHZvdGVzUmVxdWlyZWQ6IHRvdGFsTWVtYmVyc1xyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgXHJcbiAgICAgICAgcmVzdWx0OiAnbWF0Y2hfZm91bmQnLFxyXG4gICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgcGFydGljaXBhbnRDb3VudDogcGFydGljaXBhbnRzLmxlbmd0aCBcclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgICAgc3RhdHVzOiAnTUFUQ0hFRCcsXHJcbiAgICAgICAgcmVzdWx0TW92aWVJZDogbW92aWVJZCxcclxuICAgICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyA5LiBTaSBubyBoYXkgbWF0Y2gsIHJldG9ybmFyIHNhbGEgYWN0dWFsaXphZGFcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgXHJcbiAgICAgIHJlc3VsdDogJ3ZvdGVfcmVjb3JkZWQnLFxyXG4gICAgICBwcm9ncmVzczogYCR7Y3VycmVudFZvdGVzfS8ke3RvdGFsTWVtYmVyc31gIFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgIH07XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ1Byb2Nlc3NWb3RlJywgZXJyb3IgYXMgRXJyb3IsIHsgdXNlcklkLCByb29tSWQsIG1vdmllSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHkgdmFsaWRhciBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tQW5kVmFsaWRhdGUocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuICBcclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIERFQlVHOiBnZXRSb29tQW5kVmFsaWRhdGUgdXNhbmRvIGNsYXZlOicsIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9KTtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3Qgcm9vbSA9IHJlc3BvbnNlLkl0ZW07XHJcbiAgICAgIFxyXG4gICAgICBpZiAocm9vbS5zdGF0dXMgIT09ICdBQ1RJVkUnICYmIHJvb20uc3RhdHVzICE9PSAnV0FJVElORycpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyLiBFc3RhZG8gYWN0dWFsOiAke3Jvb20uc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcm9vbTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgLy8gRGlzdGluZ3VpciBlbnRyZSBlcnJvcmVzIGRlIGNsYXZlIHkgZXJyb3JlcyBkZSBuZWdvY2lvXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgZ2V0Um9vbUFuZFZhbGlkYXRlJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGdldFJvb21BbmRWYWxpZGF0ZSAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFJlLWxhbnphciBlcnJvcmVzIGRlIG5lZ29jaW8gdGFsIGNvbW8gZXN0w6FuXHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuICBcclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gdmFsaWRhciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWYWxpZGFyIHF1ZSBlbCB1c3VhcmlvIGVzIG1pZW1icm8gZGUgbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVVc2VyTWVtYmVyc2hpcCh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICBsZXQgYXR0ZW1wdCA9IDA7XHJcbiAgXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSB8fCAhcmVzcG9uc2UuSXRlbS5pc0FjdGl2ZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVXN1YXJpbyBubyBlcyBtaWVtYnJvIGFjdGl2byBkZSBsYSBzYWxhJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybjsgLy8gU3VjY2Vzc1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBEaXN0aW5ndWlyIGVudHJlIGVycm9yZXMgZGUgY2xhdmUgeSBlcnJvcmVzIGRlIG5lZ29jaW9cclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTV9NRU1CRVJTX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgdmFsaWRhdGVVc2VyTWVtYmVyc2hpcCcpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBTZXJ2aWNpbyB0ZW1wb3JhbG1lbnRlIG5vIGRpc3BvbmlibGUuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCAqIE1hdGgucG93KDIsIGF0dGVtcHQpKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gUmUtbGFuemFyIGVycm9yZXMgZGUgbmVnb2NpbyB0YWwgY29tbyBlc3TDoW5cclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyB2YWxpZGFyIGxhIG1lbWJyZXPDrWEgZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEluY3JlbWVudGFyIGNvbnRhZG9yIGF0w7NtaWNvIGRlIHZvdG9zIGNvbiBtYW5lam8gbWVqb3JhZG8gZGUgY29uY3VycmVuY2lhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBpbmNyZW1lbnRWb3RlQ291bnQocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgbGV0IGF0dGVtcHQgPSAwO1xyXG4gIFxyXG4gIHdoaWxlIChhdHRlbXB0IDwgbWF4UmV0cmllcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gSW50ZW50YXIgYWN0dWFsaXphciB2b3RvIGV4aXN0ZW50ZSBjb24gb3BlcmFjacOzbiBhdMOzbWljYVxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgcm9vbUlkLCBtb3ZpZUlkIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ0FERCB2b3RlcyA6aW5jcmVtZW50IFNFVCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmluY3JlbWVudCc6IDEsXHJcbiAgICAgICAgICAnOnVwZGF0ZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zdCB2b3RlQ291bnQgPSByZXNwb25zZS5BdHRyaWJ1dGVzPy52b3RlcyB8fCAxO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFZvdG8gaW5jcmVtZW50YWRvOiBTYWxhICR7cm9vbUlkfSwgUGVsw61jdWxhICR7bW92aWVJZH0sIFRvdGFsOiAke3ZvdGVDb3VudH1gKTtcclxuICAgICAgcmV0dXJuIHZvdGVDb3VudDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIC8vIE1hbmVqYXIgZXJyb3JlcyBkZSBjbGF2ZVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBWT1RFU19UQUJMRTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLicpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyBTaSBlbCBpdGVtIG5vIGV4aXN0ZSwgaW50ZW50YXIgY3JlYXJsb1xyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1Jlc291cmNlTm90Rm91bmRFeGNlcHRpb24nIHx8ICFlcnJvci5uYW1lKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IG5ld1ZvdGU6IFZvdGUgPSB7XHJcbiAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVJZCxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgICAgICAgSXRlbTogbmV3Vm90ZSxcclxuICAgICAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKHJvb21JZCkgQU5EIGF0dHJpYnV0ZV9ub3RfZXhpc3RzKG1vdmllSWQpJyxcclxuICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIE51ZXZvIHZvdG8gY3JlYWRvOiBTYWxhICR7cm9vbUlkfSwgUGVsw61jdWxhICR7bW92aWVJZH0sIFRvdGFsOiAxYCk7XHJcbiAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICAgIFxyXG4gICAgICAgIH0gY2F0Y2ggKHB1dEVycm9yOiBhbnkpIHtcclxuICAgICAgICAgIGlmIChwdXRFcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgcHV0RXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBWT1RFU19UQUJMRSAoUFVUKTonLCBwdXRFcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gU2kgZmFsbGEgbGEgY29uZGljacOzbiwgc2lnbmlmaWNhIHF1ZSBvdHJvIHByb2Nlc28gY3Jlw7MgZWwgaXRlbVxyXG4gICAgICAgICAgLy8gUmVpbnRlbnRhciBsYSBvcGVyYWNpw7NuIFVQREFURVxyXG4gICAgICAgICAgaWYgKHB1dEVycm9yLm5hbWUgPT09ICdDb25kaXRpb25hbENoZWNrRmFpbGVkRXhjZXB0aW9uJykge1xyXG4gICAgICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgTcOheGltbyBkZSByZWludGVudG9zIGFsY2FuemFkbyBwYXJhIGluY3JlbWVudGFyIHZvdG8nKTtcclxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIERlbWFzaWFkb3MgaW50ZW50b3MgY29uY3VycmVudGVzLicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBpbmNyZW1lbnRvIGRlIHZvdG8gKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHRocm93IHB1dEVycm9yO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gUGFyYSBvdHJvcyBlcnJvcmVzLCByZWludGVudGFtb3Mgc2kgbm8gaGVtb3MgYWxjYW56YWRvIGVsIG3DoXhpbW9cclxuICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICBpZiAoYXR0ZW1wdCA+PSBtYXhSZXRyaWVzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluY3JlbWVudGFuZG8gdm90byBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zOicsIGVycm9yKTtcclxuICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGluY3JlbWVudG8gZGUgdm90byBkZWJpZG8gYSBlcnJvciAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KTpgLCBlcnJvci5uYW1lKTtcclxuICAgICAgLy8gUGVxdWXDsWEgcGF1c2EgYW50ZXMgZGVsIHJlaW50ZW50byBwYXJhIGV2aXRhciBjb25kaWNpb25lcyBkZSBjYXJyZXJhXHJcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBhdHRlbXB0KSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyBwcm9jZXNhciBlbCB2b3RvIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHRvdGFsIGRlIG1pZW1icm9zIGFjdGl2b3MgZW4gbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VG90YWxBY3RpdmVNZW1iZXJzKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgRmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgU2VsZWN0OiAnQ09VTlQnLFxyXG4gIH0pKTtcclxuXHJcbiAgcmV0dXJuIHJlc3BvbnNlLkNvdW50IHx8IDA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBY3R1YWxpemFyIHNhbGEgY29uIHJlc3VsdGFkbyBkZWwgbWF0Y2hcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuICBcclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIERFQlVHOiB1cGRhdGVSb29tV2l0aE1hdGNoIHVzYW5kbyBjbGF2ZTonLCB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI3N0YXR1cyA9IDpzdGF0dXMsIHJlc3VsdE1vdmllSWQgPSA6bW92aWVJZCwgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLCAvLyAnc3RhdHVzJyBlcyBwYWxhYnJhIHJlc2VydmFkYSBlbiBEeW5hbW9EQlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpzdGF0dXMnOiAnTUFUQ0hFRCcsXHJcbiAgICAgICAgICAnOm1vdmllSWQnOiBtb3ZpZUlkLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBTYWxhICR7cm9vbUlkfSBhY3R1YWxpemFkYSBjb24gbWF0Y2g6IHBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybjsgLy8gU3VjY2Vzc1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBNYW5lamFyIGVycm9yZXMgZGUgY2xhdmVcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTVNfVEFCTEUgKFVQREFURSk6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hIGFsIGFjdHVhbGl6YXIgbGEgc2FsYS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyB0ZW1wb3JhbGVzIC0gcmVpbnRlbnRhclxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSB1cGRhdGVSb29tV2l0aE1hdGNoJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gYWN0dWFsaXphciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyB1cGRhdGVSb29tV2l0aE1hdGNoIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCAqIE1hdGgucG93KDIsIGF0dGVtcHQpKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGFjdHVhbGl6YW5kbyBzYWxhIGNvbiBtYXRjaDonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuICBcclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gYWN0dWFsaXphciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQcmV2ZW5pciB2b3RvcyBkdXBsaWNhZG9zIGRlbCBtaXNtbyB1c3VhcmlvIHBhcmEgbGEgbWlzbWEgcGVsw61jdWxhIGNvbiBtYW5lam8gZGUgY29uY3VycmVuY2lhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcmV2ZW50RHVwbGljYXRlVm90ZSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IHJvb21Nb3ZpZUlkID0gYCR7cm9vbUlkfV8ke21vdmllSWR9YDtcclxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICBsZXQgYXR0ZW1wdCA9IDA7XHJcbiAgXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBWZXJpZmljYXIgc2kgZWwgdXN1YXJpbyB5YSB2b3TDsyBwb3IgZXN0YSBwZWzDrWN1bGEgZW4gZXN0YSBzYWxhXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nVm90ZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlVTRVJfVk9URVNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyB1c2VySWQsIHJvb21Nb3ZpZUlkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmIChleGlzdGluZ1ZvdGUuSXRlbSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlZ2lzdHJhciBlbCB2b3RvIHBhcmEgcHJldmVuaXIgZHVwbGljYWRvcyBjb24gY29uZGljacOzbiBhdMOzbWljYVxyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1ZPVEVTX1RBQkxFISxcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgICByb29tTW92aWVJZCxcclxuICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICB2b3RlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB2b3RlVHlwZTogJ0xJS0UnIC8vIFRyaW5pdHkgc29sbyB0aWVuZSB2b3RvcyBwb3NpdGl2b3NcclxuICAgICAgICB9LFxyXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyh1c2VySWQpIEFORCBhdHRyaWJ1dGVfbm90X2V4aXN0cyhyb29tTW92aWVJZCknXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVm90byByZWdpc3RyYWRvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybjsgLy8gw4l4aXRvLCBzYWxpciBkZSBsYSBmdW5jacOzblxyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgLy8gTWFuZWphciBlcnJvcmVzIGRlIGNsYXZlXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFVTRVJfVk9URVNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gU2kgZmFsbGEgbGEgY29uZGljacOzbiwgc2lnbmlmaWNhIHF1ZSBlbCB1c3VhcmlvIHlhIHZvdMOzIChjb25kaWNpw7NuIGRlIGNhcnJlcmEpXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnQ29uZGl0aW9uYWxDaGVja0ZhaWxlZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICAvLyBWZXJpZmljYXIgbnVldmFtZW50ZSBzaSByZWFsbWVudGUgeWEgdm90w7NcclxuICAgICAgICBjb25zdCBkb3VibGVDaGVjayA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUl9WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgICBLZXk6IHsgdXNlcklkLCByb29tTW92aWVJZCB9LFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZG91YmxlQ2hlY2suSXRlbSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVc3VhcmlvICR7dXNlcklkfSB5YSB2b3TDsyBwb3IgbGEgcGVsw61jdWxhICR7bW92aWVJZH0gZW4gbGEgc2FsYSAke3Jvb21JZH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2kgbm8gZXhpc3RlIGVsIGl0ZW0gcGVybyBmYWxsw7MgbGEgY29uZGljacOzbiwgcmVpbnRlbnRhbW9zXHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgcHJldmVuaXIgdm90byBkdXBsaWNhZG8nKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gRGVtYXNpYWRvcyBpbnRlbnRvcyBjb25jdXJyZW50ZXMuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyByZWdpc3RybyBkZSB2b3RvIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgLy8gUGVxdWXDsWEgcGF1c2EgYW50ZXMgZGVsIHJlaW50ZW50b1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCAqIGF0dGVtcHQpKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gUGFyYSBvdHJvcyBlcnJvcmVzLCByZWludGVudGFtb3Mgc2kgbm8gaGVtb3MgYWxjYW56YWRvIGVsIG3DoXhpbW9cclxuICAgICAgaWYgKGF0dGVtcHQgPCBtYXhSZXRyaWVzIC0gMSkge1xyXG4gICAgICAgIGF0dGVtcHQrKztcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gcHJldmVuY2nDs24gZGUgdm90byBkdXBsaWNhZG8gKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSk6YCwgZXJyb3IubmFtZSk7XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwICogYXR0ZW1wdCkpO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBObyBzZSBwdWRvIHJlZ2lzdHJhciBlbCB2b3RvIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGxpc3RhIGRlIHBhcnRpY2lwYW50ZXMgZGUgbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Um9vbVBhcnRpY2lwYW50cyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICAgIEZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgJzpyb29tSWQnOiByb29tSWQsXHJcbiAgICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBQcm9qZWN0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCcsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3BvbnNlLkl0ZW1zPy5tYXAoaXRlbSA9PiBpdGVtLnVzZXJJZCkgfHwgW107XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIG9idGVuaWVuZG8gcGFydGljaXBhbnRlczonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG59Il19