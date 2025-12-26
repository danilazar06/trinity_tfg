// Servicio para gestionar salas conectando con el backend
import { apiClient } from './apiClient';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false cuando el backend esté disponible

export interface ContentFilters {
  genres?: number[];
  platforms?: string[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  contentType?: 'movie' | 'tv' | 'all';
  aiPrompt?: string;
}

export interface CreateRoomDto {
  name: string;
  filters: ContentFilters;
  participantCount?: number;
}

export interface Room {
  id: string;
  name: string;
  creatorId: string;
  filters: ContentFilters;
  masterList: string[];
  inviteCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  creatorId: string;
  memberCount: number;
  matchCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface RoomMember {
  userId: string;
  role: 'creator' | 'member';
  status: 'active' | 'inactive';
  joinedAt: string;
  lastActivityAt: string;
}

export interface RoomDetails {
  room: Room;
  members: RoomMember[];
  matchCount: number;
  userRole: string;
}

export interface RoomStats {
  totalMembers: number;
  activeMembers: number;
  totalMatches: number;
  averageProgress: number;
}

export interface NextMediaResponse {
  mediaId?: string;
  completed: boolean;
  message?: string;
}

export interface MemberProgress {
  currentIndex: number;
  totalItems: number;
  percentage: number;
}

class RoomService {
  /**
   * Crear una nueva sala
   */
  async createRoom(dto: CreateRoomDto): Promise<Room> {
    try {
      if (USE_MOCK) {
        return this.mockCreateRoom(dto);
      }
      return await apiClient.post<Room>('/rooms', dto);
    } catch (error) {
      console.error('Error creating room:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockCreateRoom(dto);
      }
      throw error;
    }
  }

  /**
   * Obtener salas del usuario
   */
  async getUserRooms(): Promise<RoomSummary[]> {
    try {
      if (USE_MOCK) {
        return this.mockGetUserRooms();
      }
      return await apiClient.get<RoomSummary[]>('/rooms');
    } catch (error) {
      console.error('Error getting user rooms:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetUserRooms();
      }
      throw error;
    }
  }

