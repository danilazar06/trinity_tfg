"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * RoomHandler: Gestiona salas
 * Maneja createRoom, joinRoom y getMyHistory
 */
const handler = async (event) => {
    console.log('🏠 Room Handler:', JSON.stringify(event, null, 2));
    const { fieldName } = event.info;
    const { sub: userId } = event.identity; // Usuario autenticado
    try {
        switch (fieldName) {
            case 'createRoom':
                console.log('🔍 Room Handler - createRoom arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoom(userId, event.arguments.input);
            case 'createRoomDebug':
                console.log('🔍 Room Handler - createRoomDebug arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoomDebug(userId, event.arguments.input);
            case 'createRoomSimple':
                console.log('🔍 Room Handler - createRoomSimple arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoomSimple(userId, event.arguments.name);
            case 'joinRoom':
                return await joinRoom(userId, event.arguments.roomId);
            case 'getMyHistory':
                return await getMyHistory(userId);
            case 'getUserRooms':
                return await getMyHistory(userId); // getUserRooms is an alias for getMyHistory
            case 'getRoom':
                return await getRoom(userId, event.arguments.roomId);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        try {
            console.error(`❌ Error en ${fieldName}:`, error);
        } catch (consoleError) {
            // If console.error fails, don't let it override the original error
            // Just continue with the original error
        }
        throw error;
    }
};
exports.handler = handler;
/**
 * Crear nueva sala
 */
async function createRoom(hostId, input) {
    let timer;
    try {
        timer = new metrics_1.PerformanceTimer('CreateRoom');
    } catch (timerError) {
        // If timer creation fails, create a mock timer
        timer = { finish: () => {} };
    }
    
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoom - hostId:', hostId);
    console.log('🔍 createRoom - input:', JSON.stringify(input, null, 2));
    try {
        // Generar código de invitación único
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        // Crear sala en RoomsTable
        const room = {
            id: roomId,
            name: input.name,
            description: input.description,
            status: 'WAITING',
            hostId,
            inviteCode,
            isActive: true,
            isPrivate: input.isPrivate || false,
            memberCount: 1,
            maxMembers: input.maxMembers,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                roomId,
                ...room,
            },
        }));
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        // Log business metric
        try {
            (0, metrics_1.logBusinessMetric)('ROOM_CREATED', roomId, hostId, {
                roomStatus: 'WAITING',
                roomName: input.name,
                isPrivate: input.isPrivate || false
            });
        } catch (metricsError) {
            // Metrics logging failure should not break the operation
        }
        console.log(`✅ Sala creada: ${roomId} (${input.name}) por ${hostId}`);
        try {
            timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
        } catch (timerError) {
            // Timer failure should not break the operation
        }
        return room;
    }
    catch (error) {
        try {
            (0, metrics_1.logError)('CreateRoom', error, { hostId, roomId });
        } catch (metricsError) {
            // Metrics logging failure should not break error handling
        }
        try {
            timer.finish(false, error.name);
        } catch (timerError) {
            // Timer failure should not break error handling
        }
        throw error;
    }
}
/**
 * Unirse a una sala existente
 */
async function joinRoom(userId, roomId) {
    const timer = new metrics_1.PerformanceTimer('JoinRoom');
    try {
        // Verificar que la sala existe y está disponible
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { roomId },
        }));
        if (!roomResponse.Item) {
            throw new Error('Sala no encontrada');
        }
        const room = roomResponse.Item;
        if (room.status !== 'WAITING') {
            throw new Error('La sala no está disponible para nuevos miembros');
        }
        // Verificar si el usuario ya está en la sala
        const existingMember = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (existingMember.Item) {
            // Usuario ya está en la sala, solo actualizar como activo
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
                UpdateExpression: 'SET isActive = :active, joinedAt = :joinedAt',
                ExpressionAttributeValues: {
                    ':active': true,
                    ':joinedAt': new Date().toISOString(),
                },
            }));
        }
        else {
            // Añadir nuevo miembro
            const newMember = {
                roomId,
                userId,
                role: 'MEMBER',
                joinedAt: new Date().toISOString(),
                isActive: true,
            };
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Item: newMember,
            }));
        }
        // Actualizar timestamp de la sala
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { roomId },
            UpdateExpression: 'SET updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':updatedAt': new Date().toISOString(),
            },
        }));
        // Log business metric
        (0, metrics_1.logBusinessMetric)('ROOM_JOINED', roomId, userId, {
            roomStatus: room.status,
            wasExistingMember: !!existingMember.Item
        });
        console.log(`✅ Usuario ${userId} se unió a sala ${roomId}`);
        timer.finish(true, undefined, { roomId, userId, wasExisting: !!existingMember.Item });
        return {
            id: roomId,
            name: room.name,
            description: room.description,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }
    catch (error) {
        (0, metrics_1.logError)('JoinRoom', error, { userId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Obtener historial de salas del usuario
 */
async function getMyHistory(userId) {
    const timer = new metrics_1.PerformanceTimer('GetMyHistory');
    try {
        // Consultar GSI UserHistoryIndex para obtener salas del usuario
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            IndexName: 'UserHistoryIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            ScanIndexForward: false,
            Limit: 50, // Limitar a últimas 50 salas
        }));
        if (!response || !response.Items || response.Items.length === 0) {
            timer.finish(true, undefined, { userId, roomCount: 0 });
            return [];
        }
        // Obtener detalles de cada sala
        const rooms = [];
        for (const member of response.Items) {
            try {
                const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { roomId: member.roomId },
                }));
                if (roomResponse.Item) {
                    const room = roomResponse.Item;
                    rooms.push({
                        id: room.roomId,
                        name: room.name || 'Sala sin nombre',
                        description: room.description,
                        status: room.status,
                        resultMovieId: room.resultMovieId,
                        hostId: room.hostId,
                        inviteCode: room.inviteCode,
                        isActive: room.isActive !== false,
                        isPrivate: room.isPrivate || false,
                        memberCount: room.memberCount || 1,
                        maxMembers: room.maxMembers,
                        createdAt: room.createdAt || new Date().toISOString(),
                        updatedAt: room.updatedAt || new Date().toISOString(),
                    });
                }
            }
            catch (error) {
                console.warn(`⚠️ Error obteniendo sala ${member.roomId}:`, error);
                // Continuar con las demás salas
            }
        }
        console.log(`📋 Historial obtenido para ${userId}: ${rooms.length} salas`);
        timer.finish(true, undefined, { userId, roomCount: rooms.length });
        return rooms;
    }
    catch (error) {
        (0, metrics_1.logError)('GetMyHistory', error, { userId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Crear nueva sala (versión debug con solo name)
 */
async function createRoomDebug(hostId, input) {
    const timer = new metrics_1.PerformanceTimer('CreateRoomDebug');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoomDebug - hostId:', hostId);
    console.log('🔍 createRoomDebug - input:', JSON.stringify(input, null, 2));
    try {
        // Generar código de invitación único
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: input.name,
            description: 'Sala de debug',
            status: 'WAITING',
            hostId,
            inviteCode,
            isActive: true,
            isPrivate: false,
            memberCount: 1,
            maxMembers: 10,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                roomId,
                ...room,
            },
        }));
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        // Log business metric
        (0, metrics_1.logBusinessMetric)('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: input.name,
            isPrivate: false,
            debug: true
        });
        console.log(`✅ Sala debug creada: ${roomId} (${input.name}) por ${hostId}`);
        timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
        return room;
    }
    catch (error) {
        (0, metrics_1.logError)('CreateRoomDebug', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Crear nueva sala (versión simple sin input type)
 */
async function createRoomSimple(hostId, name) {
    const timer = new metrics_1.PerformanceTimer('CreateRoomSimple');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoomSimple - hostId:', hostId);
    console.log('🔍 createRoomSimple - name:', name);
    try {
        // Generar código de invitación único
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: name,
            description: 'Sala simple',
            status: 'WAITING',
            hostId,
            inviteCode,
            isActive: true,
            isPrivate: false,
            memberCount: 1,
            maxMembers: 10,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                roomId,
                ...room,
            },
        }));
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        // Log business metric
        (0, metrics_1.logBusinessMetric)('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: name,
            isPrivate: false,
            simple: true
        });
        console.log(`✅ Sala simple creada: ${roomId} (${name}) por ${hostId}`);
        timer.finish(true, undefined, { roomId, hostId, roomName: name });
        return room;
    }
    catch (error) {
        (0, metrics_1.logError)('CreateRoomSimple', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Obtener detalles de una sala específica
 */
async function getRoom(userId, roomId) {
    try {
        // Primero verificar que la sala existe
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { roomId },
        }));
        if (!roomResponse.Item) {
            throw new Error('Sala no encontrada');
        }
        // Luego verificar que el usuario es miembro de la sala
        const memberResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (!memberResponse.Item) {
            throw new Error('No tienes acceso a esta sala');
        }
        const room = roomResponse.Item;
        return {
            id: room.roomId,
            name: room.name || 'Sala sin nombre',
            description: room.description,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            isActive: room.isActive !== false,
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
        };
    }
    catch (error) {
        try {
            console.error(`❌ Error obteniendo sala ${roomId}:`, error);
        } catch (consoleError) {
            // If console.error fails, don't let it override the original error
        }
        throw error;
    }
}
