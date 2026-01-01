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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCxrRUFBMkc7QUFDM0csOENBQWlGO0FBRWpGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFpQjVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7SUFDeEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxRQUFlLENBQUMsQ0FBQyxzQkFBc0I7SUFFckUsSUFBSTtRQUNGLFFBQVEsU0FBUyxFQUFFO1lBQ2pCLEtBQUssTUFBTTtnQkFDVCxPQUFPLE1BQU0sV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUU5RDtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLDJCQUEyQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQzNEO0tBQ0Y7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxTQUFTLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRCw0Q0FBNEM7UUFDNUMsSUFBSSxLQUFLLFlBQVksS0FBSyxFQUFF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SGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQsIFVwZGF0ZUNvbW1hbmQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQsIHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQsIGdldE1vdmllVGl0bGUgfSBmcm9tICcuLi91dGlscy9hcHBzeW5jLXB1Ymxpc2hlcic7XHJcbmltcG9ydCB7IGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgUm9vbSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVm90ZSB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIHZvdGVzOiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWb3RlSGFuZGxlcjogTMOzZ2ljYSBTdG9wLW9uLU1hdGNoXHJcbiAqIEltcGxlbWVudGEgZWwgYWxnb3JpdG1vIGRlIHZvdGFjacOzbiBxdWUgdGVybWluYSBjdWFuZG8gdG9kb3MgbG9zIG1pZW1icm9zIHZvdGFuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+Xs++4jyBWb3RlIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1ZvdGUodXNlcklkLCBhcmdzLnJvb21JZCwgYXJncy5tb3ZpZUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBNZWpvcmFyIG1lbnNhamVzIGRlIGVycm9yIHBhcmEgZWwgdXN1YXJpb1xyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgLy8gU2kgZXMgdW4gZXJyb3IgZGUgc2lzdGVtYSBpbnRlcm5vLCBubyBleHBvbmVyIGRldGFsbGVzIHTDqWNuaWNvc1xyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYScpKSB7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFlhIHRpZW5lIHVuIG1lbnNhamUgYW1pZ2FibGVcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gUGFyYSBvdHJvcyBlcnJvcmVzLCBwcm9wb3JjaW9uYXIgY29udGV4dG8gYWRpY2lvbmFsXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdTYWxhIG5vIGVuY29udHJhZGEnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTGEgc2FsYSBlc3BlY2lmaWNhZGEgbm8gZXhpc3RlIG8gbm8gdGllbmVzIGFjY2VzbyBhIGVsbGEuJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdVc3VhcmlvIG5vIGVzIG1pZW1icm8gYWN0aXZvJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGVyZXMgbWllbWJybyBkZSBlc3RhIHNhbGEgbyB0dSBtZW1icmVzw61hIG5vIGVzdMOhIGFjdGl2YS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ3lhIHZvdMOzIHBvciBsYSBwZWzDrWN1bGEnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignWWEgaGFzIHZvdGFkbyBwb3IgZXN0YSBwZWzDrWN1bGEgZW4gZXN0YSBzYWxhLicpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VzdGEgc2FsYSBubyBlc3TDoSBkaXNwb25pYmxlIHBhcmEgdm90YXIgZW4gZXN0ZSBtb21lbnRvLicpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9jZXNhciB2b3RvIGNvbiBhbGdvcml0bW8gU3RvcC1vbi1NYXRjaFxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZvdGUodXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdQcm9jZXNzVm90ZScpO1xyXG4gIGNvbnNvbGUubG9nKGDwn5ez77iPIFByb2Nlc2FuZG8gdm90bzogVXN1YXJpbyAke3VzZXJJZH0sIFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gMS4gVmVyaWZpY2FyIHF1ZSBsYSBzYWxhIGV4aXN0ZSB5IGVzdMOhIEFDVElWRVxyXG4gICAgY29uc3Qgcm9vbSA9IGF3YWl0IGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQpO1xyXG4gICAgXHJcbiAgICAvLyAyLiBWZXJpZmljYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZCwgcm9vbUlkKTtcclxuICAgIFxyXG4gICAgLy8gMy4gUHJldmVuaXIgdm90b3MgZHVwbGljYWRvcyBkZWwgbWlzbW8gdXN1YXJpbyBwYXJhIGxhIG1pc21hIHBlbMOtY3VsYVxyXG4gICAgYXdhaXQgcHJldmVudER1cGxpY2F0ZVZvdGUodXNlcklkLCByb29tSWQsIG1vdmllSWQpO1xyXG4gICAgXHJcbiAgICAvLyA0LiBJbmNyZW1lbnRhciBjb250YWRvciBhdMOzbWljbyBlbiBWb3Rlc1RhYmxlXHJcbiAgICBjb25zdCBjdXJyZW50Vm90ZXMgPSBhd2FpdCBpbmNyZW1lbnRWb3RlQ291bnQocm9vbUlkLCBtb3ZpZUlkKTtcclxuICAgIFxyXG4gICAgLy8gNS4gT2J0ZW5lciB0b3RhbCBkZSBtaWVtYnJvcyBhY3Rpdm9zIGVuIGxhIHNhbGFcclxuICAgIGNvbnN0IHRvdGFsTWVtYmVycyA9IGF3YWl0IGdldFRvdGFsQWN0aXZlTWVtYmVycyhyb29tSWQpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBWb3RvcyBhY3R1YWxlczogJHtjdXJyZW50Vm90ZXN9LCBNaWVtYnJvcyB0b3RhbGVzOiAke3RvdGFsTWVtYmVyc31gKTtcclxuICAgIFxyXG4gICAgLy8gNi4gUHVibGljYXIgZXZlbnRvIGRlIGFjdHVhbGl6YWNpw7NuIGRlIHZvdG8gZW4gdGllbXBvIHJlYWxcclxuICAgIGF3YWl0IHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQocm9vbUlkLCB1c2VySWQsIG1vdmllSWQsICdMSUtFJywgY3VycmVudFZvdGVzLCB0b3RhbE1lbWJlcnMpO1xyXG4gICAgXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnVk9URV9DQVNUJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgbW92aWVJZCxcclxuICAgICAgY3VycmVudFZvdGVzLFxyXG4gICAgICB0b3RhbE1lbWJlcnMsXHJcbiAgICAgIHByb2dyZXNzOiB0b3RhbE1lbWJlcnMgPiAwID8gKGN1cnJlbnRWb3RlcyAvIHRvdGFsTWVtYmVycykgKiAxMDAgOiAwXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gNy4gVmVyaWZpY2FyIHNpIHNlIGFsY2FuesOzIGVsIGNvbnNlbnNvIChTdG9wLW9uLU1hdGNoKVxyXG4gICAgaWYgKGN1cnJlbnRWb3RlcyA+PSB0b3RhbE1lbWJlcnMpIHtcclxuICAgICAgY29uc29sZS5sb2coJ/CfjokgwqFNYXRjaCBlbmNvbnRyYWRvISBBY3R1YWxpemFuZG8gc2FsYSB5IG5vdGlmaWNhbmRvLi4uJyk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBBY3R1YWxpemFyIHNhbGEgY29uIHJlc3VsdGFkb1xyXG4gICAgICBhd2FpdCB1cGRhdGVSb29tV2l0aE1hdGNoKHJvb21JZCwgbW92aWVJZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBPYnRlbmVyIHBhcnRpY2lwYW50ZXMgcGFyYSBsYSBub3RpZmljYWNpw7NuXHJcbiAgICAgIGNvbnN0IHBhcnRpY2lwYW50cyA9IGF3YWl0IGdldFJvb21QYXJ0aWNpcGFudHMocm9vbUlkKTtcclxuICAgICAgXHJcbiAgICAgIC8vIE9idGVuZXIgdMOtdHVsbyBkZSBsYSBwZWzDrWN1bGFcclxuICAgICAgY29uc3QgbW92aWVUaXRsZSA9IGF3YWl0IGdldE1vdmllVGl0bGUobW92aWVJZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBQdWJsaWNhciBldmVudG8gZGUgbWF0Y2ggZW5jb250cmFkbyBlbiB0aWVtcG8gcmVhbFxyXG4gICAgICBhd2FpdCBwdWJsaXNoTWF0Y2hGb3VuZEV2ZW50KHJvb21JZCwgbW92aWVJZCwgbW92aWVUaXRsZSwgcGFydGljaXBhbnRzKTtcclxuICAgICAgXHJcbiAgICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWMgZm9yIG1hdGNoXHJcbiAgICAgIGxvZ0J1c2luZXNzTWV0cmljKCdNQVRDSF9GT1VORCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgICAgbW92aWVJZCxcclxuICAgICAgICBtb3ZpZVRpdGxlLFxyXG4gICAgICAgIHBhcnRpY2lwYW50Q291bnQ6IHBhcnRpY2lwYW50cy5sZW5ndGgsXHJcbiAgICAgICAgdm90ZXNSZXF1aXJlZDogdG90YWxNZW1iZXJzXHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBcclxuICAgICAgICByZXN1bHQ6ICdtYXRjaF9mb3VuZCcsXHJcbiAgICAgICAgbW92aWVJZCxcclxuICAgICAgICBwYXJ0aWNpcGFudENvdW50OiBwYXJ0aWNpcGFudHMubGVuZ3RoIFxyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgICBzdGF0dXM6ICdNQVRDSEVEJyxcclxuICAgICAgICByZXN1bHRNb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIDguIFNpIG5vIGhheSBtYXRjaCwgcmV0b3JuYXIgc2FsYSBhY3R1YWxpemFkYVxyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBcclxuICAgICAgcmVzdWx0OiAndm90ZV9yZWNvcmRlZCcsXHJcbiAgICAgIHByb2dyZXNzOiBgJHtjdXJyZW50Vm90ZXN9LyR7dG90YWxNZW1iZXJzfWAgXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignUHJvY2Vzc1ZvdGUnLCBlcnJvciBhcyBFcnJvciwgeyB1c2VySWQsIHJvb21JZCwgbW92aWVJZCB9KTtcclxuICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgeSB2YWxpZGFyIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5SNIERFQlVHOiBnZXRSb29tQW5kVmFsaWRhdGUgdXNhbmRvIGNsYXZlOicsIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9KTtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSwgLy8gVXNhciBQSyB5IFNLIGVuIGx1Z2FyIGRlIHJvb21JZFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJvb20gPSByZXNwb25zZS5JdGVtO1xyXG4gICAgXHJcbiAgICBpZiAocm9vbS5zdGF0dXMgIT09ICdBQ1RJVkUnICYmIHJvb20uc3RhdHVzICE9PSAnV0FJVElORycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBMYSBzYWxhIG5vIGVzdMOhIGRpc3BvbmlibGUgcGFyYSB2b3Rhci4gRXN0YWRvIGFjdHVhbDogJHtyb29tLnN0YXR1c31gKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcm9vbTtcclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAvLyBEaXN0aW5ndWlyIGVudHJlIGVycm9yZXMgZGUgY2xhdmUgeSBlcnJvcmVzIGRlIG5lZ29jaW9cclxuICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NU19UQUJMRTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gUmUtbGFuemFyIGVycm9yZXMgZGUgbmVnb2NpbyB0YWwgY29tbyBlc3TDoW5cclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkLCB1c2VySWQgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBpZiAoIXJlc3BvbnNlLkl0ZW0gfHwgIXJlc3BvbnNlLkl0ZW0uaXNBY3RpdmUpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVc3VhcmlvIG5vIGVzIG1pZW1icm8gYWN0aXZvIGRlIGxhIHNhbGEnKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAvLyBEaXN0aW5ndWlyIGVudHJlIGVycm9yZXMgZGUgY2xhdmUgeSBlcnJvcmVzIGRlIG5lZ29jaW9cclxuICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NX01FTUJFUlNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFJlLWxhbnphciBlcnJvcmVzIGRlIG5lZ29jaW8gdGFsIGNvbW8gZXN0w6FuXHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbmNyZW1lbnRhciBjb250YWRvciBhdMOzbWljbyBkZSB2b3RvcyBjb24gbWFuZWpvIG1lam9yYWRvIGRlIGNvbmN1cnJlbmNpYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50Vm90ZUNvdW50KHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuICBcclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEludGVudGFyIGFjdHVhbGl6YXIgdm90byBleGlzdGVudGUgY29uIG9wZXJhY2nDs24gYXTDs21pY2FcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgbW92aWVJZCB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdBREQgdm90ZXMgOmluY3JlbWVudCBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzppbmNyZW1lbnQnOiAxLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc3Qgdm90ZUNvdW50ID0gcmVzcG9uc2UuQXR0cmlidXRlcz8udm90ZXMgfHwgMTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBWb3RvIGluY3JlbWVudGFkbzogU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUb3RhbDogJHt2b3RlQ291bnR9YCk7XHJcbiAgICAgIHJldHVybiB2b3RlQ291bnQ7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBNYW5lamFyIGVycm9yZXMgZGUgY2xhdmVcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gVk9URVNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gU2kgZWwgaXRlbSBubyBleGlzdGUsIGludGVudGFyIGNyZWFybG9cclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdSZXNvdXJjZU5vdEZvdW5kRXhjZXB0aW9uJyB8fCAhZXJyb3IubmFtZSkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBuZXdWb3RlOiBWb3RlID0ge1xyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICAgIHZvdGVzOiAxLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgICAgIEl0ZW06IG5ld1ZvdGUsXHJcbiAgICAgICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhyb29tSWQpIEFORCBhdHRyaWJ1dGVfbm90X2V4aXN0cyhtb3ZpZUlkKScsXHJcbiAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBOdWV2byB2b3RvIGNyZWFkbzogU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUb3RhbDogMWApO1xyXG4gICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgICBcclxuICAgICAgICB9IGNhdGNoIChwdXRFcnJvcjogYW55KSB7XHJcbiAgICAgICAgICBpZiAocHV0RXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIHB1dEVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gVk9URVNfVEFCTEUgKFBVVCk6JywgcHV0RXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFNpIGZhbGxhIGxhIGNvbmRpY2nDs24sIHNpZ25pZmljYSBxdWUgb3RybyBwcm9jZXNvIGNyZcOzIGVsIGl0ZW1cclxuICAgICAgICAgIC8vIFJlaW50ZW50YXIgbGEgb3BlcmFjacOzbiBVUERBVEVcclxuICAgICAgICAgIGlmIChwdXRFcnJvci5uYW1lID09PSAnQ29uZGl0aW9uYWxDaGVja0ZhaWxlZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgICAgICBpZiAoYXR0ZW1wdCA+PSBtYXhSZXRyaWVzKSB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBpbmNyZW1lbnRhciB2b3RvJyk7XHJcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBEZW1hc2lhZG9zIGludGVudG9zIGNvbmN1cnJlbnRlcy4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gaW5jcmVtZW50byBkZSB2b3RvIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICB0aHJvdyBwdXRFcnJvcjtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcmVpbnRlbnRhbW9zIHNpIG5vIGhlbW9zIGFsY2FuemFkbyBlbCBtw6F4aW1vXHJcbiAgICAgIGF0dGVtcHQrKztcclxuICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbmNyZW1lbnRhbmRvIHZvdG8gZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvczonLCBlcnJvcik7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBpbmNyZW1lbnRvIGRlIHZvdG8gZGViaWRvIGEgZXJyb3IgKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSk6YCwgZXJyb3IubmFtZSk7XHJcbiAgICAgIC8vIFBlcXVlw7FhIHBhdXNhIGFudGVzIGRlbCByZWludGVudG8gcGFyYSBldml0YXIgY29uZGljaW9uZXMgZGUgY2FycmVyYVxyXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogYXR0ZW1wdCkpO1xyXG4gICAgfVxyXG4gIH1cclxuICBcclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gcHJvY2VzYXIgZWwgdm90byBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB0b3RhbCBkZSBtaWVtYnJvcyBhY3Rpdm9zIGVuIGxhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFRvdGFsQWN0aXZlTWVtYmVycyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tSWQgPSA6cm9vbUlkJyxcclxuICAgIEZpbHRlckV4cHJlc3Npb246ICdpc0FjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgfSxcclxuICAgIFNlbGVjdDogJ0NPVU5UJyxcclxuICB9KSk7XHJcblxyXG4gIHJldHVybiByZXNwb25zZS5Db3VudCB8fCAwO1xyXG59XHJcblxyXG4vKipcclxuICogQWN0dWFsaXphciBzYWxhIGNvbiByZXN1bHRhZG8gZGVsIG1hdGNoXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVSb29tV2l0aE1hdGNoKHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc29sZS5sb2coJ/CflI0gREVCVUc6IHVwZGF0ZVJvb21XaXRoTWF0Y2ggdXNhbmRvIGNsYXZlOicsIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9KTtcclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0sIC8vIFVzYXIgUEsgeSBTSyBlbiBsdWdhciBkZSByb29tSWRcclxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCAjc3RhdHVzID0gOnN0YXR1cywgcmVzdWx0TW92aWVJZCA9IDptb3ZpZUlkLCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgJyNzdGF0dXMnOiAnc3RhdHVzJywgLy8gJ3N0YXR1cycgZXMgcGFsYWJyYSByZXNlcnZhZGEgZW4gRHluYW1vREJcclxuICAgICAgfSxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICc6c3RhdHVzJzogJ01BVENIRUQnLFxyXG4gICAgICAgICc6bW92aWVJZCc6IG1vdmllSWQsXHJcbiAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBTYWxhICR7cm9vbUlkfSBhY3R1YWxpemFkYSBjb24gbWF0Y2g6IHBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgLy8gTWFuZWphciBlcnJvcmVzIGRlIGNsYXZlXHJcbiAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTVNfVEFCTEUgKFVQREFURSk6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYSBhbCBhY3R1YWxpemFyIGxhIHNhbGEuJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBhY3R1YWxpemFuZG8gc2FsYSBjb24gbWF0Y2g6JywgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHJldmVuaXIgdm90b3MgZHVwbGljYWRvcyBkZWwgbWlzbW8gdXN1YXJpbyBwYXJhIGxhIG1pc21hIHBlbMOtY3VsYSBjb24gbWFuZWpvIGRlIGNvbmN1cnJlbmNpYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJldmVudER1cGxpY2F0ZVZvdGUodXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCByb29tTW92aWVJZCA9IGAke3Jvb21JZH1fJHttb3ZpZUlkfWA7XHJcbiAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgbGV0IGF0dGVtcHQgPSAwO1xyXG4gIFxyXG4gIHdoaWxlIChhdHRlbXB0IDwgbWF4UmV0cmllcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVmVyaWZpY2FyIHNpIGVsIHVzdWFyaW8geWEgdm90w7MgcG9yIGVzdGEgcGVsw61jdWxhIGVuIGVzdGEgc2FsYVxyXG4gICAgICBjb25zdCBleGlzdGluZ1ZvdGUgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1ZPVEVTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgdXNlcklkLCByb29tTW92aWVJZCB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAoZXhpc3RpbmdWb3RlLkl0ZW0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVzdWFyaW8gJHt1c2VySWR9IHlhIHZvdMOzIHBvciBsYSBwZWzDrWN1bGEgJHttb3ZpZUlkfSBlbiBsYSBzYWxhICR7cm9vbUlkfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZWdpc3RyYXIgZWwgdm90byBwYXJhIHByZXZlbmlyIGR1cGxpY2Fkb3MgY29uIGNvbmRpY2nDs24gYXTDs21pY2FcclxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUl9WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgdXNlcklkLFxyXG4gICAgICAgICAgcm9vbU1vdmllSWQsXHJcbiAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICBtb3ZpZUlkLFxyXG4gICAgICAgICAgdm90ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyAvLyBUcmluaXR5IHNvbG8gdGllbmUgdm90b3MgcG9zaXRpdm9zXHJcbiAgICAgICAgfSxcclxuICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKSBBTkQgYXR0cmlidXRlX25vdF9leGlzdHMocm9vbU1vdmllSWQpJ1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFZvdG8gcmVnaXN0cmFkbzogVXN1YXJpbyAke3VzZXJJZH0sIFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG4gICAgICByZXR1cm47IC8vIMOJeGl0bywgc2FsaXIgZGUgbGEgZnVuY2nDs25cclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIC8vIE1hbmVqYXIgZXJyb3JlcyBkZSBjbGF2ZVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBVU0VSX1ZPVEVTX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFNpIGZhbGxhIGxhIGNvbmRpY2nDs24sIHNpZ25pZmljYSBxdWUgZWwgdXN1YXJpbyB5YSB2b3TDsyAoY29uZGljacOzbiBkZSBjYXJyZXJhKVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgLy8gVmVyaWZpY2FyIG51ZXZhbWVudGUgc2kgcmVhbG1lbnRlIHlhIHZvdMOzXHJcbiAgICAgICAgY29uc3QgZG91YmxlQ2hlY2sgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlVTRVJfVk9URVNfVEFCTEUhLFxyXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgcm9vbU1vdmllSWQgfSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRvdWJsZUNoZWNrLkl0ZW0pIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNpIG5vIGV4aXN0ZSBlbCBpdGVtIHBlcm8gZmFsbMOzIGxhIGNvbmRpY2nDs24sIHJlaW50ZW50YW1vc1xyXG4gICAgICAgIGF0dGVtcHQrKztcclxuICAgICAgICBpZiAoYXR0ZW1wdCA+PSBtYXhSZXRyaWVzKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgTcOheGltbyBkZSByZWludGVudG9zIGFsY2FuemFkbyBwYXJhIHByZXZlbmlyIHZvdG8gZHVwbGljYWRvJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIERlbWFzaWFkb3MgaW50ZW50b3MgY29uY3VycmVudGVzLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gcmVnaXN0cm8gZGUgdm90byAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIC8vIFBlcXVlw7FhIHBhdXNhIGFudGVzIGRlbCByZWludGVudG9cclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTAgKiBhdHRlbXB0KSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcmVpbnRlbnRhbW9zIHNpIG5vIGhlbW9zIGFsY2FuemFkbyBlbCBtw6F4aW1vXHJcbiAgICAgIGlmIChhdHRlbXB0IDwgbWF4UmV0cmllcyAtIDEpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIHByZXZlbmNpw7NuIGRlIHZvdG8gZHVwbGljYWRvIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pOmAsIGVycm9yLm5hbWUpO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCAqIGF0dGVtcHQpKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyByZWdpc3RyYXIgZWwgdm90byBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBsaXN0YSBkZSBwYXJ0aWNpcGFudGVzIGRlIGxhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFJvb21QYXJ0aWNpcGFudHMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaXNBY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgUHJvamVjdGlvbkV4cHJlc3Npb246ICd1c2VySWQnLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZS5JdGVtcz8ubWFwKGl0ZW0gPT4gaXRlbS51c2VySWQpIHx8IFtdO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBvYnRlbmllbmRvIHBhcnRpY2lwYW50ZXM6JywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxufSJdfQ==