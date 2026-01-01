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
        }
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
    try {
        console.log('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' }, // Usar PK y SK en lugar de roomId
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
        // Re-lanzar errores de negocio tal como están
        throw error;
    }
}
/**
 * Validar que el usuario es miembro de la sala
 */
async function validateUserMembership(userId, roomId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (!response.Item || !response.Item.isActive) {
            throw new Error('Usuario no es miembro activo de la sala');
        }
    }
    catch (error) {
        // Distinguir entre errores de clave y errores de negocio
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
            console.error('❌ Error de estructura de clave en ROOM_MEMBERS_TABLE:', error.message);
            throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
        }
        // Re-lanzar errores de negocio tal como están
        throw error;
    }
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
    }
    catch (error) {
        // Manejar errores de clave
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
            console.error('❌ Error de estructura de clave en ROOMS_TABLE (UPDATE):', error.message);
            throw new Error('Error interno del sistema al actualizar la sala.');
        }
        console.error('❌ Error actualizando sala con match:', error);
        throw error;
    }
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
