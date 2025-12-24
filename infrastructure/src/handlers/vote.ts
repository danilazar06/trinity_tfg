import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface Room {
  id: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
}

interface Vote {
  roomId: string;
  movieId: string;
  votes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * VoteHandler: Lógica Stop-on-Match
 * Implementa el algoritmo de votación que termina cuando todos los miembros votan
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🗳️ Vote Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity as any; // Usuario autenticado

  try {
    switch (fieldName) {
      case 'vote':
        return await processVote(userId, args.roomId, args.movieId);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Procesar voto con algoritmo Stop-on-Match
 */
async function processVote(userId: string, roomId: string, movieId: string): Promise<Room> {
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
async function getRoomAndValidate(roomId: string): Promise<any> {
  const response = await docClient.send(new GetCommand({
    TableName: process.env.ROOMS_TABLE!,
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
async function validateUserMembership(userId: string, roomId: string): Promise<void> {
  const response = await docClient.send(new GetCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE!,
    Key: { roomId, userId },
  }));

  if (!response.Item || !response.Item.isActive) {
    throw new Error('Usuario no es miembro activo de la sala');
  }
}

/**
 * Incrementar contador atómico de votos
 */
async function incrementVoteCount(roomId: string, movieId: string): Promise<number> {
  try {
    // Intentar actualizar voto existente
    const response = await docClient.send(new UpdateCommand({
      TableName: process.env.VOTES_TABLE!,
      Key: { roomId, movieId },
      UpdateExpression: 'ADD votes :increment SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':increment': 1,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));

    return response.Attributes?.votes || 1;

  } catch (error) {
    // Si el item no existe, crearlo
    const newVote: Vote = {
      roomId,
      movieId,
      votes: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.VOTES_TABLE!,
      Item: newVote,
      ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(movieId)',
    }));

    return 1;
  }
}

/**
 * Obtener total de miembros activos en la sala
 */
async function getTotalActiveMembers(roomId: string): Promise<number> {
  const response = await docClient.send(new QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE!,
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
async function updateRoomWithMatch(roomId: string, movieId: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: process.env.ROOMS_TABLE!,
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