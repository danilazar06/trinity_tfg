import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { publishMatchFoundEvent, publishVoteUpdateEvent, getMovieTitle } from '../utils/appsync-publisher';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

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
  const timer = new PerformanceTimer('ProcessVote');
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
    await publishVoteUpdateEvent(roomId, userId, movieId, 'LIKE', currentVotes, totalMembers);
    
    // Log business metric
    logBusinessMetric('VOTE_CAST', roomId, userId, {
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
      const movieTitle = await getMovieTitle(movieId);
      
      // Publicar evento de match encontrado en tiempo real
      await publishMatchFoundEvent(roomId, movieId, movieTitle, participants);
      
      // Log business metric for match
      logBusinessMetric('MATCH_FOUND', roomId, userId, {
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
    
  } catch (error) {
    logError('ProcessVote', error as Error, { userId, roomId, movieId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
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

/**
 * Prevenir votos duplicados del mismo usuario para la misma película
 */
async function preventDuplicateVote(userId: string, roomId: string, movieId: string): Promise<void> {
  const roomMovieId = `${roomId}_${movieId}`;
  
  try {
    // Verificar si el usuario ya votó por esta película en esta sala
    const existingVote = await docClient.send(new GetCommand({
      TableName: process.env.USER_VOTES_TABLE!,
      Key: { userId, roomMovieId },
    }));

    if (existingVote.Item) {
      throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
    }

    // Registrar el voto para prevenir duplicados
    await docClient.send(new PutCommand({
      TableName: process.env.USER_VOTES_TABLE!,
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
    
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
    }
    throw error;
  }
}

/**
 * Obtener lista de participantes de la sala
 */
async function getRoomParticipants(roomId: string): Promise<string[]> {
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':roomId': roomId,
        ':active': true,
      },
      ProjectionExpression: 'userId',
    }));

    return response.Items?.map(item => item.userId) || [];
  } catch (error) {
    console.warn('⚠️ Error obteniendo participantes:', error);
    return [];
  }
}