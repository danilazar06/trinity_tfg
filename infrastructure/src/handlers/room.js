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
        // Verificar que el usuario es miembro de la sala
        const memberResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (!memberResponse.Item) {
            throw new Error('No tienes acceso a esta sala');
        }
        // Obtener detalles de la sala
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { roomId },
        }));
        if (!roomResponse.Item) {
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
            isActive: room.isActive !== false,
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
        };
    }
    catch (error) {
        console.error(`❌ Error obteniendo sala ${roomId}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJvb20udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCwrQkFBb0M7QUFDcEMsOENBQWlGO0FBRWpGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFxQzVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFaEUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDakMsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBZSxDQUFDLENBQUMsc0JBQXNCO0lBRXJFLElBQUk7UUFDRixRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLFlBQVk7Z0JBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pHLE9BQU8sTUFBTSxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFekQsS0FBSyxpQkFBaUI7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOENBQThDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0RyxP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WUFBWSxDQUFDLElBQUksQ0FBQztRQUUvQixPQUFPO1lBQ0wsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksaUJBQWlCO1lBQ3BDLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2pDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDM0IsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEtBQUssS0FBSztZQUNqQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxLQUFLO1lBQ2xDLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUM7WUFDbEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzNCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ3JELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1NBQ3RELENBQUM7S0FFSDtJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsTUFBTSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsTUFBTSxLQUFLLENBQUM7S0FDYjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQsIFF1ZXJ5Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xyXG5pbXBvcnQgeyBsb2dCdXNpbmVzc01ldHJpYywgbG9nRXJyb3IsIFBlcmZvcm1hbmNlVGltZXIgfSBmcm9tICcuLi91dGlscy9tZXRyaWNzJztcclxuXHJcbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XHJcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG5cclxuaW50ZXJmYWNlIFJvb20ge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xyXG4gIHN0YXR1czogc3RyaW5nO1xyXG4gIHJlc3VsdE1vdmllSWQ/OiBzdHJpbmc7XHJcbiAgaG9zdElkOiBzdHJpbmc7XHJcbiAgaW52aXRlQ29kZT86IHN0cmluZztcclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxuICBpc1ByaXZhdGU6IGJvb2xlYW47XHJcbiAgbWVtYmVyQ291bnQ6IG51bWJlcjtcclxuICBtYXhNZW1iZXJzPzogbnVtYmVyO1xyXG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xyXG4gIHVwZGF0ZWRBdD86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENyZWF0ZVJvb21JbnB1dCB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xyXG4gIGlzUHJpdmF0ZT86IGJvb2xlYW47XHJcbiAgbWF4TWVtYmVycz86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENyZWF0ZVJvb21JbnB1dERlYnVnIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSb29tTWVtYmVyIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICB1c2VySWQ6IHN0cmluZztcclxuICByb2xlOiAnSE9TVCcgfCAnTUVNQkVSJztcclxuICBqb2luZWRBdDogc3RyaW5nO1xyXG4gIGlzQWN0aXZlOiBib29sZWFuO1xyXG59XHJcblxyXG4vKipcclxuICogUm9vbUhhbmRsZXI6IEdlc3Rpb25hIHNhbGFzXHJcbiAqIE1hbmVqYSBjcmVhdGVSb29tLCBqb2luUm9vbSB5IGdldE15SGlzdG9yeVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/Cfj6AgUm9vbSBIYW5kbGVyOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gIGNvbnN0IHsgZmllbGROYW1lIH0gPSBldmVudC5pbmZvO1xyXG4gIGNvbnN0IHsgc3ViOiB1c2VySWQgfSA9IGV2ZW50LmlkZW50aXR5IGFzIGFueTsgLy8gVXN1YXJpbyBhdXRlbnRpY2Fkb1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbSc6XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflI0gUm9vbSBIYW5kbGVyIC0gY3JlYXRlUm9vbSBhcmd1bWVudHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYXJndW1lbnRzLCBudWxsLCAyKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMuaW5wdXQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbURlYnVnJzpcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+UjSBSb29tIEhhbmRsZXIgLSBjcmVhdGVSb29tRGVidWcgYXJndW1lbnRzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmFyZ3VtZW50cywgbnVsbCwgMikpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBjcmVhdGVSb29tRGVidWcodXNlcklkLCBldmVudC5hcmd1bWVudHMuaW5wdXQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbVNpbXBsZSc6XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflI0gUm9vbSBIYW5kbGVyIC0gY3JlYXRlUm9vbVNpbXBsZSBhcmd1bWVudHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYXJndW1lbnRzLCBudWxsLCAyKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVJvb21TaW1wbGUodXNlcklkLCBldmVudC5hcmd1bWVudHMubmFtZSk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdqb2luUm9vbSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGpvaW5Sb29tKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLnJvb21JZCk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdnZXRNeUhpc3RvcnknOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRNeUhpc3RvcnkodXNlcklkKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldFVzZXJSb29tcyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE15SGlzdG9yeSh1c2VySWQpOyAvLyBnZXRVc2VyUm9vbXMgaXMgYW4gYWxpYXMgZm9yIGdldE15SGlzdG9yeVxyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Um9vbSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldFJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMucm9vbUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIENyZWFyIG51ZXZhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJvb20oaG9zdElkOiBzdHJpbmcsIGlucHV0OiBDcmVhdGVSb29tSW5wdXQpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbSAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmFyIGPDs2RpZ28gZGUgaW52aXRhY2nDs24gw7puaWNvXHJcbiAgICBjb25zdCBpbnZpdGVDb2RlID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgLy8gQ3JlYXIgc2FsYSBlbiBSb29tc1RhYmxlXHJcbiAgICBjb25zdCByb29tOiBSb29tID0ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lOiBpbnB1dC5uYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGlucHV0LmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IDEsIC8vIEVsIGhvc3QgY3VlbnRhIGNvbW8gbWllbWJyb1xyXG4gICAgICBtYXhNZW1iZXJzOiBpbnB1dC5tYXhNZW1iZXJzLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBpbnB1dC5pc1ByaXZhdGUgfHwgZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBjcmVhZGE6ICR7cm9vbUlkfSAoJHtpbnB1dC5uYW1lfSkgcG9yICR7aG9zdElkfWApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGhvc3RJZCwgcm9vbU5hbWU6IGlucHV0Lm5hbWUgfSk7XHJcbiAgICByZXR1cm4gcm9vbTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignQ3JlYXRlUm9vbScsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVW5pcnNlIGEgdW5hIHNhbGEgZXhpc3RlbnRlXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBqb2luUm9vbSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdKb2luUm9vbScpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBWZXJpZmljYXIgcXVlIGxhIHNhbGEgZXhpc3RlIHkgZXN0w6EgZGlzcG9uaWJsZVxyXG4gICAgY29uc3Qgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW0gYXMgYW55O1xyXG4gICAgXHJcbiAgICBpZiAocm9vbS5zdGF0dXMgIT09ICdXQUlUSU5HJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIG51ZXZvcyBtaWVtYnJvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZlcmlmaWNhciBzaSBlbCB1c3VhcmlvIHlhIGVzdMOhIGVuIGxhIHNhbGFcclxuICAgIGNvbnN0IGV4aXN0aW5nTWVtYmVyID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmIChleGlzdGluZ01lbWJlci5JdGVtKSB7XHJcbiAgICAgIC8vIFVzdWFyaW8geWEgZXN0w6EgZW4gbGEgc2FsYSwgc29sbyBhY3R1YWxpemFyIGNvbW8gYWN0aXZvXHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCBpc0FjdGl2ZSA9IDphY3RpdmUsIGpvaW5lZEF0ID0gOmpvaW5lZEF0JyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICAgICAgICAnOmpvaW5lZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIEHDsWFkaXIgbnVldm8gbWllbWJyb1xyXG4gICAgICBjb25zdCBuZXdNZW1iZXI6IFJvb21NZW1iZXIgPSB7XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZCxcclxuICAgICAgICByb2xlOiAnTUVNQkVSJyxcclxuICAgICAgICBqb2luZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgICBJdGVtOiBuZXdNZW1iZXIsXHJcbiAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBY3R1YWxpemFyIHRpbWVzdGFtcCBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkIH0sXHJcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOnVwZGF0ZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9KT0lORUQnLCByb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICByb29tU3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgd2FzRXhpc3RpbmdNZW1iZXI6ICEhZXhpc3RpbmdNZW1iZXIuSXRlbVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBVc3VhcmlvICR7dXNlcklkfSBzZSB1bmnDsyBhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICBcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCB1c2VySWQsIHdhc0V4aXN0aW5nOiAhIWV4aXN0aW5nTWVtYmVyLkl0ZW0gfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IHJvb20ubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IHJvb20uZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgaW52aXRlQ29kZTogcm9vbS5pbnZpdGVDb2RlLFxyXG4gICAgICBpc0FjdGl2ZTogcm9vbS5pc0FjdGl2ZSxcclxuICAgICAgaXNQcml2YXRlOiByb29tLmlzUHJpdmF0ZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQsXHJcbiAgICAgIG1heE1lbWJlcnM6IHJvb20ubWF4TWVtYmVycyxcclxuICAgICAgY3JlYXRlZEF0OiByb29tLmNyZWF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignSm9pblJvb20nLCBlcnJvciBhcyBFcnJvciwgeyB1c2VySWQsIHJvb21JZCB9KTtcclxuICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgaGlzdG9yaWFsIGRlIHNhbGFzIGRlbCB1c3VhcmlvXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRNeUhpc3RvcnkodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFJvb21bXT4ge1xyXG4gIC8vIENvbnN1bHRhciBHU0kgVXNlckhpc3RvcnlJbmRleCBwYXJhIG9idGVuZXIgc2FsYXMgZGVsIHVzdWFyaW9cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgSW5kZXhOYW1lOiAnVXNlckhpc3RvcnlJbmRleCcsXHJcbiAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAndXNlcklkID0gOnVzZXJJZCcsXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICc6dXNlcklkJzogdXNlcklkLFxyXG4gICAgfSxcclxuICAgIFNjYW5JbmRleEZvcndhcmQ6IGZhbHNlLCAvLyBPcmRlbmFyIHBvciBqb2luZWRBdCBkZXNjZW5kZW50ZSAobcOhcyByZWNpZW50ZXMgcHJpbWVybylcclxuICAgIExpbWl0OiA1MCwgLy8gTGltaXRhciBhIMO6bHRpbWFzIDUwIHNhbGFzXHJcbiAgfSkpO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLkl0ZW1zIHx8IHJlc3BvbnNlLkl0ZW1zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxuXHJcbiAgLy8gT2J0ZW5lciBkZXRhbGxlcyBkZSBjYWRhIHNhbGFcclxuICBjb25zdCByb29tczogUm9vbVtdID0gW107XHJcbiAgXHJcbiAgZm9yIChjb25zdCBtZW1iZXIgb2YgcmVzcG9uc2UuSXRlbXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgcm9vbUlkOiBtZW1iZXIucm9vbUlkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmIChyb29tUmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIGNvbnN0IHJvb20gPSByb29tUmVzcG9uc2UuSXRlbTtcclxuICAgICAgICByb29tcy5wdXNoKHtcclxuICAgICAgICAgIGlkOiByb29tLnJvb21JZCxcclxuICAgICAgICAgIG5hbWU6IHJvb20ubmFtZSB8fCAnU2FsYSBzaW4gbm9tYnJlJyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiByb29tLmRlc2NyaXB0aW9uLFxyXG4gICAgICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgICAgICBpbnZpdGVDb2RlOiByb29tLmludml0ZUNvZGUsXHJcbiAgICAgICAgICBpc0FjdGl2ZTogcm9vbS5pc0FjdGl2ZSAhPT0gZmFsc2UsIC8vIERlZmF1bHQgdG8gdHJ1ZSBpZiBub3Qgc2V0XHJcbiAgICAgICAgICBpc1ByaXZhdGU6IHJvb20uaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQgfHwgMSxcclxuICAgICAgICAgIG1heE1lbWJlcnM6IHJvb20ubWF4TWVtYmVycyxcclxuICAgICAgICAgIGNyZWF0ZWRBdDogcm9vbS5jcmVhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgdXBkYXRlZEF0OiByb29tLnVwZGF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIEVycm9yIG9idGVuaWVuZG8gc2FsYSAke21lbWJlci5yb29tSWR9OmAsIGVycm9yKTtcclxuICAgICAgLy8gQ29udGludWFyIGNvbiBsYXMgZGVtw6FzIHNhbGFzXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb25zb2xlLmxvZyhg8J+TiyBIaXN0b3JpYWwgb2J0ZW5pZG8gcGFyYSAke3VzZXJJZH06ICR7cm9vbXMubGVuZ3RofSBzYWxhc2ApO1xyXG4gIHJldHVybiByb29tcztcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWFyIG51ZXZhIHNhbGEgKHZlcnNpw7NuIGRlYnVnIGNvbiBzb2xvIG5hbWUpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVSb29tRGVidWcoaG9zdElkOiBzdHJpbmcsIGlucHV0OiBDcmVhdGVSb29tSW5wdXREZWJ1Zyk6IFByb21pc2U8Um9vbT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0NyZWF0ZVJvb21EZWJ1ZycpO1xyXG4gIGNvbnN0IHJvb21JZCA9IHV1aWR2NCgpO1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbURlYnVnIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbURlYnVnIC0gaW5wdXQ6JywgSlNPTi5zdHJpbmdpZnkoaW5wdXQsIG51bGwsIDIpKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIEdlbmVyYXIgY8OzZGlnbyBkZSBpbnZpdGFjacOzbiDDum5pY29cclxuICAgIGNvbnN0IGludml0ZUNvZGUgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMiwgOCkudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAvLyBDcmVhciBzYWxhIGVuIFJvb21zVGFibGUgY29uIHZhbG9yZXMgcG9yIGRlZmVjdG9cclxuICAgIGNvbnN0IHJvb206IFJvb20gPSB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IGlucHV0Lm5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2FsYSBkZSBkZWJ1ZycsXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogMSwgLy8gRWwgaG9zdCBjdWVudGEgY29tbyBtaWVtYnJvXHJcbiAgICAgIG1heE1lbWJlcnM6IDEwLCAvLyBWYWxvciBwb3IgZGVmZWN0b1xyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgZGVidWc6IHRydWVcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBkZWJ1ZyBjcmVhZGE6ICR7cm9vbUlkfSAoJHtpbnB1dC5uYW1lfSkgcG9yICR7aG9zdElkfWApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGhvc3RJZCwgcm9vbU5hbWU6IGlucHV0Lm5hbWUgfSk7XHJcbiAgICByZXR1cm4gcm9vbTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignQ3JlYXRlUm9vbURlYnVnJywgZXJyb3IgYXMgRXJyb3IsIHsgaG9zdElkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhciBudWV2YSBzYWxhICh2ZXJzacOzbiBzaW1wbGUgc2luIGlucHV0IHR5cGUpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVSb29tU2ltcGxlKGhvc3RJZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tU2ltcGxlJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIG5hbWU6JywgbmFtZSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmFyIGPDs2RpZ28gZGUgaW52aXRhY2nDs24gw7puaWNvXHJcbiAgICBjb25zdCBpbnZpdGVDb2RlID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgLy8gQ3JlYXIgc2FsYSBlbiBSb29tc1RhYmxlIGNvbiB2YWxvcmVzIHBvciBkZWZlY3RvXHJcbiAgICBjb25zdCByb29tOiBSb29tID0ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NhbGEgc2ltcGxlJyxcclxuICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIGhvc3RJZCxcclxuICAgICAgaW52aXRlQ29kZSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiAxLCAvLyBFbCBob3N0IGN1ZW50YSBjb21vIG1pZW1icm9cclxuICAgICAgbWF4TWVtYmVyczogMTAsIC8vIFZhbG9yIHBvciBkZWZlY3RvXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgSXRlbToge1xyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICAuLi5yb29tLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEHDsWFkaXIgaG9zdCBjb21vIG1pZW1icm9cclxuICAgIGNvbnN0IGhvc3RNZW1iZXI6IFJvb21NZW1iZXIgPSB7XHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgdXNlcklkOiBob3N0SWQsXHJcbiAgICAgIHJvbGU6ICdIT1NUJyxcclxuICAgICAgam9pbmVkQXQ6IG5vdyxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiBob3N0TWVtYmVyLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdST09NX0NSRUFURUQnLCByb29tSWQsIGhvc3RJZCwge1xyXG4gICAgICByb29tU3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIHJvb21OYW1lOiBuYW1lLFxyXG4gICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICBzaW1wbGU6IHRydWVcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBzaW1wbGUgY3JlYWRhOiAke3Jvb21JZH0gKCR7bmFtZX0pIHBvciAke2hvc3RJZH1gKTtcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCBob3N0SWQsIHJvb21OYW1lOiBuYW1lIH0pO1xyXG4gICAgcmV0dXJuIHJvb207XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0NyZWF0ZVJvb21TaW1wbGUnLCBlcnJvciBhcyBFcnJvciwgeyBob3N0SWQsIHJvb21JZCB9KTtcclxuICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgZGV0YWxsZXMgZGUgdW5hIHNhbGEgZXNwZWPDrWZpY2FcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFJvb20odXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxSb29tIHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICAvLyBWZXJpZmljYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAgICBjb25zdCBtZW1iZXJSZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkLCB1c2VySWQgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBpZiAoIW1lbWJlclJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB0aWVuZXMgYWNjZXNvIGEgZXN0YSBzYWxhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT2J0ZW5lciBkZXRhbGxlcyBkZSBsYSBzYWxhXHJcbiAgICBjb25zdCByb29tUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgcm9vbUlkIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKCFyb29tUmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJvb20gPSByb29tUmVzcG9uc2UuSXRlbTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQ6IHJvb20ucm9vbUlkLFxyXG4gICAgICBuYW1lOiByb29tLm5hbWUgfHwgJ1NhbGEgc2luIG5vbWJyZScsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiByb29tLmRlc2NyaXB0aW9uLFxyXG4gICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGU6IHJvb20uaW52aXRlQ29kZSxcclxuICAgICAgaXNBY3RpdmU6IHJvb20uaXNBY3RpdmUgIT09IGZhbHNlLFxyXG4gICAgICBpc1ByaXZhdGU6IHJvb20uaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogcm9vbS5tZW1iZXJDb3VudCB8fCAxLFxyXG4gICAgICBtYXhNZW1iZXJzOiByb29tLm1heE1lbWJlcnMsXHJcbiAgICAgIGNyZWF0ZWRBdDogcm9vbS5jcmVhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IHJvb20udXBkYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH07XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIG9idGVuaWVuZG8gc2FsYSAke3Jvb21JZH06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59Il19