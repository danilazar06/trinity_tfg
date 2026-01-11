"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const metrics_1 = require("../utils/metrics");
const deepLinkService_1 = require("../services/deepLinkService");
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
            case 'joinRoomByInvite':
                return await joinRoomByInvite(userId, event.arguments.inviteCode);
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
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Crear nueva sala
 */
async function createRoom(hostId, input) {
    const timer = new metrics_1.PerformanceTimer('CreateRoom');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoom - hostId:', hostId);
    console.log('🔍 createRoom - input:', JSON.stringify(input, null, 2));
    try {
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService_1.deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168,
            maxUsage: undefined, // No usage limit
        });
        // Crear sala en RoomsTable
        const room = {
            id: roomId,
            name: input.name,
            description: input.description,
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            isActive: true,
            isPrivate: input.isPrivate || false,
            memberCount: 1,
            maxMembers: input.maxMembers,
            matchCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId,
                SK: 'ROOM',
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
            isPrivate: input.isPrivate || false
        });
        console.log(`✅ Sala creada: ${roomId} (${input.name}) por ${hostId}`);
        timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
        return room;
    }
    catch (error) {
        (0, metrics_1.logError)('CreateRoom', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Unirse a una sala usando código de invitación
 */
async function joinRoomByInvite(userId, inviteCode) {
    const timer = new metrics_1.PerformanceTimer('JoinRoomByInvite');
    try {
        console.log(`🔗 User ${userId} attempting to join room with invite code: ${inviteCode}`);
        // Validate invite code and get room info
        const roomInfo = await deepLinkService_1.deepLinkService.validateInviteCode(inviteCode);
        if (!roomInfo) {
            throw new Error('Invalid or expired invite code');
        }
        console.log(`✅ Invite code validated: ${inviteCode} -> Room: ${roomInfo.roomId}`);
        // Join the room using the roomId
        const room = await joinRoom(userId, roomInfo.roomId);
        // Log business metric for invite-based join
        (0, metrics_1.logBusinessMetric)('ROOM_JOINED_BY_INVITE', roomInfo.roomId, userId, {
            inviteCode,
            roomName: roomInfo.name,
            hostId: roomInfo.hostId,
        });
        console.log(`✅ User ${userId} joined room ${roomInfo.roomId} via invite code ${inviteCode}`);
        timer.finish(true, undefined, { roomId: roomInfo.roomId, inviteCode });
        return room;
    }
    catch (error) {
        (0, metrics_1.logError)('JoinRoomByInvite', error, { userId, inviteCode });
        timer.finish(false, error.name);
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
        const maxRetries = 3;
        let attempt = 0;
        let roomResponse;
        while (attempt < maxRetries) {
            try {
                roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom):', error.message);
                    throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attempt++;
                    if (attempt >= maxRetries) {
                        console.error('❌ Máximo de reintentos alcanzado para joinRoom getRoomAndValidate');
                        throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                    }
                    console.log(`🔄 Reintentando joinRoom getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
        if (!roomResponse || !roomResponse.Item) {
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
        const maxRetriesUpdate = 3;
        let attemptUpdate = 0;
        while (attemptUpdate < maxRetriesUpdate) {
            try {
                await docClient.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                    UpdateExpression: 'SET updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                        ':updatedAt': new Date().toISOString(),
                    },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom update):', error.message);
                    throw new Error('Error interno del sistema al actualizar la sala.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attemptUpdate++;
                    if (attemptUpdate >= maxRetriesUpdate) {
                        console.error('❌ Máximo de reintentos alcanzado para joinRoom updateRoom');
                        throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
                    }
                    console.log(`🔄 Reintentando joinRoom updateRoom (intento ${attemptUpdate + 1}/${maxRetriesUpdate})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptUpdate))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
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
            inviteUrl: room.inviteUrl,
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
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
    if (!response.Items || response.Items.length === 0) {
        return [];
    }
    // Obtener detalles de cada sala
    const rooms = [];
    for (const member of response.Items) {
        try {
            const maxRetriesHistory = 3;
            let attemptHistory = 0;
            let roomResponse;
            while (attemptHistory < maxRetriesHistory) {
                try {
                    roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                        TableName: process.env.ROOMS_TABLE,
                        Key: { PK: member.roomId, SK: 'ROOM' },
                    }));
                    break; // Success, exit retry loop
                }
                catch (error) {
                    if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                        console.error('❌ Error de estructura de clave en ROOMS_TABLE (getMyHistory):', error.message);
                        // Skip this room and continue with others
                        break;
                    }
                    // Errores de red o temporales - reintentar
                    if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                        attemptHistory++;
                        if (attemptHistory >= maxRetriesHistory) {
                            console.warn(`⚠️ Error obteniendo sala ${member.roomId} después de múltiples intentos:`, error);
                            break; // Skip this room and continue with others
                        }
                        console.log(`🔄 Reintentando getMyHistory getRoomDetails (intento ${attemptHistory + 1}/${maxRetriesHistory})`);
                        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptHistory))); // Exponential backoff
                        continue;
                    }
                    throw error; // Re-throw other errors
                }
            }
            if (roomResponse && roomResponse.Item) {
                const room = roomResponse.Item;
                rooms.push({
                    id: room.roomId,
                    name: room.name || 'Sala sin nombre',
                    description: room.description,
                    status: room.status,
                    resultMovieId: room.resultMovieId,
                    hostId: room.hostId,
                    inviteCode: room.inviteCode,
                    inviteUrl: room.inviteUrl,
                    isActive: room.isActive !== false,
                    isPrivate: room.isPrivate || false,
                    memberCount: room.memberCount || 1,
                    maxMembers: room.maxMembers,
                    matchCount: room.matchCount || 0,
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
    return rooms;
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
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService_1.deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168,
            maxUsage: undefined, // No usage limit
        });
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: input.name,
            description: 'Sala de debug',
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            isActive: true,
            isPrivate: false,
            memberCount: 1,
            maxMembers: 10,
            matchCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId,
                SK: 'ROOM',
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
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService_1.deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168,
            maxUsage: undefined, // No usage limit
        });
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: name,
            description: 'Sala simple',
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            isActive: true,
            isPrivate: false,
            memberCount: 1,
            maxMembers: 10,
            matchCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId,
                SK: 'ROOM',
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
        // Verificar que el usuario es miembro de la sala
        const memberResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (!memberResponse.Item) {
            throw new Error('No tienes acceso a esta sala');
        }
        // Obtener detalles de la sala
        const maxRetriesGetRoom = 3;
        let attemptGetRoom = 0;
        let roomResponse;
        while (attemptGetRoom < maxRetriesGetRoom) {
            try {
                roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (getRoom):', error.message);
                    throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attemptGetRoom++;
                    if (attemptGetRoom >= maxRetriesGetRoom) {
                        console.error('❌ Máximo de reintentos alcanzado para getRoom');
                        throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                    }
                    console.log(`🔄 Reintentando getRoom (intento ${attemptGetRoom + 1}/${maxRetriesGetRoom})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptGetRoom))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
        if (!roomResponse || !roomResponse.Item) {
            throw new Error('Sala no encontrada');
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
            inviteUrl: room.inviteUrl,
            isActive: room.isActive !== false,
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
        };
    }
    catch (error) {
        console.error(`❌ Error obteniendo sala ${roomId}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJvb20udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCwrQkFBb0M7QUFDcEMsOENBQWlGO0FBQ2pGLGlFQUE4RDtBQUU5RCxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBdUM1RDs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBcUMsS0FBSyxFQUFFLEtBQWdDLEVBQUUsRUFBRTtJQUNsRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWhFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBQ2pDLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLFFBQWUsQ0FBQyxDQUFDLHNCQUFzQjtJQUVyRSxJQUFJO1FBQ0YsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyxZQUFZO2dCQUNmLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqRyxPQUFPLE1BQU0sVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXpELEtBQUssaUJBQWlCO2dCQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLDhDQUE4QyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMs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QUFDO0tBQ2I7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kLCBRdWVyeUNvbW1hbmQsIFVwZGF0ZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcbmltcG9ydCB7IGRlZXBMaW5rU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2RlZXBMaW5rU2VydmljZSc7XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcclxuXHJcbmludGVyZmFjZSBSb29tIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG4gIGludml0ZUNvZGU/OiBzdHJpbmc7XHJcbiAgaW52aXRlVXJsPzogc3RyaW5nOyAvLyBBZGQgaW52aXRlIFVSTCBmaWVsZFxyXG4gIGlzQWN0aXZlOiBib29sZWFuO1xyXG4gIGlzUHJpdmF0ZTogYm9vbGVhbjtcclxuICBtZW1iZXJDb3VudDogbnVtYmVyO1xyXG4gIG1heE1lbWJlcnM/OiBudW1iZXI7XHJcbiAgbWF0Y2hDb3VudD86IG51bWJlcjsgLy8gQWRkIG1hdGNoQ291bnQgZmllbGRcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxuICB1cGRhdGVkQXQ/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDcmVhdGVSb29tSW5wdXQge1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxuICBpc1ByaXZhdGU/OiBib29sZWFuO1xyXG4gIG1heE1lbWJlcnM/OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDcmVhdGVSb29tSW5wdXREZWJ1ZyB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUm9vbU1lbWJlciB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgcm9sZTogJ0hPU1QnIHwgJ01FTUJFUic7XHJcbiAgam9pbmVkQXQ6IHN0cmluZztcclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJvb21IYW5kbGVyOiBHZXN0aW9uYSBzYWxhc1xyXG4gKiBNYW5lamEgY3JlYXRlUm9vbSwgam9pblJvb20geSBnZXRNeUhpc3RvcnlcclxuICovXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyOiBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyPGFueSwgYW55PiA9IGFzeW5jIChldmVudDogQXBwU3luY1Jlc29sdmVyRXZlbnQ8YW55PikgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCfwn4+gIFJvb20gSGFuZGxlcjonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG5cclxuICBjb25zdCB7IGZpZWxkTmFtZSB9ID0gZXZlbnQuaW5mbztcclxuICBjb25zdCB7IHN1YjogdXNlcklkIH0gPSBldmVudC5pZGVudGl0eSBhcyBhbnk7IC8vIFVzdWFyaW8gYXV0ZW50aWNhZG9cclxuXHJcbiAgdHJ5IHtcclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2NyZWF0ZVJvb20nOlxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJvb20gSGFuZGxlciAtIGNyZWF0ZVJvb20gYXJndW1lbnRzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmFyZ3VtZW50cywgbnVsbCwgMikpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBjcmVhdGVSb29tKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLmlucHV0KTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2NyZWF0ZVJvb21EZWJ1Zyc6XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflI0gUm9vbSBIYW5kbGVyIC0gY3JlYXRlUm9vbURlYnVnIGFyZ3VtZW50czonLCBKU09OLnN0cmluZ2lmeShldmVudC5hcmd1bWVudHMsIG51bGwsIDIpKTtcclxuICAgICAgICByZXR1cm4gYXdhaXQgY3JlYXRlUm9vbURlYnVnKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLmlucHV0KTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2NyZWF0ZVJvb21TaW1wbGUnOlxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJvb20gSGFuZGxlciAtIGNyZWF0ZVJvb21TaW1wbGUgYXJndW1lbnRzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmFyZ3VtZW50cywgbnVsbCwgMikpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBjcmVhdGVSb29tU2ltcGxlKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLm5hbWUpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnam9pblJvb20nOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBqb2luUm9vbSh1c2VySWQsIGV2ZW50LmFyZ3VtZW50cy5yb29tSWQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnam9pblJvb21CeUludml0ZSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGpvaW5Sb29tQnlJbnZpdGUodXNlcklkLCBldmVudC5hcmd1bWVudHMuaW52aXRlQ29kZSk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdnZXRNeUhpc3RvcnknOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRNeUhpc3RvcnkodXNlcklkKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldFVzZXJSb29tcyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE15SGlzdG9yeSh1c2VySWQpOyAvLyBnZXRVc2VyUm9vbXMgaXMgYW4gYWxpYXMgZm9yIGdldE15SGlzdG9yeVxyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Um9vbSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldFJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMucm9vbUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIENyZWFyIG51ZXZhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJvb20oaG9zdElkOiBzdHJpbmcsIGlucHV0OiBDcmVhdGVSb29tSW5wdXQpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbSAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmF0ZSB1bmlxdWUgaW52aXRlIGxpbmsgdXNpbmcgRGVlcExpbmtTZXJ2aWNlXHJcbiAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIGhvc3RJZCwge1xyXG4gICAgICBleHBpcnlIb3VyczogMTY4LCAvLyA3IGRheXNcclxuICAgICAgbWF4VXNhZ2U6IHVuZGVmaW5lZCwgLy8gTm8gdXNhZ2UgbGltaXRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWFyIHNhbGEgZW4gUm9vbXNUYWJsZVxyXG4gICAgY29uc3Qgcm9vbTogUm9vbSA9IHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgbmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IGlucHV0LmRlc2NyaXB0aW9uLFxyXG4gICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlOiBpbnZpdGVMaW5rLmNvZGUsXHJcbiAgICAgIGludml0ZVVybDogaW52aXRlTGluay51cmwsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGlucHV0LmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IDEsIC8vIEVsIGhvc3QgY3VlbnRhIGNvbW8gbWllbWJyb1xyXG4gICAgICBtYXhNZW1iZXJzOiBpbnB1dC5tYXhNZW1iZXJzLFxyXG4gICAgICBtYXRjaENvdW50OiAwLCAvLyBJbml0aWFsaXplIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgUEs6IHJvb21JZCwgLy8gQWRkIFBLIGZvciBEeW5hbW9EQiBwcmltYXJ5IGtleVxyXG4gICAgICAgIFNLOiAnUk9PTScsIC8vIEFkZCBTSyBmb3IgRHluYW1vREIgc29ydCBrZXlcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBpbnB1dC5pc1ByaXZhdGUgfHwgZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBjcmVhZGE6ICR7cm9vbUlkfSAoJHtpbnB1dC5uYW1lfSkgcG9yICR7aG9zdElkfWApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGhvc3RJZCwgcm9vbU5hbWU6IGlucHV0Lm5hbWUgfSk7XHJcbiAgICByZXR1cm4gcm9vbTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignQ3JlYXRlUm9vbScsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVW5pcnNlIGEgdW5hIHNhbGEgdXNhbmRvIGPDs2RpZ28gZGUgaW52aXRhY2nDs25cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGpvaW5Sb29tQnlJbnZpdGUodXNlcklkOiBzdHJpbmcsIGludml0ZUNvZGU6IHN0cmluZyk6IFByb21pc2U8Um9vbT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0pvaW5Sb29tQnlJbnZpdGUnKTtcclxuICBcclxuICB0cnkge1xyXG4gICAgY29uc29sZS5sb2coYPCflJcgVXNlciAke3VzZXJJZH0gYXR0ZW1wdGluZyB0byBqb2luIHJvb20gd2l0aCBpbnZpdGUgY29kZTogJHtpbnZpdGVDb2RlfWApO1xyXG4gICAgXHJcbiAgICAvLyBWYWxpZGF0ZSBpbnZpdGUgY29kZSBhbmQgZ2V0IHJvb20gaW5mb1xyXG4gICAgY29uc3Qgcm9vbUluZm8gPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UudmFsaWRhdGVJbnZpdGVDb2RlKGludml0ZUNvZGUpO1xyXG4gICAgaWYgKCFyb29tSW5mbykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgb3IgZXhwaXJlZCBpbnZpdGUgY29kZScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIEludml0ZSBjb2RlIHZhbGlkYXRlZDogJHtpbnZpdGVDb2RlfSAtPiBSb29tOiAke3Jvb21JbmZvLnJvb21JZH1gKTtcclxuICAgIFxyXG4gICAgLy8gSm9pbiB0aGUgcm9vbSB1c2luZyB0aGUgcm9vbUlkXHJcbiAgICBjb25zdCByb29tID0gYXdhaXQgam9pblJvb20odXNlcklkLCByb29tSW5mby5yb29tSWQpO1xyXG4gICAgXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIGZvciBpbnZpdGUtYmFzZWQgam9pblxyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fSk9JTkVEX0JZX0lOVklURScsIHJvb21JbmZvLnJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgIHJvb21OYW1lOiByb29tSW5mby5uYW1lLFxyXG4gICAgICBob3N0SWQ6IHJvb21JbmZvLmhvc3RJZCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFVzZXIgJHt1c2VySWR9IGpvaW5lZCByb29tICR7cm9vbUluZm8ucm9vbUlkfSB2aWEgaW52aXRlIGNvZGUgJHtpbnZpdGVDb2RlfWApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQ6IHJvb21JbmZvLnJvb21JZCwgaW52aXRlQ29kZSB9KTtcclxuICAgIHJldHVybiByb29tO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdKb2luUm9vbUJ5SW52aXRlJywgZXJyb3IgYXMgRXJyb3IsIHsgdXNlcklkLCBpbnZpdGVDb2RlIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVW5pcnNlIGEgdW5hIHNhbGEgZXhpc3RlbnRlXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBqb2luUm9vbSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdKb2luUm9vbScpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBWZXJpZmljYXIgcXVlIGxhIHNhbGEgZXhpc3RlIHkgZXN0w6EgZGlzcG9uaWJsZVxyXG4gICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgICBsZXQgYXR0ZW1wdCA9IDA7XHJcbiAgICBsZXQgcm9vbVJlc3BvbnNlO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICByb29tUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICAgIEtleTogeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGJyZWFrOyAvLyBTdWNjZXNzLCBleGl0IHJldHJ5IGxvb3BcclxuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTVNfVEFCTEUgKGpvaW5Sb29tKTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICAgIGF0dGVtcHQrKztcclxuICAgICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBqb2luUm9vbSBnZXRSb29tQW5kVmFsaWRhdGUnKTtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBTZXJ2aWNpbyB0ZW1wb3JhbG1lbnRlIG5vIGRpc3BvbmlibGUuJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBqb2luUm9vbSBnZXRSb29tQW5kVmFsaWRhdGUgKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgKTtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IG90aGVyIGVycm9yc1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFyb29tUmVzcG9uc2UgfHwgIXJvb21SZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignU2FsYSBubyBlbmNvbnRyYWRhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm9vbSA9IHJvb21SZXNwb25zZS5JdGVtIGFzIGFueTtcclxuICAgIFxyXG4gICAgaWYgKHJvb20uc3RhdHVzICE9PSAnV0FJVElORycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdMYSBzYWxhIG5vIGVzdMOhIGRpc3BvbmlibGUgcGFyYSBudWV2b3MgbWllbWJyb3MnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBWZXJpZmljYXIgc2kgZWwgdXN1YXJpbyB5YSBlc3TDoSBlbiBsYSBzYWxhXHJcbiAgICBjb25zdCBleGlzdGluZ01lbWJlciA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkLCB1c2VySWQgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBpZiAoZXhpc3RpbmdNZW1iZXIuSXRlbSkge1xyXG4gICAgICAvLyBVc3VhcmlvIHlhIGVzdMOhIGVuIGxhIHNhbGEsIHNvbG8gYWN0dWFsaXphciBjb21vIGFjdGl2b1xyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgaXNBY3RpdmUgPSA6YWN0aXZlLCBqb2luZWRBdCA9IDpqb2luZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzphY3RpdmUnOiB0cnVlLFxyXG4gICAgICAgICAgJzpqb2luZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9LFxyXG4gICAgICB9KSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBBw7FhZGlyIG51ZXZvIG1pZW1icm9cclxuICAgICAgY29uc3QgbmV3TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgcm9sZTogJ01FTUJFUicsXHJcbiAgICAgICAgam9pbmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgICAgSXRlbTogbmV3TWVtYmVyLFxyXG4gICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWN0dWFsaXphciB0aW1lc3RhbXAgZGUgbGEgc2FsYVxyXG4gICAgY29uc3QgbWF4UmV0cmllc1VwZGF0ZSA9IDM7XHJcbiAgICBsZXQgYXR0ZW1wdFVwZGF0ZSA9IDA7XHJcbiAgICBcclxuICAgIHdoaWxlIChhdHRlbXB0VXBkYXRlIDwgbWF4UmV0cmllc1VwZGF0ZSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYnJlYWs7IC8vIFN1Y2Nlc3MsIGV4aXQgcmV0cnkgbG9vcFxyXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NU19UQUJMRSAoam9pblJvb20gdXBkYXRlKTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYSBhbCBhY3R1YWxpemFyIGxhIHNhbGEuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICAgIGF0dGVtcHRVcGRhdGUrKztcclxuICAgICAgICAgIGlmIChhdHRlbXB0VXBkYXRlID49IG1heFJldHJpZXNVcGRhdGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBqb2luUm9vbSB1cGRhdGVSb29tJyk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyBhY3R1YWxpemFyIGxhIHNhbGEgZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGpvaW5Sb29tIHVwZGF0ZVJvb20gKGludGVudG8gJHthdHRlbXB0VXBkYXRlICsgMX0vJHttYXhSZXRyaWVzVXBkYXRlfSlgKTtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0VXBkYXRlKSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IG90aGVyIGVycm9yc1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fSk9JTkVEJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgIHdhc0V4aXN0aW5nTWVtYmVyOiAhIWV4aXN0aW5nTWVtYmVyLkl0ZW1cclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgVXN1YXJpbyAke3VzZXJJZH0gc2UgdW5pw7MgYSBzYWxhICR7cm9vbUlkfWApO1xyXG4gICAgXHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJvb21JZCwgdXNlcklkLCB3YXNFeGlzdGluZzogISFleGlzdGluZ01lbWJlci5JdGVtIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lOiByb29tLm5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiByb29tLmRlc2NyaXB0aW9uLFxyXG4gICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGU6IHJvb20uaW52aXRlQ29kZSxcclxuICAgICAgaW52aXRlVXJsOiByb29tLmludml0ZVVybCxcclxuICAgICAgaXNBY3RpdmU6IHJvb20uaXNBY3RpdmUsXHJcbiAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUsXHJcbiAgICAgIG1lbWJlckNvdW50OiByb29tLm1lbWJlckNvdW50LFxyXG4gICAgICBtYXhNZW1iZXJzOiByb29tLm1heE1lbWJlcnMsXHJcbiAgICAgIG1hdGNoQ291bnQ6IHJvb20ubWF0Y2hDb3VudCB8fCAwLCAvLyBBZGQgbWF0Y2hDb3VudCBmaWVsZFxyXG4gICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdKb2luUm9vbScsIGVycm9yIGFzIEVycm9yLCB7IHVzZXJJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBoaXN0b3JpYWwgZGUgc2FsYXMgZGVsIHVzdWFyaW9cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldE15SGlzdG9yeSh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbVtdPiB7XHJcbiAgLy8gQ29uc3VsdGFyIEdTSSBVc2VySGlzdG9yeUluZGV4IHBhcmEgb2J0ZW5lciBzYWxhcyBkZWwgdXN1YXJpb1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICBJbmRleE5hbWU6ICdVc2VySGlzdG9yeUluZGV4JyxcclxuICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcclxuICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgJzp1c2VySWQnOiB1c2VySWQsXHJcbiAgICB9LFxyXG4gICAgU2NhbkluZGV4Rm9yd2FyZDogZmFsc2UsIC8vIE9yZGVuYXIgcG9yIGpvaW5lZEF0IGRlc2NlbmRlbnRlIChtw6FzIHJlY2llbnRlcyBwcmltZXJvKVxyXG4gICAgTGltaXQ6IDUwLCAvLyBMaW1pdGFyIGEgw7psdGltYXMgNTAgc2FsYXNcclxuICB9KSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2UuSXRlbXMgfHwgcmVzcG9uc2UuSXRlbXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG5cclxuICAvLyBPYnRlbmVyIGRldGFsbGVzIGRlIGNhZGEgc2FsYVxyXG4gIGNvbnN0IHJvb21zOiBSb29tW10gPSBbXTtcclxuICBcclxuICBmb3IgKGNvbnN0IG1lbWJlciBvZiByZXNwb25zZS5JdGVtcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWF4UmV0cmllc0hpc3RvcnkgPSAzO1xyXG4gICAgICBsZXQgYXR0ZW1wdEhpc3RvcnkgPSAwO1xyXG4gICAgICBsZXQgcm9vbVJlc3BvbnNlO1xyXG4gICAgICBcclxuICAgICAgd2hpbGUgKGF0dGVtcHRIaXN0b3J5IDwgbWF4UmV0cmllc0hpc3RvcnkpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICAgICAgS2V5OiB7IFBLOiBtZW1iZXIucm9vbUlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICAgICAgICB9KSk7XHJcbiAgICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFIChnZXRNeUhpc3RvcnkpOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAvLyBTa2lwIHRoaXMgcm9vbSBhbmQgY29udGludWUgd2l0aCBvdGhlcnNcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnU2VydmljZUV4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ1Rocm90dGxpbmdFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdJbnRlcm5hbFNlcnZlckVycm9yJykge1xyXG4gICAgICAgICAgICBhdHRlbXB0SGlzdG9yeSsrO1xyXG4gICAgICAgICAgICBpZiAoYXR0ZW1wdEhpc3RvcnkgPj0gbWF4UmV0cmllc0hpc3RvcnkpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBvYnRlbmllbmRvIHNhbGEgJHttZW1iZXIucm9vbUlkfSBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zOmAsIGVycm9yKTtcclxuICAgICAgICAgICAgICBicmVhazsgLy8gU2tpcCB0aGlzIHJvb20gYW5kIGNvbnRpbnVlIHdpdGggb3RoZXJzXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBnZXRNeUhpc3RvcnkgZ2V0Um9vbURldGFpbHMgKGludGVudG8gJHthdHRlbXB0SGlzdG9yeSArIDF9LyR7bWF4UmV0cmllc0hpc3Rvcnl9KWApO1xyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdEhpc3RvcnkpKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyBvdGhlciBlcnJvcnNcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChyb29tUmVzcG9uc2UgJiYgcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW07XHJcbiAgICAgICAgcm9vbXMucHVzaCh7XHJcbiAgICAgICAgICBpZDogcm9vbS5yb29tSWQsXHJcbiAgICAgICAgICBuYW1lOiByb29tLm5hbWUgfHwgJ1NhbGEgc2luIG5vbWJyZScsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogcm9vbS5kZXNjcmlwdGlvbixcclxuICAgICAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICAgICAgaW52aXRlQ29kZTogcm9vbS5pbnZpdGVDb2RlLFxyXG4gICAgICAgICAgaW52aXRlVXJsOiByb29tLmludml0ZVVybCxcclxuICAgICAgICAgIGlzQWN0aXZlOiByb29tLmlzQWN0aXZlICE9PSBmYWxzZSwgLy8gRGVmYXVsdCB0byB0cnVlIGlmIG5vdCBzZXRcclxuICAgICAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUgfHwgZmFsc2UsXHJcbiAgICAgICAgICBtZW1iZXJDb3VudDogcm9vbS5tZW1iZXJDb3VudCB8fCAxLFxyXG4gICAgICAgICAgbWF4TWVtYmVyczogcm9vbS5tYXhNZW1iZXJzLFxyXG4gICAgICAgICAgbWF0Y2hDb3VudDogcm9vbS5tYXRjaENvdW50IHx8IDAsIC8vIEFkZCBtYXRjaENvdW50IGZpZWxkXHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogcm9vbS51cGRhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBvYnRlbmllbmRvIHNhbGEgJHttZW1iZXIucm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICAgIC8vIENvbnRpbnVhciBjb24gbGFzIGRlbcOhcyBzYWxhc1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc29sZS5sb2coYPCfk4sgSGlzdG9yaWFsIG9idGVuaWRvIHBhcmEgJHt1c2VySWR9OiAke3Jvb21zLmxlbmd0aH0gc2FsYXNgKTtcclxuICByZXR1cm4gcm9vbXM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhciBudWV2YSBzYWxhICh2ZXJzacOzbiBkZWJ1ZyBjb24gc29sbyBuYW1lKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUm9vbURlYnVnKGhvc3RJZDogc3RyaW5nLCBpbnB1dDogQ3JlYXRlUm9vbUlucHV0RGVidWcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tRGVidWcnKTtcclxuICBjb25zdCByb29tSWQgPSB1dWlkdjQoKTtcclxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21EZWJ1ZyAtIGhvc3RJZDonLCBob3N0SWQpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21EZWJ1ZyAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmF0ZSB1bmlxdWUgaW52aXRlIGxpbmsgdXNpbmcgRGVlcExpbmtTZXJ2aWNlXHJcbiAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIGhvc3RJZCwge1xyXG4gICAgICBleHBpcnlIb3VyczogMTY4LCAvLyA3IGRheXNcclxuICAgICAgbWF4VXNhZ2U6IHVuZGVmaW5lZCwgLy8gTm8gdXNhZ2UgbGltaXRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWFyIHNhbGEgZW4gUm9vbXNUYWJsZSBjb24gdmFsb3JlcyBwb3IgZGVmZWN0b1xyXG4gICAgY29uc3Qgcm9vbTogUm9vbSA9IHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgbmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTYWxhIGRlIGRlYnVnJyxcclxuICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIGhvc3RJZCxcclxuICAgICAgaW52aXRlQ29kZTogaW52aXRlTGluay5jb2RlLFxyXG4gICAgICBpbnZpdGVVcmw6IGludml0ZUxpbmsudXJsLFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IDEsIC8vIEVsIGhvc3QgY3VlbnRhIGNvbW8gbWllbWJyb1xyXG4gICAgICBtYXhNZW1iZXJzOiAxMCwgLy8gVmFsb3IgcG9yIGRlZmVjdG9cclxuICAgICAgbWF0Y2hDb3VudDogMCwgLy8gSW5pdGlhbGl6ZSBtYXRjaENvdW50IGZpZWxkXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgSXRlbToge1xyXG4gICAgICAgIFBLOiByb29tSWQsIC8vIEFkZCBQSyBmb3IgRHluYW1vREIgcHJpbWFyeSBrZXlcclxuICAgICAgICBTSzogJ1JPT00nLCAvLyBBZGQgU0sgZm9yIER5bmFtb0RCIHNvcnQga2V5XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIC4uLnJvb20sXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gQcOxYWRpciBob3N0IGNvbW8gbWllbWJyb1xyXG4gICAgY29uc3QgaG9zdE1lbWJlcjogUm9vbU1lbWJlciA9IHtcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGhvc3RJZCxcclxuICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IGhvc3RNZW1iZXIsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fQ1JFQVRFRCcsIHJvb21JZCwgaG9zdElkLCB7XHJcbiAgICAgIHJvb21TdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgcm9vbU5hbWU6IGlucHV0Lm5hbWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIGRlYnVnOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFNhbGEgZGVidWcgY3JlYWRhOiAke3Jvb21JZH0gKCR7aW5wdXQubmFtZX0pIHBvciAke2hvc3RJZH1gKTtcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCBob3N0SWQsIHJvb21OYW1lOiBpbnB1dC5uYW1lIH0pO1xyXG4gICAgcmV0dXJuIHJvb207XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0NyZWF0ZVJvb21EZWJ1ZycsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXIgbnVldmEgc2FsYSAodmVyc2nDs24gc2ltcGxlIHNpbiBpbnB1dCB0eXBlKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUm9vbVNpbXBsZShob3N0SWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignQ3JlYXRlUm9vbVNpbXBsZScpO1xyXG4gIGNvbnN0IHJvb21JZCA9IHV1aWR2NCgpO1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIGhvc3RJZDonLCBob3N0SWQpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBuYW1lOicsIG5hbWUpO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gR2VuZXJhdGUgdW5pcXVlIGludml0ZSBsaW5rIHVzaW5nIERlZXBMaW5rU2VydmljZVxyXG4gICAgY29uc3QgaW52aXRlTGluayA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgZXhwaXJ5SG91cnM6IDE2OCwgLy8gNyBkYXlzXHJcbiAgICAgIG1heFVzYWdlOiB1bmRlZmluZWQsIC8vIE5vIHVzYWdlIGxpbWl0XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhciBzYWxhIGVuIFJvb21zVGFibGUgY29uIHZhbG9yZXMgcG9yIGRlZmVjdG9cclxuICAgIGNvbnN0IHJvb206IFJvb20gPSB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IG5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2FsYSBzaW1wbGUnLFxyXG4gICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlOiBpbnZpdGVMaW5rLmNvZGUsXHJcbiAgICAgIGludml0ZVVybDogaW52aXRlTGluay51cmwsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogMSwgLy8gRWwgaG9zdCBjdWVudGEgY29tbyBtaWVtYnJvXHJcbiAgICAgIG1heE1lbWJlcnM6IDEwLCAvLyBWYWxvciBwb3IgZGVmZWN0b1xyXG4gICAgICBtYXRjaENvdW50OiAwLCAvLyBJbml0aWFsaXplIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgUEs6IHJvb21JZCwgLy8gQWRkIFBLIGZvciBEeW5hbW9EQiBwcmltYXJ5IGtleVxyXG4gICAgICAgIFNLOiAnUk9PTScsIC8vIEFkZCBTSyBmb3IgRHluYW1vREIgc29ydCBrZXlcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogbmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgc2ltcGxlOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFNhbGEgc2ltcGxlIGNyZWFkYTogJHtyb29tSWR9ICgke25hbWV9KSBwb3IgJHtob3N0SWR9YCk7XHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJvb21JZCwgaG9zdElkLCByb29tTmFtZTogbmFtZSB9KTtcclxuICAgIHJldHVybiByb29tO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdDcmVhdGVSb29tU2ltcGxlJywgZXJyb3IgYXMgRXJyb3IsIHsgaG9zdElkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGRldGFsbGVzIGRlIHVuYSBzYWxhIGVzcGVjw61maWNhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbSB8IG51bGw+IHtcclxuICB0cnkge1xyXG4gICAgLy8gVmVyaWZpY2FyIHF1ZSBlbCB1c3VhcmlvIGVzIG1pZW1icm8gZGUgbGEgc2FsYVxyXG4gICAgY29uc3QgbWVtYmVyUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKCFtZW1iZXJSZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdGllbmVzIGFjY2VzbyBhIGVzdGEgc2FsYScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9idGVuZXIgZGV0YWxsZXMgZGUgbGEgc2FsYVxyXG4gICAgY29uc3QgbWF4UmV0cmllc0dldFJvb20gPSAzO1xyXG4gICAgbGV0IGF0dGVtcHRHZXRSb29tID0gMDtcclxuICAgIGxldCByb29tUmVzcG9uc2U7XHJcbiAgICBcclxuICAgIHdoaWxlIChhdHRlbXB0R2V0Um9vbSA8IG1heFJldHJpZXNHZXRSb29tKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFIChnZXRSb29tKTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICAgIGF0dGVtcHRHZXRSb29tKys7XHJcbiAgICAgICAgICBpZiAoYXR0ZW1wdEdldFJvb20gPj0gbWF4UmV0cmllc0dldFJvb20pIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBnZXRSb29tJyk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gU2VydmljaW8gdGVtcG9yYWxtZW50ZSBubyBkaXNwb25pYmxlLicpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gZ2V0Um9vbSAoaW50ZW50byAke2F0dGVtcHRHZXRSb29tICsgMX0vJHttYXhSZXRyaWVzR2V0Um9vbX0pYCk7XHJcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdEdldFJvb20pKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aHJvdyBlcnJvcjsgLy8gUmUtdGhyb3cgb3RoZXIgZXJyb3JzXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXJvb21SZXNwb25zZSB8fCAhcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW07XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tLnJvb21JZCxcclxuICAgICAgbmFtZTogcm9vbS5uYW1lIHx8ICdTYWxhIHNpbiBub21icmUnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogcm9vbS5kZXNjcmlwdGlvbixcclxuICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlOiByb29tLmludml0ZUNvZGUsXHJcbiAgICAgIGludml0ZVVybDogcm9vbS5pbnZpdGVVcmwsXHJcbiAgICAgIGlzQWN0aXZlOiByb29tLmlzQWN0aXZlICE9PSBmYWxzZSxcclxuICAgICAgaXNQcml2YXRlOiByb29tLmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQgfHwgMSxcclxuICAgICAgbWF4TWVtYmVyczogcm9vbS5tYXhNZW1iZXJzLFxyXG4gICAgICBtYXRjaENvdW50OiByb29tLm1hdGNoQ291bnQgfHwgMCwgLy8gQWRkIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiByb29tLmNyZWF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHVwZGF0ZWRBdDogcm9vbS51cGRhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3Igb2J0ZW5pZW5kbyBzYWxhICR7cm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn0iXX0=