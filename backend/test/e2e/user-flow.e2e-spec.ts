import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2ETestSetup } from './test-setup';
import { E2E_CONFIG, E2E_ENDPOINTS, MOCK_DATA, ASSERTIONS } from './test-config';

describe('Trinity MVP - Flujo Completo de Usuario (E2E)', () => {
  let app: INestApplication;
  let testUser: any;
  let testRoom: any;
  let authToken: string;

  beforeAll(async () => {
    app = await E2ETestSetup.setupApp();
  }, E2E_CONFIG.DEFAULT_TIMEOUT);

  afterAll(async () => {
    await E2ETestSetup.teardownApp();
  });

  beforeEach(async () => {
    await E2ETestSetup.cleanDatabase();
    testUser = await E2ETestSetup.createTestUser();
    authToken = testUser.token;
  });

  describe('🔐 Autenticación y Registro', () => {
    it('debería permitir registro de usuario', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.AUTH_REGISTER)
        .send({
          email: testUser.email,
          password: MOCK_DATA.TEST_USER.password,
          name: MOCK_DATA.TEST_USER.name,
        })
        .expect(201);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura de respuesta
      expect(ASSERTIONS.isValidUser(response.body.user)).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
    });

    it('debería permitir login de usuario', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.AUTH_LOGIN)
        .send({
          email: testUser.email,
          password: MOCK_DATA.TEST_USER.password,
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar respuesta
      expect(response.body.token).toBeDefined();
      expect(ASSERTIONS.isValidUser(response.body.user)).toBe(true);
    });

    it('debería obtener perfil de usuario autenticado', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.AUTH_PROFILE)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(ASSERTIONS.isValidUser(response.body)).toBe(true);
    });
  });

  describe('🏠 Gestión de Salas', () => {
    it('debería crear una sala correctamente', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send(MOCK_DATA.TEST_ROOM)
        .expect(201);

      const responseTime = Date.now() - startTime;
      testRoom = response.body;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura de sala
      expect(ASSERTIONS.isValidRoom(testRoom)).toBe(true);
      expect(testRoom.adminId).toBe(testUser.userId);
      expect(testRoom.name).toBe(MOCK_DATA.TEST_ROOM.name);
    });

    it('debería unirse a una sala existente', async () => {
      // Primero crear la sala
      testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
      
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar que el usuario es ahora miembro
      expect(response.body.success).toBe(true);
      expect(response.body.member).toBeDefined();
      expect(response.body.member.userId).toBe(testUser.userId);
    });

    it('debería obtener lista de miembros de la sala', async () => {
      testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
      
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.ROOMS_MEMBERS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(Array.isArray(response.body.members)).toBe(true);
      expect(response.body.members.length).toBeGreaterThan(0);
    });
  });

  describe('🔀 Sistema Shuffle & Sync', () => {
    beforeEach(async () => {
      testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
    });

    it('debería generar listas Shuffle & Sync correctamente', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(response.body.success).toBe(true);
      expect(response.body.masterListSize).toBe(E2ETestSetup.getTestMovieIds().length);
      expect(response.body.membersUpdated).toBeGreaterThan(0);
    });

    it('debería obtener estadísticas de Shuffle & Sync', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.SHUFFLE_STATS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(response.body.roomId).toBe(testRoom.roomId);
      expect(typeof response.body.totalMembers).toBe('number');
      expect(typeof response.body.averageProgress).toBe('number');
    });
  });

  describe('🗳️ Sistema de Votación', () => {
    beforeEach(async () => {
      testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
      
      // Generar contenido para votar
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        });
    });

    it('debería registrar un voto correctamente', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'test-session-' + Date.now(),
        })
        .expect(201);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(response.body.voteRegistered).toBe(true);
      expect(response.body.currentProgress).toBeDefined();
      expect(typeof response.body.currentProgress.progressPercentage).toBe('number');
    });

    it('debería obtener estado de cola del usuario', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.QUEUE_STATUS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(response.body.userId).toBe(testUser.userId);
      expect(response.body.roomId).toBe(testRoom.roomId);
      expect(typeof response.body.hasNext).toBe('boolean');
      expect(response.body.progress).toBeDefined();
    });

    it('debería prevenir votos duplicados', async () => {
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      
      // Primer voto
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'like',
          sessionId: 'test-session-1',
        })
        .expect(201);

      // Segundo voto (debería fallar)
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'dislike',
          sessionId: 'test-session-2',
        })
        .expect(400);
    });
  });

  describe('🎯 Sistema de Matches', () => {
    beforeEach(async () => {
      testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
      
      // Generar contenido
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        });
    });

    it('debería obtener matches de una sala', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MATCHES(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(Array.isArray(response.body.matches)).toBe(true);
      expect(response.body.roomId).toBe(testRoom.roomId);
    });

    it('NO debería crear match con un solo usuario', async () => {
      // Votar positivamente
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'test-session-solo',
        })
        .expect(201);

      // Verificar que no se creó match
      const matchesResponse = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MATCHES(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(matchesResponse.body.matches.length).toBe(0);
    });
  });

  describe('🎬 Integración con TMDB', () => {
    it('debería obtener detalles de película', async () => {
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_DETAILS(mediaId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(response.body.id).toBe(mediaId);
      expect(response.body.title).toBeDefined();
      expect(response.body.overview).toBeDefined();
    });

    it('debería obtener estadísticas de cache', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Verificar performance
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      
      // Verificar estructura
      expect(typeof response.body.totalEntries).toBe('number');
      expect(typeof response.body.validEntries).toBe('number');
      expect(typeof response.body.hitRate).toBe('number');
    });
  });

  describe('🔄 Flujo Completo End-to-End', () => {
    it('debería completar flujo completo: registro → sala → contenido → voto', async () => {
      const startTime = Date.now();
      
      // 1. Registro de usuario
      const registerResponse = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.AUTH_REGISTER)
        .send({
          email: `e2e-${Date.now()}@trinity.test`,
          password: MOCK_DATA.TEST_USER.password,
          name: 'E2E Test User',
        })
        .expect(201);

      const userToken = registerResponse.body.token;
      
      // 2. Creación de sala
      const roomResponse = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_CREATE)
        .set('Authorization', `Bearer ${userToken}`)
        .send(MOCK_DATA.TEST_ROOM)
        .expect(201);

      const room = roomResponse.body;
      
      // 3. Generación de contenido
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(room.roomId))
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);

      // 4. Votación
      const voteResponse = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roomId: room.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'e2e-session-' + Date.now(),
        })
        .expect(201);

      // 5. Verificar progreso
      const queueResponse = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.QUEUE_STATUS(room.roomId))
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const totalTime = Date.now() - startTime;
      
      // Verificar que el flujo completo es rápido
      expect(totalTime).toBeLessThan(E2E_CONFIG.DEFAULT_TIMEOUT);
      
      // Verificar que todo funcionó
      expect(voteResponse.body.voteRegistered).toBe(true);
      expect(queueResponse.body.progress.progressPercentage).toBeGreaterThan(0);
      
      console.log(`✅ Flujo completo E2E completado en ${totalTime}ms`);
    });
  });
});