/**
 * Configuración para tests E2E
 */
export const E2E_CONFIG = {
  // Timeouts
  DEFAULT_TIMEOUT: 10000,
  PERFORMANCE_TIMEOUT: 5000,
  REALTIME_TIMEOUT: 3000,
  
  // Performance expectations
  PERFORMANCE_THRESHOLDS: {
    API_RESPONSE_TIME: 300, // ms
    CACHE_HIT_RATE: 0.85,   // 85%
    PREFETCH_TIME: 1000,    // ms
    REALTIME_LATENCY: 300,  // ms
  },
  
  // Test data
  TEST_ROOM_SIZE: 10, // Smaller for faster tests
  TEST_PREFETCH_SIZE: 5,
  TEST_AUTO_REFRESH_THRESHOLD: 0.9,
  
  // Mock configurations
  MOCK_TMDB_RESPONSES: true,
  MOCK_HUGGING_FACE: true,
  MOCK_APPSYNC: false, // Test real AppSync integration
  
  // Database
  USE_TEST_TABLES: true,
  CLEANUP_AFTER_TESTS: true,
  
  // Logging
  LOG_LEVEL: 'error', // Reduce noise during tests
  LOG_PERFORMANCE_METRICS: true,
};

/**
 * URLs y endpoints para testing (sin prefijo /api)
 */
export const E2E_ENDPOINTS = {
  // Base
  ROOT: '/',
  
  // Auth
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGIN: '/auth/login',
  AUTH_PROFILE: '/auth/profile',
  
  // Rooms
  ROOMS_CREATE: '/rooms',
  ROOMS_JOIN: (roomId: string) => `/rooms/${roomId}/join`,
  ROOMS_MEMBERS: (roomId: string) => `/rooms/${roomId}/members`,
  
  // Shuffle & Sync
  SHUFFLE_GENERATE: (roomId: string) => `/rooms/${roomId}/shuffle-sync/generate`,
  SHUFFLE_STATS: (roomId: string) => `/rooms/${roomId}/shuffle-sync/stats`,
  
  // Interactions
  VOTE: '/interactions/vote',
  QUEUE_STATUS: (roomId: string) => `/interactions/${roomId}/queue-status`,
  
  // Matches
  MATCHES: (roomId: string) => `/matches/${roomId}`,
  
  // Media
  MEDIA_DETAILS: (mediaId: string) => `/media/${mediaId}`,
  MEDIA_CACHE_STATS: '/media/cache-stats',
  
  // AI
  AI_RECOMMENDATIONS: '/ai/chat-recommendations',
  AI_HEALTH: '/ai/health',
  
  // Analytics
  ANALYTICS_TRACK: '/analytics/track',
  
  // Room Refresh
  ROOM_REFRESH_STATS: (roomId: string) => `/rooms/${roomId}/refresh-stats`,
};

/**
 * Datos de prueba mock
 */
export const MOCK_DATA = {
  // Usuario de prueba
  TEST_USER: {
    email: 'test@trinity.test',
    password: 'TestPassword123!',
    name: 'Test User',
  },
  
  // Sala de prueba
  TEST_ROOM: {
    name: 'Test Room E2E',
    description: 'Room for E2E testing',
    maxMembers: 10,
    filters: {
      genres: ['Action', 'Comedy'],
      releaseYearFrom: 2000,
      releaseYearTo: 2024,
      minRating: 7.0,
    },
  },
  
  // Respuestas mock de TMDB
  TMDB_MOVIE_RESPONSE: {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac...',
    release_date: '1999-10-15',
    vote_average: 8.4,
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    backdrop_path: '/fCayJrkfRaCRCTh8GqN30f8oyQF.jpg',
    genre_ids: [18, 53],
  },
  
  // Respuesta mock de Salamandra
  SALAMANDRA_RESPONSE: {
    movies: ['19404', '9806', '105'],
    reasoning: 'Salamandra recomienda Comedia, Animación basado en tu estado emocional.',
    confidence: 0.85,
    emotionalState: 'happy',
    suggestedGenres: ['Comedia', 'Animación', 'Familiar'],
  },
  
  // Estados emocionales para testing
  EMOTIONAL_STATES: [
    'Me siento muy feliz hoy',
    'Estoy un poco triste',
    'Me siento estresado por el trabajo',
    'Quiero algo emocionante',
    'Necesito algo relajante',
  ],
};

/**
 * Utilidades para assertions
 */
export const ASSERTIONS = {
  // Verificar estructura de respuesta
  isValidApiResponse: (response: any) => {
    return response && 
           typeof response === 'object' && 
           response.hasOwnProperty('statusCode') !== false;
  },
  
  // Verificar tiempo de respuesta
  isWithinPerformanceThreshold: (responseTime: number, threshold: number = E2E_CONFIG.PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME) => {
    return responseTime <= threshold;
  },
  
  // Verificar estructura de usuario
  isValidUser: (user: any) => {
    return user && 
           user.userId && 
           user.email && 
           typeof user.userId === 'string' &&
           typeof user.email === 'string';
  },
  
  // Verificar estructura de sala
  isValidRoom: (room: any) => {
    return room && 
           room.roomId && 
           room.name && 
           room.adminId &&
           typeof room.roomId === 'string';
  },
  
  // Verificar estructura de voto
  isValidVote: (vote: any) => {
    return vote && 
           vote.userId && 
           vote.mediaId && 
           vote.voteType &&
           ['like', 'dislike'].includes(vote.voteType);
  },
  
  // Verificar estructura de match
  isValidMatch: (match: any) => {
    return match && 
           match.roomId && 
           match.mediaId && 
           match.matchType &&
           Array.isArray(match.participants);
  },
};