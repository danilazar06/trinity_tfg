// Servicio para gestionar votos/swipes conectando con el backend
import { apiClient } from './apiClient';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false cuando el backend esté disponible

export type VoteType = 'like' | 'dislike';

export interface CreateVoteDto {
  mediaId: string;
  voteType: VoteType;
}

export interface VoteResponse {
  voteRegistered: boolean;
  nextMediaId: string | null;
  queueCompleted: boolean;
  currentProgress: {
    currentIndex: number;
    totalItems: number;
    remainingItems: number;
    progressPercentage: number;
  };
}

export interface QueueStatus {
  userId: string;
  roomId: string;
  currentMediaId: string | null;
  hasNext: boolean;
  isCompleted: boolean;
  progress: {
    currentIndex: number;
    totalItems: number;
    remainingItems: number;
    progressPercentage: number;
  };
}

export interface MediaVotes {
  mediaId: string;
  likes: number;
  dislikes: number;
  voters: string[];
}

export interface ConsensusResult {
  isUnanimous: boolean;
  voteType: VoteType | null;
  totalVotes: number;
  activeMembers: number;
}

export interface RoomVoteStats {
  roomId: string;
  totalVotes: number;
  likesCount: number;
  dislikesCount: number;
  uniqueVoters: number;
  completionRate: number;
  averageProgress: number;
}

export interface VoteHistoryItem {
  mediaId: string;
  voteType: VoteType;
  timestamp: string;
  sessionId?: string;
}

export interface SwipeSession {
  sessionId: string;
  startedAt: string;
  currentIndex: number;
  totalItems: number;
}

class VoteService {
  /**
   * Registrar un voto (swipe)
   */
  async registerVote(roomId: string, dto: CreateVoteDto): Promise<VoteResponse> {
    try {
      if (USE_MOCK) {
        return this.mockRegisterVote(dto);
      }
      return await apiClient.post<VoteResponse>(`/rooms/${roomId}/interactions/vote`, dto);
    } catch (error) {
      console.error('Error registering vote:', error);
      if (USE_MOCK) {
        return this.mockRegisterVote(dto);
      }
      throw error;
    }
  }

