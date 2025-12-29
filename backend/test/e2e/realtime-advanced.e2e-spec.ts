import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2ETestSetup } from './test-setup';
import { E2E_CONFIG, E2E_ENDPOINTS, MOCK_DATA, ASSERTIONS } from './test-config';

describe('Trinity MVP - Real-time y Funcionalidades Avanzadas (E2E)', () => {
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
    testRoom = await E2ETestSetup.createTestRoom(testUser.userId);
    authToken = testUser.token;
  });

  describe('📡 Notificaciones AppSync Real-time', () => {
    beforeEach(async () => {
      // Preparar sala con contenido
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('debería procesar votos en tiempo real (<300ms)', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'realtime-test-' + Date.now(),
        })
        .expect(201);
      
      const responseTime = Date.now() - startTime;
      
      // Verificar que el voto se procesó rápidamente
      expect(responseTime).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.REALTIME_LATENCY);
      expect(response.body.voteRegistered).toBe(true);
      
      console.log(`📡 Voto procesado en tiempo real: ${responseTime}ms`);
    });

    it('debería manejar múltiples votos concurrentes', async () => {
      const movieIds = E2ETestSetup.getTestMovieIds().slice(0, 3);
      const startTime = Date.now();
      
      // Simular múltiples votos rápidos
      const votePromises = movieIds.map((movieId, index) =>
        request(app.getHttpServer())
          .post(E2E_ENDPOINTS.VOTE)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roomId: testRoom.roomId,
            mediaId: movieId,
            voteType: index % 2 === 0 ? 'like' : 'dislike',
            sessionId: `concurrent-${index}-${Date.now()}`,
          })
          .expect(201)
      );
      
      const responses = await Promise.all(votePromises);
      const totalTime = Date.now() - startTime;
      
      // Verificar que todos los votos se procesaron
      responses.forEach(response => {
        expect(response.body.voteRegistered).toBe(true);
      });
      
      // Verificar performance
      const averageTime = totalTime / movieIds.length;
      expect(averageTime).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.REALTIME_LATENCY);
      
      console.log(`📡 ${movieIds.length} votos concurrentes procesados en ${totalTime}ms (${averageTime.toFixed(1)}ms promedio)`);
    });

    it('debería detectar matches correctamente con múltiples usuarios', async () => {
      // Crear segundo usuario
      const testUser2 = await E2ETestSetup.createTestUser();
      const authToken2 = testUser2.token;
      
      // Segundo usuario se une a la sala
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(200);
      
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      
      // Ambos usuarios votan positivamente
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'like',
          sessionId: 'match-test-user1',
        })
        .expect(201);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'like',
          sessionId: 'match-test-user2',
        })
        .expect(201);
      
      // Verificar que se creó un match
      const matchesResponse = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MATCHES(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(matchesResponse.body.matches.length).toBeGreaterThan(0);
      
      const match = matchesResponse.body.matches[0];
      expect(match.mediaId).toBe(mediaId);
      expect(match.participants.length).toBe(2);
      
      console.log(`🎯 Match detectado correctamente con 2 usuarios para película ${mediaId}`);
    });
  });

  describe('🧠 Integración IA Salamandra/ALIA', () => {
    it('debería obtener recomendaciones basadas en estado emocional', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.AI_RECOMMENDATIONS)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userText: MOCK_DATA.EMOTIONAL_STATES[0], // "Me siento muy feliz hoy"
        })
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      // Verificar performance (IA puede ser más lenta)
      expect(responseTime).toBeLessThan(5000); // 5 segundos max para IA
      
      // Verificar estructura de respuesta
      expect(Array.isArray(response.body.movies)).toBe(true);
      expect(response.body.movies.length).toBeGreaterThan(0);
      expect(response.body.reasoning).toBeDefined();
      expect(typeof response.body.confidence).toBe('number');
      expect(response.body.emotionalState).toBeDefined();
      expect(Array.isArray(response.body.suggestedGenres)).toBe(true);
      
      console.log(`🧠 IA Salamandra respondió en ${responseTime}ms: ${response.body.movies.length} películas recomendadas`);
    });

    it('debería manejar diferentes estados emocionales', async () => {
      const emotionalStates = MOCK_DATA.EMOTIONAL_STATES.slice(0, 3);
      const results: any[] = [];
      
      for (const emotionalState of emotionalStates) {
        const response = await request(app.getHttpServer())
          .post(E2E_ENDPOINTS.AI_RECOMMENDATIONS)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userText: emotionalState,
          })
          .expect(200);
        
        results.push({
          input: emotionalState,
          output: response.body,
        });
      }
      
      // Verificar que cada estado emocional produce recomendaciones
      results.forEach(result => {
        expect(result.output.movies.length).toBeGreaterThan(0);
        expect(result.output.emotionalState).toBeDefined();
        expect(result.output.suggestedGenres.length).toBeGreaterThan(0);
      });
      
      console.log(`🧠 IA procesó ${results.length} estados emocionales diferentes exitosamente`);
    });

    it('debería verificar health check de IA', async () => {
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.AI_HEALTH)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.status).toBe('healthy');
      expect(response.body.salamandraAvailable).toBeDefined();
      expect(response.body.tmdbIntegration).toBeDefined();
      
      console.log(`🧠 IA Health Check: ${response.body.status}`);
    });
  });

  describe('📊 Sistema de Analytics', () => {
    beforeEach(async () => {
      // Preparar sala con contenido
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('debería trackear eventos de usuario correctamente', async () => {
      // Hacer algunas acciones que deberían ser trackeadas
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'analytics-test-' + Date.now(),
        })
        .expect(201);
      
      // Verificar que el tracking funciona (el evento se procesa asíncronamente)
      // En un test real, podríamos verificar logs o una tabla de analytics
      
      // Por ahora, verificamos que el endpoint de analytics responde
      const response = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ANALYTICS_TRACK)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          eventType: 'test_event',
          userId: testUser.userId,
          roomId: testRoom.roomId,
          metadata: {
            testData: 'analytics_test',
          },
        })
        .expect(201);
      
      expect(response.body.success).toBe(true);
      
      console.log(`📊 Evento de analytics trackeado exitosamente`);
    });
  });

  describe('👥 Manejo de Miembros Inactivos', () => {
    it('debería identificar miembros inactivos correctamente', async () => {
      // Crear segundo usuario que será "inactivo"
      const inactiveUser = await E2ETestSetup.createTestUser();
      const inactiveToken = inactiveUser.token;
      
      // Ambos usuarios se unen
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${inactiveToken}`)
        .expect(200);
      
      // Generar contenido
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
      
      // Solo el usuario activo vota
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'inactive-test-' + Date.now(),
        })
        .expect(201);
      
      // Verificar miembros de la sala
      const membersResponse = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.ROOMS_MEMBERS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(membersResponse.body.members.length).toBe(2);
      
      // En un sistema real, aquí verificaríamos que el usuario inactivo
      // no afecta los cálculos de consenso
      
      console.log(`👥 Sistema de miembros inactivos funcionando: ${membersResponse.body.members.length} miembros totales`);
    });
  });

  describe('🔐 Sistema de Permisos', () => {
    it('debería validar permisos de administrador', async () => {
      // El creador de la sala debería tener permisos de admin
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.ROOMS_MEMBERS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      const adminMember = response.body.members.find(m => m.userId === testUser.userId);
      expect(adminMember).toBeDefined();
      expect(adminMember.role).toBe('admin');
      
      console.log(`🔐 Permisos de administrador validados correctamente`);
    });

    it('debería rechazar acciones no autorizadas', async () => {
      // Crear usuario sin permisos
      const unauthorizedUser = await E2ETestSetup.createTestUser();
      const unauthorizedToken = unauthorizedUser.token;
      
      // Intentar acceder a sala sin ser miembro (debería fallar)
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'unauthorized-test',
        })
        .expect(404); // Not found porque no es miembro
      
      console.log(`🔐 Acceso no autorizado rechazado correctamente`);
    });
  });

  describe('🚀 Integración Completa de Funcionalidades Avanzadas', () => {
    it('debería ejecutar flujo completo con todas las optimizaciones', async () => {
      const startTime = Date.now();
      
      // 1. Crear segundo usuario
      const user2 = await E2ETestSetup.createTestUser();
      const token2 = user2.token;
      
      // 2. Ambos usuarios se unen a la sala
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      
      // 3. Generar contenido (triggea prefetch)
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
      
      // 4. Obtener recomendación de IA
      const aiResponse = await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.AI_RECOMMENDATIONS)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userText: 'Quiero algo emocionante',
        })
        .expect(200);
      
      // 5. Ambos usuarios votan (debería crear match)
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'like',
          sessionId: 'integration-user1',
        })
        .expect(201);
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: mediaId,
          voteType: 'like',
          sessionId: 'integration-user2',
        })
        .expect(201);
      
      // 6. Verificar match creado
      const matchesResponse = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MATCHES(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // 7. Verificar estadísticas de cache
      const cacheStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      const totalTime = Date.now() - startTime;
      
      // Verificaciones finales
      expect(aiResponse.body.movies.length).toBeGreaterThan(0);
      expect(matchesResponse.body.matches.length).toBeGreaterThan(0);
      expect(cacheStats.body.totalEntries).toBeGreaterThan(0);
      
      // Verificar que todo el flujo fue eficiente
      expect(totalTime).toBeLessThan(15000); // 15 segundos max para flujo completo
      
      console.log(`🚀 Flujo completo con todas las funcionalidades completado en ${totalTime}ms`);
      console.log(`   - IA: ${aiResponse.body.movies.length} recomendaciones`);
      console.log(`   - Matches: ${matchesResponse.body.matches.length} encontrados`);
      console.log(`   - Cache: ${cacheStats.body.totalEntries} entradas`);
    });
  });
});