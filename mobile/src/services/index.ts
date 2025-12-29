// Exportar todos los servicios
export { apiClient } from './apiClient';
export { authService } from './authService';
export { mediaService } from './mediaService';
export { roomService } from './roomService';
export { voteService } from './voteService';
export { matchService } from './matchService';
export { aiService } from './aiService';

// Re-exportar tipos
export type {
  ContentFilters,
  CreateRoomDto,
  Room,
  RoomSummary,
  RoomMember,
  RoomDetails,
  RoomStats,
  NextMediaResponse,
  MemberProgress,
} from './roomService';

export type {
  VoteType,
  CreateVoteDto,
  VoteResponse,
  QueueStatus,
  MediaVotes,
  ConsensusResult,
  RoomVoteStats,
  VoteHistoryItem,
  SwipeSession,
} from './voteService';

export type {
  Match,
  MatchLibrary,
  MatchStats,
  MatchDetectionResult,
  PendingMatchResult,
} from './matchService';

export type { TriniResponse } from './aiService';
