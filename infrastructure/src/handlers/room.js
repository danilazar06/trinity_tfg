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
 * Unirse a una sala existente
 */
async function joinRoom(userId, roomId) {
    const timer = new metrics_1.PerformanceTimer('JoinRoom');
    try {
        // Verificar que la sala existe y está disponible
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' }, // Use PK and SK instead of roomId
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
            Key: { PK: roomId, SK: 'ROOM' },
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
            const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: member.roomId, SK: 'ROOM' }, // Use PK and SK instead of roomId
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
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' }, // Use PK and SK instead of roomId
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJvb20udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCwrQkFBb0M7QUFDcEMsOENBQWlGO0FBRWpGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFzQzVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFaEUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDakMsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBZSxDQUFDLENBQUMsc0JBQXNCO0lBRXJFLElBQUk7UUFDRixRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLFlBQVk7Z0JBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pHLE9BQU8sTUFBTSxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFekQsS0FBSyxpQkFBaUI7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOENBQThDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0RyxP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SUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNyRCxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUN0RCxDQUFDO0tBRUg7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLE1BQU0sR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0tBQ2I7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kLCBRdWVyeUNvbW1hbmQsIFVwZGF0ZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcclxuXHJcbmludGVyZmFjZSBSb29tIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG4gIGludml0ZUNvZGU/OiBzdHJpbmc7XHJcbiAgaXNBY3RpdmU6IGJvb2xlYW47XHJcbiAgaXNQcml2YXRlOiBib29sZWFuO1xyXG4gIG1lbWJlckNvdW50OiBudW1iZXI7XHJcbiAgbWF4TWVtYmVycz86IG51bWJlcjtcclxuICBtYXRjaENvdW50PzogbnVtYmVyOyAvLyBBZGQgbWF0Y2hDb3VudCBmaWVsZFxyXG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xyXG4gIHVwZGF0ZWRBdD86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENyZWF0ZVJvb21JbnB1dCB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xyXG4gIGlzUHJpdmF0ZT86IGJvb2xlYW47XHJcbiAgbWF4TWVtYmVycz86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENyZWF0ZVJvb21JbnB1dERlYnVnIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSb29tTWVtYmVyIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICB1c2VySWQ6IHN0cmluZztcclxuICByb2xlOiAnSE9TVCcgfCAnTUVNQkVSJztcclxuICBqb2luZWRBdDogc3RyaW5nO1xyXG4gIGlzQWN0aXZlOiBib29sZWFuO1xyXG59XHJcblxyXG4vKipcclxuICogUm9vbUhhbmRsZXI6IEdlc3Rpb25hIHNhbGFzXHJcbiAqIE1hbmVqYSBjcmVhdGVSb29tLCBqb2luUm9vbSB5IGdldE15SGlzdG9yeVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/Cfj6AgUm9vbSBIYW5kbGVyOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gIGNvbnN0IHsgZmllbGROYW1lIH0gPSBldmVudC5pbmZvO1xyXG4gIGNvbnN0IHsgc3ViOiB1c2VySWQgfSA9IGV2ZW50LmlkZW50aXR5IGFzIGFueTsgLy8gVXN1YXJpbyBhdXRlbnRpY2Fkb1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbSc6XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflI0gUm9vbSBIYW5kbGVyIC0gY3JlYXRlUm9vbSBhcmd1bWVudHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYXJndW1lbnRzLCBudWxsLCAyKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMuaW5wdXQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbURlYnVnJzpcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+UjSBSb29tIEhhbmRsZXIgLSBjcmVhdGVSb29tRGVidWcgYXJndW1lbnRzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmFyZ3VtZW50cywgbnVsbCwgMikpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBjcmVhdGVSb29tRGVidWcodXNlcklkLCBldmVudC5hcmd1bWVudHMuaW5wdXQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnY3JlYXRlUm9vbVNpbXBsZSc6XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflI0gUm9vbSBIYW5kbGVyIC0gY3JlYXRlUm9vbVNpbXBsZSBhcmd1bWVudHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYXJndW1lbnRzLCBudWxsLCAyKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVJvb21TaW1wbGUodXNlcklkLCBldmVudC5hcmd1bWVudHMubmFtZSk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdqb2luUm9vbSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGpvaW5Sb29tKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLnJvb21JZCk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdnZXRNeUhpc3RvcnknOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRNeUhpc3RvcnkodXNlcklkKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldFVzZXJSb29tcyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE15SGlzdG9yeSh1c2VySWQpOyAvLyBnZXRVc2VyUm9vbXMgaXMgYW4gYWxpYXMgZm9yIGdldE15SGlzdG9yeVxyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Um9vbSc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldFJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMucm9vbUlkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIENyZWFyIG51ZXZhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJvb20oaG9zdElkOiBzdHJpbmcsIGlucHV0OiBDcmVhdGVSb29tSW5wdXQpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbSAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmFyIGPDs2RpZ28gZGUgaW52aXRhY2nDs24gw7puaWNvXHJcbiAgICBjb25zdCBpbnZpdGVDb2RlID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgLy8gQ3JlYXIgc2FsYSBlbiBSb29tc1RhYmxlXHJcbiAgICBjb25zdCByb29tOiBSb29tID0ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lOiBpbnB1dC5uYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGlucHV0LmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IDEsIC8vIEVsIGhvc3QgY3VlbnRhIGNvbW8gbWllbWJyb1xyXG4gICAgICBtYXhNZW1iZXJzOiBpbnB1dC5tYXhNZW1iZXJzLFxyXG4gICAgICBtYXRjaENvdW50OiAwLCAvLyBJbml0aWFsaXplIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgUEs6IHJvb21JZCwgLy8gQWRkIFBLIGZvciBEeW5hbW9EQiBwcmltYXJ5IGtleVxyXG4gICAgICAgIFNLOiAnUk9PTScsIC8vIEFkZCBTSyBmb3IgRHluYW1vREIgc29ydCBrZXlcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogaW5wdXQubmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBpbnB1dC5pc1ByaXZhdGUgfHwgZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBjcmVhZGE6ICR7cm9vbUlkfSAoJHtpbnB1dC5uYW1lfSkgcG9yICR7aG9zdElkfWApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGhvc3RJZCwgcm9vbU5hbWU6IGlucHV0Lm5hbWUgfSk7XHJcbiAgICByZXR1cm4gcm9vbTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignQ3JlYXRlUm9vbScsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVW5pcnNlIGEgdW5hIHNhbGEgZXhpc3RlbnRlXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBqb2luUm9vbSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdKb2luUm9vbScpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBWZXJpZmljYXIgcXVlIGxhIHNhbGEgZXhpc3RlIHkgZXN0w6EgZGlzcG9uaWJsZVxyXG4gICAgY29uc3Qgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSwgLy8gVXNlIFBLIGFuZCBTSyBpbnN0ZWFkIG9mIHJvb21JZFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW0gYXMgYW55O1xyXG4gICAgXHJcbiAgICBpZiAocm9vbS5zdGF0dXMgIT09ICdXQUlUSU5HJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIG51ZXZvcyBtaWVtYnJvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZlcmlmaWNhciBzaSBlbCB1c3VhcmlvIHlhIGVzdMOhIGVuIGxhIHNhbGFcclxuICAgIGNvbnN0IGV4aXN0aW5nTWVtYmVyID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmIChleGlzdGluZ01lbWJlci5JdGVtKSB7XHJcbiAgICAgIC8vIFVzdWFyaW8geWEgZXN0w6EgZW4gbGEgc2FsYSwgc29sbyBhY3R1YWxpemFyIGNvbW8gYWN0aXZvXHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCBpc0FjdGl2ZSA9IDphY3RpdmUsIGpvaW5lZEF0ID0gOmpvaW5lZEF0JyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICAgICAgICAnOmpvaW5lZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIEHDsWFkaXIgbnVldm8gbWllbWJyb1xyXG4gICAgICBjb25zdCBuZXdNZW1iZXI6IFJvb21NZW1iZXIgPSB7XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIHVzZXJJZCxcclxuICAgICAgICByb2xlOiAnTUVNQkVSJyxcclxuICAgICAgICBqb2luZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgICBJdGVtOiBuZXdNZW1iZXIsXHJcbiAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBY3R1YWxpemFyIHRpbWVzdGFtcCBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LCAvLyBVc2UgUEsgYW5kIFNLIGluc3RlYWQgb2Ygcm9vbUlkXHJcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOnVwZGF0ZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9KT0lORUQnLCByb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICByb29tU3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgd2FzRXhpc3RpbmdNZW1iZXI6ICEhZXhpc3RpbmdNZW1iZXIuSXRlbVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBVc3VhcmlvICR7dXNlcklkfSBzZSB1bmnDsyBhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICBcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCB1c2VySWQsIHdhc0V4aXN0aW5nOiAhIWV4aXN0aW5nTWVtYmVyLkl0ZW0gfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IHJvb20ubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IHJvb20uZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgaW52aXRlQ29kZTogcm9vbS5pbnZpdGVDb2RlLFxyXG4gICAgICBpc0FjdGl2ZTogcm9vbS5pc0FjdGl2ZSxcclxuICAgICAgaXNQcml2YXRlOiByb29tLmlzUHJpdmF0ZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQsXHJcbiAgICAgIG1heE1lbWJlcnM6IHJvb20ubWF4TWVtYmVycyxcclxuICAgICAgbWF0Y2hDb3VudDogcm9vbS5tYXRjaENvdW50IHx8IDAsIC8vIEFkZCBtYXRjaENvdW50IGZpZWxkXHJcbiAgICAgIGNyZWF0ZWRBdDogcm9vbS5jcmVhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH07XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0pvaW5Sb29tJywgZXJyb3IgYXMgRXJyb3IsIHsgdXNlcklkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGhpc3RvcmlhbCBkZSBzYWxhcyBkZWwgdXN1YXJpb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0TXlIaXN0b3J5KHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxSb29tW10+IHtcclxuICAvLyBDb25zdWx0YXIgR1NJIFVzZXJIaXN0b3J5SW5kZXggcGFyYSBvYnRlbmVyIHNhbGFzIGRlbCB1c3VhcmlvXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgIEluZGV4TmFtZTogJ1VzZXJIaXN0b3J5SW5kZXgnLFxyXG4gICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCA9IDp1c2VySWQnLFxyXG4gICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAnOnVzZXJJZCc6IHVzZXJJZCxcclxuICAgIH0sXHJcbiAgICBTY2FuSW5kZXhGb3J3YXJkOiBmYWxzZSwgLy8gT3JkZW5hciBwb3Igam9pbmVkQXQgZGVzY2VuZGVudGUgKG3DoXMgcmVjaWVudGVzIHByaW1lcm8pXHJcbiAgICBMaW1pdDogNTAsIC8vIExpbWl0YXIgYSDDumx0aW1hcyA1MCBzYWxhc1xyXG4gIH0pKTtcclxuXHJcbiAgaWYgKCFyZXNwb25zZS5JdGVtcyB8fCByZXNwb25zZS5JdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcblxyXG4gIC8vIE9idGVuZXIgZGV0YWxsZXMgZGUgY2FkYSBzYWxhXHJcbiAgY29uc3Qgcm9vbXM6IFJvb21bXSA9IFtdO1xyXG4gIFxyXG4gIGZvciAoY29uc3QgbWVtYmVyIG9mIHJlc3BvbnNlLkl0ZW1zKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByb29tUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiBtZW1iZXIucm9vbUlkLCBTSzogJ1JPT00nIH0sIC8vIFVzZSBQSyBhbmQgU0sgaW5zdGVhZCBvZiByb29tSWRcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKHJvb21SZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgY29uc3Qgcm9vbSA9IHJvb21SZXNwb25zZS5JdGVtO1xyXG4gICAgICAgIHJvb21zLnB1c2goe1xyXG4gICAgICAgICAgaWQ6IHJvb20ucm9vbUlkLFxyXG4gICAgICAgICAgbmFtZTogcm9vbS5uYW1lIHx8ICdTYWxhIHNpbiBub21icmUnLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246IHJvb20uZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgICAgIGludml0ZUNvZGU6IHJvb20uaW52aXRlQ29kZSxcclxuICAgICAgICAgIGlzQWN0aXZlOiByb29tLmlzQWN0aXZlICE9PSBmYWxzZSwgLy8gRGVmYXVsdCB0byB0cnVlIGlmIG5vdCBzZXRcclxuICAgICAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUgfHwgZmFsc2UsXHJcbiAgICAgICAgICBtZW1iZXJDb3VudDogcm9vbS5tZW1iZXJDb3VudCB8fCAxLFxyXG4gICAgICAgICAgbWF4TWVtYmVyczogcm9vbS5tYXhNZW1iZXJzLFxyXG4gICAgICAgICAgbWF0Y2hDb3VudDogcm9vbS5tYXRjaENvdW50IHx8IDAsIC8vIEFkZCBtYXRjaENvdW50IGZpZWxkXHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogcm9vbS51cGRhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBvYnRlbmllbmRvIHNhbGEgJHttZW1iZXIucm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICAgIC8vIENvbnRpbnVhciBjb24gbGFzIGRlbcOhcyBzYWxhc1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc29sZS5sb2coYPCfk4sgSGlzdG9yaWFsIG9idGVuaWRvIHBhcmEgJHt1c2VySWR9OiAke3Jvb21zLmxlbmd0aH0gc2FsYXNgKTtcclxuICByZXR1cm4gcm9vbXM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhciBudWV2YSBzYWxhICh2ZXJzacOzbiBkZWJ1ZyBjb24gc29sbyBuYW1lKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUm9vbURlYnVnKGhvc3RJZDogc3RyaW5nLCBpbnB1dDogQ3JlYXRlUm9vbUlucHV0RGVidWcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tRGVidWcnKTtcclxuICBjb25zdCByb29tSWQgPSB1dWlkdjQoKTtcclxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21EZWJ1ZyAtIGhvc3RJZDonLCBob3N0SWQpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21EZWJ1ZyAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBHZW5lcmFyIGPDs2RpZ28gZGUgaW52aXRhY2nDs24gw7puaWNvXHJcbiAgICBjb25zdCBpbnZpdGVDb2RlID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgLy8gQ3JlYXIgc2FsYSBlbiBSb29tc1RhYmxlIGNvbiB2YWxvcmVzIHBvciBkZWZlY3RvXHJcbiAgICBjb25zdCByb29tOiBSb29tID0ge1xyXG4gICAgICBpZDogcm9vbUlkLFxyXG4gICAgICBuYW1lOiBpbnB1dC5uYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1NhbGEgZGUgZGVidWcnLFxyXG4gICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IDEsIC8vIEVsIGhvc3QgY3VlbnRhIGNvbW8gbWllbWJyb1xyXG4gICAgICBtYXhNZW1iZXJzOiAxMCwgLy8gVmFsb3IgcG9yIGRlZmVjdG9cclxuICAgICAgbWF0Y2hDb3VudDogMCwgLy8gSW5pdGlhbGl6ZSBtYXRjaENvdW50IGZpZWxkXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgSXRlbToge1xyXG4gICAgICAgIFBLOiByb29tSWQsIC8vIEFkZCBQSyBmb3IgRHluYW1vREIgcHJpbWFyeSBrZXlcclxuICAgICAgICBTSzogJ1JPT00nLCAvLyBBZGQgU0sgZm9yIER5bmFtb0RCIHNvcnQga2V5XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIC4uLnJvb20sXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gQcOxYWRpciBob3N0IGNvbW8gbWllbWJyb1xyXG4gICAgY29uc3QgaG9zdE1lbWJlcjogUm9vbU1lbWJlciA9IHtcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGhvc3RJZCxcclxuICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IGhvc3RNZW1iZXIsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fQ1JFQVRFRCcsIHJvb21JZCwgaG9zdElkLCB7XHJcbiAgICAgIHJvb21TdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgcm9vbU5hbWU6IGlucHV0Lm5hbWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIGRlYnVnOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFNhbGEgZGVidWcgY3JlYWRhOiAke3Jvb21JZH0gKCR7aW5wdXQubmFtZX0pIHBvciAke2hvc3RJZH1gKTtcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCBob3N0SWQsIHJvb21OYW1lOiBpbnB1dC5uYW1lIH0pO1xyXG4gICAgcmV0dXJuIHJvb207XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0NyZWF0ZVJvb21EZWJ1ZycsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXIgbnVldmEgc2FsYSAodmVyc2nDs24gc2ltcGxlIHNpbiBpbnB1dCB0eXBlKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUm9vbVNpbXBsZShob3N0SWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignQ3JlYXRlUm9vbVNpbXBsZScpO1xyXG4gIGNvbnN0IHJvb21JZCA9IHV1aWR2NCgpO1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIGhvc3RJZDonLCBob3N0SWQpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBuYW1lOicsIG5hbWUpO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gR2VuZXJhciBjw7NkaWdvIGRlIGludml0YWNpw7NuIMO6bmljb1xyXG4gICAgY29uc3QgaW52aXRlQ29kZSA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCA4KS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgIC8vIENyZWFyIHNhbGEgZW4gUm9vbXNUYWJsZSBjb24gdmFsb3JlcyBwb3IgZGVmZWN0b1xyXG4gICAgY29uc3Qgcm9vbTogUm9vbSA9IHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTYWxhIHNpbXBsZScsXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGUsXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogMSwgLy8gRWwgaG9zdCBjdWVudGEgY29tbyBtaWVtYnJvXHJcbiAgICAgIG1heE1lbWJlcnM6IDEwLCAvLyBWYWxvciBwb3IgZGVmZWN0b1xyXG4gICAgICBtYXRjaENvdW50OiAwLCAvLyBJbml0aWFsaXplIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgUEs6IHJvb21JZCwgLy8gQWRkIFBLIGZvciBEeW5hbW9EQiBwcmltYXJ5IGtleVxyXG4gICAgICAgIFNLOiAnUk9PTScsIC8vIEFkZCBTSyBmb3IgRHluYW1vREIgc29ydCBrZXlcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgLi4ucm9vbSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBw7FhZGlyIGhvc3QgY29tbyBtaWVtYnJvXHJcbiAgICBjb25zdCBob3N0TWVtYmVyOiBSb29tTWVtYmVyID0ge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHVzZXJJZDogaG9zdElkLFxyXG4gICAgICByb2xlOiAnSE9TVCcsXHJcbiAgICAgIGpvaW5lZEF0OiBub3csXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgSXRlbTogaG9zdE1lbWJlcixcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnUk9PTV9DUkVBVEVEJywgcm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgcm9vbVN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICByb29tTmFtZTogbmFtZSxcclxuICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgc2ltcGxlOiB0cnVlXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFNhbGEgc2ltcGxlIGNyZWFkYTogJHtyb29tSWR9ICgke25hbWV9KSBwb3IgJHtob3N0SWR9YCk7XHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJvb21JZCwgaG9zdElkLCByb29tTmFtZTogbmFtZSB9KTtcclxuICAgIHJldHVybiByb29tO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdDcmVhdGVSb29tU2ltcGxlJywgZXJyb3IgYXMgRXJyb3IsIHsgaG9zdElkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGRldGFsbGVzIGRlIHVuYSBzYWxhIGVzcGVjw61maWNhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbSB8IG51bGw+IHtcclxuICB0cnkge1xyXG4gICAgLy8gVmVyaWZpY2FyIHF1ZSBlbCB1c3VhcmlvIGVzIG1pZW1icm8gZGUgbGEgc2FsYVxyXG4gICAgY29uc3QgbWVtYmVyUmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKCFtZW1iZXJSZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdGllbmVzIGFjY2VzbyBhIGVzdGEgc2FsYScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9idGVuZXIgZGV0YWxsZXMgZGUgbGEgc2FsYVxyXG4gICAgY29uc3Qgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSwgLy8gVXNlIFBLIGFuZCBTSyBpbnN0ZWFkIG9mIHJvb21JZFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW07XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tLnJvb21JZCxcclxuICAgICAgbmFtZTogcm9vbS5uYW1lIHx8ICdTYWxhIHNpbiBub21icmUnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogcm9vbS5kZXNjcmlwdGlvbixcclxuICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlOiByb29tLmludml0ZUNvZGUsXHJcbiAgICAgIGlzQWN0aXZlOiByb29tLmlzQWN0aXZlICE9PSBmYWxzZSxcclxuICAgICAgaXNQcml2YXRlOiByb29tLmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQgfHwgMSxcclxuICAgICAgbWF4TWVtYmVyczogcm9vbS5tYXhNZW1iZXJzLFxyXG4gICAgICBtYXRjaENvdW50OiByb29tLm1hdGNoQ291bnQgfHwgMCwgLy8gQWRkIG1hdGNoQ291bnQgZmllbGRcclxuICAgICAgY3JlYXRlZEF0OiByb29tLmNyZWF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHVwZGF0ZWRBdDogcm9vbS51cGRhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3Igb2J0ZW5pZW5kbyBzYWxhICR7cm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn0iXX0=