  /**
   * Obtener detalles de una sala
   */
  async getRoomDetails(roomId: string): Promise<RoomDetails> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomDetails(roomId);
      }
      return await apiClient.get<RoomDetails>(`/rooms/${roomId}`);
    } catch (error) {
      console.error('Error getting room details:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetRoomDetails(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener estadísticas de una sala
   */
  async getRoomStats(roomId: string): Promise<RoomStats> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomStats();
      }
      return await apiClient.get<RoomStats>(`/rooms/${roomId}/stats`);
    } catch (error) {
      console.error('Error getting room stats:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetRoomStats();
      }
      throw error;
    }
  }

  /**
   * Obtener mi progreso en la sala
   */
  async getMyProgress(roomId: string): Promise<MemberProgress> {
    try {
      if (USE_MOCK) {
        return { currentIndex: 5, totalItems: 20, percentage: 25 };
      }
      return await apiClient.get<MemberProgress>(`/rooms/${roomId}/my-progress`);
    } catch (error) {
      console.error('Error getting progress:', error);
      return { currentIndex: 0, totalItems: 0, percentage: 0 };
    }
  }

  /**
   * Obtener siguiente media para votar
   */
  async getNextMedia(roomId: string): Promise<NextMediaResponse> {
    try {
      if (USE_MOCK) {
        return { mediaId: '550', completed: false }; // Fight Club como ejemplo
      }
      return await apiClient.get<NextMediaResponse>(`/rooms/${roomId}/next-media`);
    } catch (error) {
      console.error('Error getting next media:', error);
      return { completed: true, message: 'Error al obtener contenido' };
    }
  }

  /**
   * Unirse a una sala con código de invitación
   */
  async joinRoom(inviteCode: string): Promise<Room> {
    try {
      if (USE_MOCK) {
        return this.mockJoinRoom(inviteCode);
      }
      return await apiClient.post<Room>('/rooms/join', { inviteCode });
    } catch (error) {
      console.error('Error joining room:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockJoinRoom(inviteCode);
      }
      throw error;
    }
  }

  /**
   * Abandonar una sala
   */
  async leaveRoom(roomId: string): Promise<void> {
    try {
      if (USE_MOCK) {
        console.log('Mock: Left room', roomId);
        return;
      }
      await apiClient.delete(`/rooms/${roomId}/leave`);
    } catch (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  }

  /**
   * Actualizar filtros de la sala (solo creador)
   */
  async updateRoomFilters(roomId: string, filters: ContentFilters): Promise<Room> {
    try {
      if (USE_MOCK) {
        console.log('Mock: Updated filters for room', roomId);
        return this.mockGetRoomDetails(roomId).then(d => d.room);
      }
      return await apiClient.put<Room>(`/rooms/${roomId}/filters`, { filters });
    } catch (error) {
      console.error('Error updating room filters:', error);
      throw error;
    }
  }

  /**
   * Regenerar código de invitación
   */
  async regenerateInviteCode(roomId: string): Promise<string> {
    try {
      if (USE_MOCK) {
        return this.generateInviteCode();
      }
      const response = await apiClient.post<{ inviteCode: string }>(`/rooms/${roomId}/regenerate-invite`);
      return response.inviteCode;
    } catch (error) {
      console.error('Error regenerating invite code:', error);
      throw error;
    }
  }

  /**
   * Eliminar una sala (solo creador)
   */
  async deleteRoom(roomId: string): Promise<void> {
    try {
      if (USE_MOCK) {
        console.log('Mock: Deleted room', roomId);
        return;
      }
      await apiClient.delete(`/rooms/${roomId}`);
    } catch (error) {
      console.error('Error deleting room:', error);
      throw error;
    }
  }

  // ============ MOCK DATA PARA DESARROLLO ============

  private mockCreateRoom(dto: CreateRoomDto): Room {
    const inviteCode = this.generateInviteCode();
    return {
      id: `room-${Date.now()}`,
      name: dto.name,
      creatorId: 'mock-user-id',
      filters: dto.filters,
      masterList: [],
      inviteCode,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private mockGetUserRooms(): RoomSummary[] {
    return [
      {
        id: 'room-1',
        name: 'Noche de películas',
        creatorId: 'mock-user-id',
        memberCount: 3,
        matchCount: 5,
        isActive: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'room-2',
        name: 'Series con amigos',
        creatorId: 'other-user',
        memberCount: 4,
        matchCount: 2,
        isActive: true,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: 'room-3',
        name: 'Documentales',
        creatorId: 'mock-user-id',
        memberCount: 2,
        matchCount: 8,
        isActive: true,
        createdAt: new Date(Date.now() - 259200000).toISOString(),
      },
    ];
  }

  private mockGetRoomDetails(roomId: string): Promise<RoomDetails> {
    return Promise.resolve({
      room: {
        id: roomId,
        name: 'Noche de películas',
        creatorId: 'mock-user-id',
        filters: {
          genres: [28, 12],
          platforms: ['netflix', 'prime'],
          contentType: 'movie',
        },
        masterList: ['550', '551', '552', '553', '554'],
        inviteCode: 'ABC123',
        isActive: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      members: [
        {
          userId: 'mock-user-id',
          role: 'creator',
          status: 'active',
          joinedAt: new Date(Date.now() - 86400000).toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
        {
          userId: 'user-2',
          role: 'member',
          status: 'active',
          joinedAt: new Date(Date.now() - 43200000).toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
        {
          userId: 'user-3',
          role: 'member',
          status: 'inactive',
          joinedAt: new Date(Date.now() - 21600000).toISOString(),
          lastActivityAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      matchCount: 5,
      userRole: 'creator',
    });
  }

  private mockGetRoomStats(): RoomStats {
    return {
      totalMembers: 3,
      activeMembers: 2,
      totalMatches: 5,
      averageProgress: 45,
    };
  }

  private mockJoinRoom(inviteCode: string): Room {
    return {
      id: `room-joined-${Date.now()}`,
      name: `Sala ${inviteCode}`,
      creatorId: 'other-user',
      filters: { contentType: 'all' },
      masterList: [],
      inviteCode,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export const roomService = new RoomService();