  /**
   * Obtener estado de la cola
   */
  async getQueueStatus(roomId: string): Promise<QueueStatus> {
    try {
      if (USE_MOCK) {
        return this.mockGetQueueStatus(roomId);
      }
      return await apiClient.get<QueueStatus>(`/rooms/${roomId}/interactions/queue/status`);
    } catch (error) {
      console.error('Error getting queue status:', error);
      if (USE_MOCK) {
        return this.mockGetQueueStatus(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener contenido actual para votar
   */
  async getCurrentMedia(roomId: string): Promise<any> {
    try {
      if (USE_MOCK) {
        return this.mockGetCurrentMedia();
      }
      return await apiClient.get(`/rooms/${roomId}/interactions/current-media`);
    } catch (error) {
      console.error('Error getting current media:', error);
      if (USE_MOCK) {
        return this.mockGetCurrentMedia();
      }
      throw error;
    }
  }

  /**
   * Obtener historial de votos
   */
  async getVoteHistory(roomId: string, limit: number = 50): Promise<VoteHistoryItem[]> {
    try {
      if (USE_MOCK) {
        return this.mockGetVoteHistory();
      }
      return await apiClient.get<VoteHistoryItem[]>(`/rooms/${roomId}/interactions/votes/history?limit=${limit}`);
    } catch (error) {
      console.error('Error getting vote history:', error);
      if (USE_MOCK) {
        return this.mockGetVoteHistory();
      }
      throw error;
    }
  }

  /**
   * Obtener votos de un contenido específico
   */
  async getMediaVotes(roomId: string, mediaId: string): Promise<MediaVotes> {
    try {
      if (USE_MOCK) {
        return this.mockGetMediaVotes(mediaId);
      }
      return await apiClient.get<MediaVotes>(`/rooms/${roomId}/interactions/media/${mediaId}/votes`);
    } catch (error) {
      console.error('Error getting media votes:', error);
      if (USE_MOCK) {
        return this.mockGetMediaVotes(mediaId);
      }
      throw error;
    }
  }

  /**
   * Verificar consenso de un contenido
   */
  async checkConsensus(roomId: string, mediaId: string): Promise<ConsensusResult> {
    try {
      if (USE_MOCK) {
        return this.mockCheckConsensus();
      }
      return await apiClient.get<ConsensusResult>(`/rooms/${roomId}/interactions/media/${mediaId}/consensus`);
    } catch (error) {
      console.error('Error checking consensus:', error);
      if (USE_MOCK) {
        return this.mockCheckConsensus();
      }
      throw error;
    }
  }

  /**
   * Obtener estadísticas de votación de la sala
   */
  async getRoomStats(roomId: string): Promise<RoomVoteStats> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomStats(roomId);
      }
      return await apiClient.get<RoomVoteStats>(`/rooms/${roomId}/interactions/stats`);
    } catch (error) {
      console.error('Error getting room stats:', error);
      if (USE_MOCK) {
        return this.mockGetRoomStats(roomId);
      }
      throw error;
    }
  }

  /**
   * Iniciar sesión de swipe
   */
  async startSwipeSession(roomId: string): Promise<SwipeSession> {
    try {
      if (USE_MOCK) {
        return this.mockStartSwipeSession();
      }
      return await apiClient.post<SwipeSession>(`/rooms/${roomId}/interactions/session/start`);
    } catch (error) {
      console.error('Error starting swipe session:', error);
      if (USE_MOCK) {
        return this.mockStartSwipeSession();
      }
      throw error;
    }
  }

  // ============ MOCK DATA PARA DESARROLLO ============

  private mockCurrentIndex = 0;
  private mockTotalItems = 20;

  private mockRegisterVote(dto: CreateVoteDto): VoteResponse {
    this.mockCurrentIndex++;
    const completed = this.mockCurrentIndex >= this.mockTotalItems;
    
    return {
      voteRegistered: true,
      nextMediaId: completed ? null : `${550 + this.mockCurrentIndex}`,
      queueCompleted: completed,
      currentProgress: {
        currentIndex: this.mockCurrentIndex,
        totalItems: this.mockTotalItems,
        remainingItems: this.mockTotalItems - this.mockCurrentIndex,
        progressPercentage: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      },
    };
  }

  private mockGetQueueStatus(roomId: string): QueueStatus {
    return {
      userId: 'mock-user-id',
      roomId,
      currentMediaId: `${550 + this.mockCurrentIndex}`,
      hasNext: this.mockCurrentIndex < this.mockTotalItems - 1,
      isCompleted: this.mockCurrentIndex >= this.mockTotalItems,
      progress: {
        currentIndex: this.mockCurrentIndex,
        totalItems: this.mockTotalItems,
        remainingItems: this.mockTotalItems - this.mockCurrentIndex,
        progressPercentage: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      },
    };
  }

  private mockGetCurrentMedia(): any {
    // Devuelve un ID de película de TMDB para que el mediaService lo enriquezca
    return {
      mediaId: `${550 + this.mockCurrentIndex}`,
      position: this.mockCurrentIndex,
      totalItems: this.mockTotalItems,
    };
  }

  private mockGetVoteHistory(): VoteHistoryItem[] {
    return Array(Math.min(this.mockCurrentIndex, 10)).fill(null).map((_, i) => ({
      mediaId: `${550 + i}`,
      voteType: Math.random() > 0.5 ? 'like' : 'dislike',
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      sessionId: 'mock-session-1',
    }));
  }

  private mockGetMediaVotes(mediaId: string): MediaVotes {
    return {
      mediaId,
      likes: Math.floor(Math.random() * 3) + 1,
      dislikes: Math.floor(Math.random() * 2),
      voters: ['user-1', 'user-2', 'user-3'].slice(0, Math.floor(Math.random() * 3) + 1),
    };
  }

  private mockCheckConsensus(): ConsensusResult {
    const isUnanimous = Math.random() > 0.7;
    return {
      isUnanimous,
      voteType: isUnanimous ? 'like' : null,
      totalVotes: 3,
      activeMembers: 3,
    };
  }

  private mockGetRoomStats(roomId: string): RoomVoteStats {
    return {
      roomId,
      totalVotes: this.mockCurrentIndex * 3,
      likesCount: Math.floor(this.mockCurrentIndex * 1.8),
      dislikesCount: Math.floor(this.mockCurrentIndex * 1.2),
      uniqueVoters: 3,
      completionRate: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      averageProgress: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
    };
  }

  private mockStartSwipeSession(): SwipeSession {
    this.mockCurrentIndex = 0; // Reset al iniciar nueva sesión
    return {
      sessionId: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
      currentIndex: 0,
      totalItems: this.mockTotalItems,
    };
  }

  /**
   * Reset mock state (útil para testing)
   */
  resetMockState(): void {
    this.mockCurrentIndex = 0;
  }

  /**
   * Sincronizar índice del miembro (útil cuando hay desincronización)
   */
  async syncMemberIndex(roomId: string): Promise<{
    previousIndex: number;
    newIndex: number;
    votesFound: number;
    synced: boolean;
  }> {
    try {
      return await apiClient.post(`/rooms/${roomId}/shuffle-sync/sync-index`);
    } catch (error) {
      console.error('Error syncing member index:', error);
      throw error;
    }
  }
}

export const voteService = new VoteService();
