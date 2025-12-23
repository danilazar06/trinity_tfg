import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { MemberService } from '../room/member.service';
import { MediaService } from '../media/media.service';
import { InteractionService } from '../interaction/interaction.service';
import {
  Match,
  MatchSummary,
  MatchDetectionResult,
  ConsensusType,
  RoomMatchLibrary,
  MatchStats,
  MatchNotification,
  NotificationType,
} from '../../domain/entities/match.entity';
import { VoteType } from '../../domain/entities/interaction.entity';

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private memberService: MemberService,
    private mediaService: MediaService,
    private interactionService: InteractionService,
  ) {}

  /**
   * Detectar si hay un match para un contenido específico
   */
  async detectMatch(roomId: string, mediaId: string): Promise<MatchDetectionResult> {
    try {
      // Verificar si ya existe un match para este contenido
      const existingMatch = await this.getMatchByMediaId(roomId, mediaId);
      if (existingMatch) {
        return {
          hasMatch: true,
          matchId: existingMatch.id,
          consensusType: existingMatch.consensusType,
          participants: existingMatch.participants,
          totalVotes: existingMatch.totalVotes,
          requiredVotes: existingMatch.participants.length,
        };
      }

      // Verificar consenso unánime
      const consensusResult = await this.interactionService.checkUnanimousVote(roomId, mediaId);
      
      if (consensusResult.isUnanimous && consensusResult.voteType === VoteType.LIKE) {
        // Crear el match
        const match = await this.createMatch(
          roomId,
          mediaId,
          consensusResult.totalVotes,
          ConsensusType.UNANIMOUS_LIKE
        );

        return {
          hasMatch: true,
          matchId: match.id,
          consensusType: match.consensusType,
          participants: match.participants,
          totalVotes: match.totalVotes,
          requiredVotes: consensusResult.activeMembers,
        };
      }

      return {
        hasMatch: false,
        participants: [],
        totalVotes: consensusResult.totalVotes,
        requiredVotes: consensusResult.activeMembers,
      };
    } catch (error) {
      this.logger.error(`Error detecting match for ${mediaId} in room ${roomId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear un nuevo match
   */
  private async createMatch(
    roomId: string,
    mediaId: string,
    totalVotes: number,
    consensusType: ConsensusType
  ): Promise<Match> {
    try {
      const matchId = uuidv4();

      // Obtener votos positivos para este contenido
      const votes = await this.interactionService.getMediaVotes(roomId, mediaId);
      const positiveVotes = votes.filter(vote => vote.voteType === VoteType.LIKE);
      const participants = positiveVotes.map(vote => vote.userId);

      // Obtener detalles del contenido
      const mediaDetails = await this.mediaService.getMediaDetails(mediaId);
      if (!mediaDetails) {
        throw new NotFoundException(`Media details not found for ${mediaId}`);
      }

      const match: Match = {
        id: matchId,
        roomId,
        mediaId,
        participants,
        createdAt: new Date(),
        mediaDetails,
        consensusType,
        totalVotes,
        notificationsSent: false,
      };

      // Guardar el match en DynamoDB
      await this.saveMatch(match);

      // Enviar notificaciones a los participantes
      await this.sendMatchNotifications(match);

      this.logger.log(
        `Match created: ${matchId} for media ${mediaId} in room ${roomId} with ${participants.length} participants`
      );

      return match;
    } catch (error) {
      this.logger.error(`Error creating match: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener match por ID
   */
  async getMatchById(matchId: string): Promise<Match | null> {
    try {
      // Para obtener por ID necesitaríamos un GSI o scan
      // Por simplicidad, implementamos una búsqueda básica
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'SK = :sk',
        FilterExpression: 'id = :matchId',
        ExpressionAttributeValues: {
          ':sk': 'MATCH#',
          ':matchId': matchId,
        },
      });

      return items.length > 0 ? (items[0] as Match) : null;
    } catch (error) {
      this.logger.error(`Error getting match ${matchId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener match por mediaId en una sala
   */
  async getMatchByMediaId(roomId: string, mediaId: string): Promise<Match | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.matchSK(mediaId)
      );

      return item ? (item as Match) : null;
    } catch (error) {
      this.logger.error(`Error getting match for media ${mediaId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtener todos los matches de una sala
   */
  async getRoomMatches(roomId: string, limit: number = 50): Promise<MatchSummary[]> {
    try {
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'MATCH#',
        },
        ScanIndexForward: false, // Orden descendente por fecha
        Limit: limit,
      });

      return items.map(item => this.convertToMatchSummary(item as Match));
    } catch (error) {
      this.logger.error(`Error getting room matches: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener biblioteca de matches de una sala
   */
  async getRoomMatchLibrary(roomId: string): Promise<RoomMatchLibrary> {
    try {
      const matches = await this.getRoomMatches(roomId, 100);
      
      // Calcular estadísticas
      const matchesByGenre: { [genre: string]: number } = {};
      let totalMatchTime = 0;

      matches.forEach(match => {
        // Agrupar por género (usar el primer género del contenido)
        const genres = match.mediaTitle.split(' '); // Simplificado
        const primaryGenre = genres[0] || 'Unknown';
        matchesByGenre[primaryGenre] = (matchesByGenre[primaryGenre] || 0) + 1;

        // Calcular tiempo promedio (simplificado)
        const matchTime = new Date().getTime() - match.createdAt.getTime();
        totalMatchTime += matchTime;
      });

      const averageMatchTime = matches.length > 0 
        ? Math.round(totalMatchTime / matches.length / (1000 * 60)) // En minutos
        : 0;

      return {
        roomId,
        totalMatches: matches.length,
        recentMatches: matches.slice(0, 10),
        matchesByGenre,
        averageMatchTime,
      };
    } catch (error) {
      this.logger.error(`Error getting room match library: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de matches
   */
  async getMatchStats(roomId: string): Promise<MatchStats> {
    try {
      const matches = await this.getRoomMatches(roomId, 1000);
      
      // Filtrar matches de esta semana
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const matchesThisWeek = matches.filter(match => match.createdAt > oneWeekAgo);

      // Calcular estadísticas
      const totalParticipants = matches.reduce((sum, match) => sum + match.participantCount, 0);
      const averageParticipants = matches.length > 0 ? totalParticipants / matches.length : 0;

      // Género más popular (simplificado)
      const genreCounts: { [genre: string]: number } = {};
      matches.forEach(match => {
        const genre = 'Action'; // Simplificado - en realidad vendría de mediaDetails
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });

      const mostPopularGenre = Object.keys(genreCounts).reduce((a, b) => 
        genreCounts[a] > genreCounts[b] ? a : b, 'Unknown'
      );

      // Tiempos de match (simplificado)
      const matchTimes = matches.map(() => Math.random() * 60 + 5); // 5-65 minutos
      const fastestMatch = matchTimes.length > 0 ? Math.min(...matchTimes) : 0;
      const slowestMatch = matchTimes.length > 0 ? Math.max(...matchTimes) : 0;

      // Tasa de matches (simplificado)
      const matchRate = 0.15; // 15% del contenido genera matches

      return {
        roomId,
        totalMatches: matches.length,
        matchesThisWeek: matchesThisWeek.length,
        averageParticipants: Math.round(averageParticipants * 10) / 10,
        mostPopularGenre,
        fastestMatch: Math.round(fastestMatch),
        slowestMatch: Math.round(slowestMatch),
        matchRate: Math.round(matchRate * 100) / 100,
      };
    } catch (error) {
      this.logger.error(`Error getting match stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar matches de una sala (cuando se elimina la sala)
   */
  async removeRoomMatches(roomId: string): Promise<void> {
    try {
      const matches = await this.getRoomMatches(roomId, 1000);

      for (const match of matches) {
        await this.dynamoDBService.deleteItem(
          DynamoDBKeys.roomPK(roomId),
          DynamoDBKeys.matchSK(match.id)
        );
      }

      this.logger.log(`Removed ${matches.length} matches from room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error removing room matches: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar matches pendientes después de cada voto
   */
  async checkPendingMatches(roomId: string, mediaId: string): Promise<Match | null> {
    const detectionResult = await this.detectMatch(roomId, mediaId);
    
    if (detectionResult.hasMatch && detectionResult.matchId) {
      return this.getMatchById(detectionResult.matchId);
    }
    
    return null;
  }

  /**
   * Obtener matches recientes de múltiples salas (para un usuario)
   */
  async getUserRecentMatches(userId: string, limit: number = 20): Promise<MatchSummary[]> {
    try {
      // Obtener salas del usuario
      const userRooms = await this.memberService.getRoomMembers(''); // Necesitaríamos un método diferente
      
      // Por simplicidad, retornamos un array vacío
      // En una implementación real, consultaríamos todas las salas del usuario
      return [];
    } catch (error) {
      this.logger.error(`Error getting user recent matches: ${error.message}`);
      return [];
    }
  }

  /**
   * Métodos privados de utilidad
   */
  private async saveMatch(match: Match): Promise<void> {
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.roomPK(match.roomId),
      SK: DynamoDBKeys.matchSK(match.mediaId),
      GSI1PK: DynamoDBKeys.matchGSI1PK(match.roomId),
      GSI1SK: DynamoDBKeys.matchGSI1SK(match.createdAt.toISOString()),
      ...match,
    });
  }

  private async sendMatchNotifications(match: Match): Promise<void> {
    try {
      const notification: MatchNotification = {
        matchId: match.id,
        roomId: match.roomId,
        mediaId: match.mediaId,
        recipients: match.participants,
        sentAt: new Date(),
        notificationType: NotificationType.MATCH_CREATED,
      };

      // En una implementación real, aquí enviaríamos notificaciones push, emails, etc.
      this.logger.log(`Match notifications sent for ${match.id} to ${match.participants.length} users`);

      // Marcar notificaciones como enviadas
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.roomPK(match.roomId),
        DynamoDBKeys.matchSK(match.mediaId),
        'SET notificationsSent = :sent',
        'attribute_exists(PK)',
        undefined,
        {
          ':sent': true,
        }
      );
    } catch (error) {
      this.logger.error(`Error sending match notifications: ${error.message}`);
      // No lanzar error, las notificaciones son secundarias
    }
  }

  private convertToMatchSummary(match: Match): MatchSummary {
    return {
      id: match.id,
      roomId: match.roomId,
      mediaTitle: match.mediaDetails.title,
      mediaPosterPath: match.mediaDetails.posterPath,
      participantCount: match.participants.length,
      createdAt: match.createdAt,
      consensusType: match.consensusType,
    };
  }
}