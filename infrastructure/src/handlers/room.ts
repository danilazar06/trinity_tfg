import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface Room {
  id: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
  createdAt: string;
  updatedAt: string;
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
        return await createRoom(userId);
      
      case 'joinRoom':
        return await joinRoom(userId, event.arguments.roomId);
      
      case 'getMyHistory':
        return await getMyHistory(userId);
      
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
async function createRoom(hostId: string): Promise<Room> {
  const roomId = uuidv4();
  const now = new Date().toISOString();

  // Crear sala en RoomsTable
  const room: Room = {
    id: roomId,
    status: 'WAITING',
    hostId,
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

  console.log(`✅ Sala creada: ${roomId} por ${hostId}`);
  return room;
}

/**
 * Unirse a una sala existente
 */
async function joinRoom(userId: string, roomId: string): Promise<Room> {
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

  console.log(`✅ Usuario ${userId} se unió a sala ${roomId}`);
  
  return {
    id: roomId,
    status: room.status,
    resultMovieId: room.resultMovieId,
    hostId: room.hostId,
  };
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
          status: room.status,
          resultMovieId: room.resultMovieId,
          hostId: room.hostId,
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