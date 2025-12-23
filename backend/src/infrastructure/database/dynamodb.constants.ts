/**
 * Constantes para el diseño de tabla única de DynamoDB
 * Siguiendo el patrón Single Table Design para optimizar costos
 */

// Prefijos para Partition Keys (PK)
export const PK_PREFIXES = {
  USER: 'USER#',
  ROOM: 'ROOM#',
  MEDIA: 'MEDIA#',
} as const;

// Prefijos para Sort Keys (SK)
export const SK_PREFIXES = {
  PROFILE: 'PROFILE',
  METADATA: 'METADATA',
  MEMBER: 'MEMBER#',
  VOTE: 'VOTE#',
  MATCH: 'MATCH#',
} as const;

// Prefijos para GSI1 (Global Secondary Index 1)
export const GSI1_PREFIXES = {
  USER_EMAIL: 'USER#',
  ROOM_CREATOR: 'ROOM#',
  MEDIA_GENRE: 'GENRE#',
  MEDIA_POPULARITY: 'POPULARITY#',
  VOTE_MEDIA: 'MEDIA#',
  MATCH_ROOM: 'MATCH#',
} as const;

// Nombres de índices
export const INDEXES = {
  GSI1: 'GSI1',
} as const;

/**
 * Funciones helper para generar keys consistentes
 */
export class DynamoDBKeys {
  // User keys
  static userPK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static userSK(): string {
    return SK_PREFIXES.PROFILE;
  }

  static userGSI1PK(email: string): string {
    return `${GSI1_PREFIXES.USER_EMAIL}${email}`;
  }

  // Room keys
  static roomPK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  static roomSK(): string {
    return SK_PREFIXES.METADATA;
  }

  static roomGSI1PK(creatorId: string): string {
    return `${GSI1_PREFIXES.ROOM_CREATOR}${creatorId}`;
  }

  static roomGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }

  // Member keys
  static memberSK(userId: string): string {
    return `${SK_PREFIXES.MEMBER}${userId}`;
  }

  static memberGSI1PK(userId: string): string {
    return `${PK_PREFIXES.USER}${userId}`;
  }

  static memberGSI1SK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  // Media keys
  static mediaPK(tmdbId: string): string {
    return `${PK_PREFIXES.MEDIA}${tmdbId}`;
  }

  static mediaSK(): string {
    return SK_PREFIXES.METADATA;
  }

  static mediaGSI1PK(genre: string): string {
    return `${GSI1_PREFIXES.MEDIA_GENRE}${genre}`;
  }

  static mediaGSI1SK(popularity: number): string {
    // Padding para ordenamiento correcto
    const paddedPopularity = popularity.toString().padStart(10, '0');
    return `${GSI1_PREFIXES.MEDIA_POPULARITY}${paddedPopularity}`;
  }

  // Vote keys
  static voteSK(userId: string, mediaId: string): string {
    return `${SK_PREFIXES.VOTE}${userId}#${mediaId}`;
  }

  static voteGSI1PK(mediaId: string): string {
    return `${PK_PREFIXES.MEDIA}${mediaId}`;
  }

  static voteGSI1SK(roomId: string): string {
    return `${PK_PREFIXES.ROOM}${roomId}`;
  }

  // Match keys
  static matchSK(mediaId: string): string {
    return `${SK_PREFIXES.MATCH}${mediaId}`;
  }

  static matchGSI1PK(roomId: string): string {
    return `${GSI1_PREFIXES.MATCH_ROOM}${roomId}`;
  }

  static matchGSI1SK(timestamp: string): string {
    return `CREATED#${timestamp}`;
  }
}