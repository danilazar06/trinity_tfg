import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface Room {
  id: string;
  name: string;
  description?: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
  inviteCode?: string;
  isActive: boolean;
  isPrivate: boolean;
  memberCount: number;
  maxMembers?: number;
  createdAt: string;
  updatedAt?: string;
}

interface CreateRoomInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
}

interface CreateRoomInputDebug {
  name: string;
}

interface RoomMember {
  roomId: string;
  userId: string;
  role: 'HOST' | 'MEMBER';
  joinedAt: string;
  isActive: boolean;
}

/**
 * RoomHandler: Gestiona salas
 * Maneja createRoom, joinRoom y getMyHistory
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🏠 Room Handler:', JSON.stringify(event, null, 2));

  const { fieldName } = event.info;
  const { sub: userId } = event.identity as any; // Usuario autenticado

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
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Crear nueva sala
 */
async function createRoom(hostId: string, input: CreateRoomInput): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoom');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoom - hostId:', hostId);
  console.log('🔍 createRoom - input:', JSON.stringify(input, null, 2));

  try {
    // Generar código de invitación único
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Crear sala en RoomsTable
    const room: Room = {
      id: roomId,
      name: input.name,
      description: input.description,
      status: 'WAITING',
      hostId,
      inviteCode,
      isActive: true,
      isPrivate: input.isPrivate || false,
      memberCount: 1, // El host cuenta como miembro
      maxMembers: input.maxMembers,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        roomId,
        ...room,
      },
    }));

    // Añadir host como miembro
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));

    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: input.name,
      isPrivate: input.isPrivate || false
    });

    console.log(`✅ Sala creada: ${roomId} (${input.name}) por ${hostId}`);
    timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
    return room;
    
  } catch (error) {
    logError('CreateRoom', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Unirse a una sala existente
 */
async function joinRoom(userId: string, roomId: string): Promise<Room> {
  const timer = new PerformanceTimer('JoinRoom');
  
  try {
    // Verificar que la sala existe y está disponible
    const roomResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { roomId },
    }));

    if (!roomResponse.Item) {
      throw new Error('Sala no encontrada');
    }

    const room = roomResponse.Item as any;
    
    if (room.status !== 'WAITING') {
      throw new Error('La sala no está disponible para nuevos miembros');
    }

    // Verificar si el usuario ya está en la sala
    const existingMember = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: { roomId, userId },
    }));

    if (existingMember.Item) {
      // Usuario ya está en la sala, solo actualizar como activo
      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Key: { roomId, userId },
        UpdateExpression: 'SET isActive = :active, joinedAt = :joinedAt',
        ExpressionAttributeValues: {
          ':active': true,
          ':joinedAt': new Date().toISOString(),
        },
      }));
    } else {
      // Añadir nuevo miembro
      const newMember: RoomMember = {
        roomId,
        userId,
        role: 'MEMBER',
        joinedAt: new Date().toISOString(),
        isActive: true,
      };

      await docClient.send(new PutCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Item: newMember,
      }));
    }

    // Actualizar timestamp de la sala
    await docClient.send(new UpdateCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { roomId },
      UpdateExpression: 'SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Log business metric
    logBusinessMetric('ROOM_JOINED', roomId, userId, {
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
    
  } catch (error) {
    logError('JoinRoom', error as Error, { userId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Obtener historial de salas del usuario
 */
async function getMyHistory(userId: string): Promise<Room[]> {
  // Consultar GSI UserHistoryIndex para obtener salas del usuario
  const response = await docClient.send(new QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE!,
    IndexName: 'UserHistoryIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false, // Ordenar por joinedAt descendente (más recientes primero)
    Limit: 50, // Limitar a últimas 50 salas
  }));

  if (!response.Items || response.Items.length === 0) {
    return [];
  }

  // Obtener detalles de cada sala
  const rooms: Room[] = [];
  
  for (const member of response.Items) {
    try {
      const roomResponse = await docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE!,
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
          isActive: room.isActive !== false, // Default to true if not set
          isPrivate: room.isPrivate || false,
          memberCount: room.memberCount || 1,
          maxMembers: room.maxMembers,
          createdAt: room.createdAt || new Date().toISOString(),
          updatedAt: room.updatedAt || new Date().toISOString(),
        });
      }
    } catch (error) {
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
async function createRoomDebug(hostId: string, input: CreateRoomInputDebug): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoomDebug');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoomDebug - hostId:', hostId);
  console.log('🔍 createRoomDebug - input:', JSON.stringify(input, null, 2));

  try {
    // Generar código de invitación único
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Crear sala en RoomsTable con valores por defecto
    const room: Room = {
      id: roomId,
      name: input.name,
      description: 'Sala de debug',
      status: 'WAITING',
      hostId,
      inviteCode,
      isActive: true,
      isPrivate: false,
      memberCount: 1, // El host cuenta como miembro
      maxMembers: 10, // Valor por defecto
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        roomId,
        ...room,
      },
    }));

    // Añadir host como miembro
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));

    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: input.name,
      isPrivate: false,
      debug: true
    });

    console.log(`✅ Sala debug creada: ${roomId} (${input.name}) por ${hostId}`);
    timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
    return room;
    
  } catch (error) {
    logError('CreateRoomDebug', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Crear nueva sala (versión simple sin input type)
 */
async function createRoomSimple(hostId: string, name: string): Promise<Room> {
  const timer = new PerformanceTimer('CreateRoomSimple');
  const roomId = uuidv4();
  const now = new Date().toISOString();

  console.log('🔍 createRoomSimple - hostId:', hostId);
  console.log('🔍 createRoomSimple - name:', name);

  try {
    // Generar código de invitación único
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Crear sala en RoomsTable con valores por defecto
    const room: Room = {
      id: roomId,
      name: name,
      description: 'Sala simple',
      status: 'WAITING',
      hostId,
      inviteCode,
      isActive: true,
      isPrivate: false,
      memberCount: 1, // El host cuenta como miembro
      maxMembers: 10, // Valor por defecto
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOMS_TABLE!,
      Item: {
        roomId,
        ...room,
      },
    }));

    // Añadir host como miembro
    const hostMember: RoomMember = {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Item: hostMember,
    }));

    // Log business metric
    logBusinessMetric('ROOM_CREATED', roomId, hostId, {
      roomStatus: 'WAITING',
      roomName: name,
      isPrivate: false,
      simple: true
    });

    console.log(`✅ Sala simple creada: ${roomId} (${name}) por ${hostId}`);
    timer.finish(true, undefined, { roomId, hostId, roomName: name });
    return room;
    
  } catch (error) {
    logError('CreateRoomSimple', error as Error, { hostId, roomId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Obtener detalles de una sala específica
 */
async function getRoom(userId: string, roomId: string): Promise<Room | null> {
  try {
    // Verificar que el usuario es miembro de la sala
    const memberResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: { roomId, userId },
    }));

    if (!memberResponse.Item) {
      throw new Error('No tienes acceso a esta sala');
    }

    // Obtener detalles de la sala
    const roomResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
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
    
  } catch (error) {
    console.error(`❌ Error obteniendo sala ${roomId}:`, error);
    throw error;
  }
}