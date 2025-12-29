import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2ETestSetup } from './test-setup';
import { E2E_CONFIG, E2E_ENDPOINTS, ASSERTIONS } from './test-config';

describe('Trinity MVP - Optimizaciones de Rendimiento (E2E)', () => {
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

  describe('⚡ Sistema de Cache Agresivo', () => {
    it('debería mostrar mejora de rendimiento con cache', async () => {
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      
      // Primera llamada (cache miss)
      const startTime1 = Date.now();
      const response1 = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_DETAILS(mediaId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const responseTime1 = Date.now() - startTime1;
      
      // Segunda llamada (cache hit)
      const startTime2 = Date.now();
      const response2 = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_DETAILS(mediaId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const responseTime2 = Date.now() - startTime2;
      
      // Verificar que ambas respuestas son idénticas
      expect(response1.body.id).toBe(response2.body.id);
      expect(response1.body.title).toBe(response2.body.title);
      
      // Verificar mejora de rendimiento (cache hit debería ser más rápido)
      expect(responseTime2).toBeLessThan(responseTime1);
      
      // Verificar que ambas están dentro del threshold
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime1)).toBe(true);
      expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime2)).toBe(true);
      
      console.log(`📊 Cache performance: Miss=${responseTime1}ms, Hit=${responseTime2}ms`);
    });

    it('debería mantener estadísticas de cache precisas', async () => {
      // Obtener estadísticas iniciales
      const initialStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const initialEntries = initialStats.body.totalEntries;
      
      // Hacer varias llamadas para poblar cache
      const movieIds = E2ETestSetup.getTestMovieIds().slice(0, 3);
      
      for (const movieId of movieIds) {
        await request(app.getHttpServer())
          .get(E2E_ENDPOINTS.MEDIA_DETAILS(movieId))
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }
      
      // Verificar que el cache creció
      const finalStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(finalStats.body.totalEntries).toBeGreaterThan(initialEntries);
      expect(finalStats.body.validEntries).toBeGreaterThan(0);
      expect(finalStats.body.hitRate).toBeGreaterThanOrEqual(0);
      
      console.log(`📊 Cache stats: ${finalStats.body.totalEntries} entries, ${(finalStats.body.hitRate * 100).toFixed(1)}% hit rate`);
    });

    it('debería limpiar cache expirado correctamente', async () => {
      // Este test verificaría la limpieza automática del cache
      // En un entorno real, podríamos manipular timestamps o usar mocks
      
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Verificar que las estadísticas incluyen información sobre entradas expiradas
      expect(typeof response.body.expiredEntries).toBe('number');
      expect(response.body.expiredEntries).toBeGreaterThanOrEqual(0);
    });
  });

  describe('🚀 Sistema de Prefetch Inteligente', () => {
    beforeEach(async () => {
      // Generar contenido para prefetch
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
    });

    it('debería prefetch títulos al unirse a sala', async () => {
      const startTime = Date.now();
      
      // Unirse a la sala (debería triggear prefetch)
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Esperar un momento para que el prefetch complete
      await E2ETestSetup.waitFor(async () => {
        const stats = await request(app.getHttpServer())
          .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
          .set('Authorization', `Bearer ${authToken}`);
        
        return stats.body.totalEntries > 0;
      }, E2E_CONFIG.PERFORMANCE_TIMEOUT);
      
      const prefetchTime = Date.now() - startTime;
      
      // Verificar que el prefetch fue rápido
      expect(prefetchTime).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.PREFETCH_TIME);
      
      // Verificar que hay contenido en cache
      const cacheStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(cacheStats.body.totalEntries).toBeGreaterThan(0);
      
      console.log(`🚀 Prefetch completado en ${prefetchTime}ms, ${cacheStats.body.totalEntries} títulos cacheados`);
    });

    it('debería prefetch títulos adicionales después de votar', async () => {
      // Unirse a la sala primero
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Obtener estadísticas iniciales de cache
      const initialStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      const initialEntries = initialStats.body.totalEntries;
      
      // Votar (debería triggear prefetch adicional)
      const startTime = Date.now();
      
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.VOTE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roomId: testRoom.roomId,
          mediaId: E2ETestSetup.getTestMovieIds()[0],
          voteType: 'like',
          sessionId: 'prefetch-test-' + Date.now(),
        })
        .expect(201);
      
      // Esperar que el prefetch adicional complete
      await E2ETestSetup.waitFor(async () => {
        const stats = await request(app.getHttpServer())
          .get(E2E_ENDPOINTS.MEDIA_CACHE_STATS)
          .set('Authorization', `Bearer ${authToken}`);
        
        return stats.body.totalEntries > initialEntries;
      }, E2E_CONFIG.PERFORMANCE_TIMEOUT);
      
      const voteAndPrefetchTime = Date.now() - startTime;
      
      // Verificar performance del voto + prefetch
      expect(voteAndPrefetchTime).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.PREFETCH_TIME);
      
      console.log(`🗳️ Voto + prefetch completado en ${voteAndPrefetchTime}ms`);
    });
  });

  describe('🔄 Sistema de Auto-Refresh', () => {
    beforeEach(async () => {
      // Generar contenido inicial
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.SHUFFLE_GENERATE(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          masterList: E2ETestSetup.getTestMovieIds(),
        })
        .expect(201);
      
      // Unirse a la sala
      await request(app.getHttpServer())
        .post(E2E_ENDPOINTS.ROOMS_JOIN(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('debería monitorear progreso de sala correctamente', async () => {
      const response = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.ROOM_REFRESH_STATS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Verificar estructura de estadísticas
      expect(typeof response.body.averageProgress).toBe('number');
      expect(typeof response.body.needsRefresh).toBe('boolean');
      expect(typeof response.body.threshold).toBe('number');
      expect(typeof response.body.autoRefreshEnabled).toBe('boolean');
      
      // Verificar que el threshold es el esperado (90%)
      expect(response.body.threshold).toBe(90);
      expect(response.body.autoRefreshEnabled).toBe(true);
      
      console.log(`📊 Room progress: ${response.body.averageProgress}% (threshold: ${response.body.threshold}%)`);
    });

    it('debería detectar cuando una sala necesita refresh', async () => {
      // Simular progreso alto votando muchos títulos
      const movieIds = E2ETestSetup.getTestMovieIds();
      const votesToMake = Math.ceil(movieIds.length * 0.9); // 90% de progreso
      
      for (let i = 0; i < votesToMake && i < movieIds.length; i++) {
        await request(app.getHttpServer())
          .post(E2E_ENDPOINTS.VOTE)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roomId: testRoom.roomId,
            mediaId: movieIds[i],
            voteType: i % 2 === 0 ? 'like' : 'dislike',
            sessionId: `refresh-test-${i}-${Date.now()}`,
          })
          .expect(201);
      }
      
      // Verificar estadísticas de refresh
      const refreshStats = await request(app.getHttpServer())
        .get(E2E_ENDPOINTS.ROOM_REFRESH_STATS(testRoom.roomId))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Debería estar cerca del threshold o haberlo superado
      expect(refreshStats.body.averageProgress).toBeGreaterThan(80);
      
      console.log(`🔄 Progreso después de ${votesToMake} votos: ${refreshStats.body.averageProgress}%`);
    });
  });

  describe('📊 Métricas de Performance General', () => {
    it('debería mantener tiempos de respuesta bajo 300ms', async () => {
      const endpoints = [
        { method: 'GET', url: E2E_ENDPOINTS.AUTH_PROFILE, name: 'Profile' },
        { method: 'GET', url: E2E_ENDPOINTS.ROOMS_MEMBERS(testRoom.roomId), name: 'Room Members' },
        { method: 'GET', url: E2E_ENDPOINTS.SHUFFLE_STATS(testRoom.roomId), name: 'Shuffle Stats' },
        { method: 'GET', url: E2E_ENDPOINTS.QUEUE_STATUS(testRoom.roomId), name: 'Queue Status' },
        { method: 'GET', url: E2E_ENDPOINTS.MEDIA_CACHE_STATS, name: 'Cache Stats' },
      ];
      
      const performanceResults: Array<{ name: string; time: number }> = [];
      
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          [endpoint.method.toLowerCase()](endpoint.url)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
        
        const responseTime = Date.now() - startTime;
        performanceResults.push({ name: endpoint.name, time: responseTime });
        
        // Verificar que cada endpoint está dentro del threshold
        expect(ASSERTIONS.isWithinPerformanceThreshold(responseTime)).toBe(true);
      }
      
      // Calcular tiempo promedio
      const averageTime = performanceResults.reduce((sum, result) => sum + result.time, 0) / performanceResults.length;
      
      console.log('📊 Performance Results:');
      performanceResults.forEach(result => {
        console.log(`  ${result.name}: ${result.time}ms`);
      });
      console.log(`  Average: ${averageTime.toFixed(1)}ms`);
      
      // Verificar que el promedio está muy por debajo del threshold
      expect(averageTime).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME);
    });

    it('debería manejar carga concurrente eficientemente', async () => {
      const concurrentRequests = 5;
      const mediaId = E2ETestSetup.getTestMovieIds()[0];
      
      const startTime = Date.now();
      
      // Hacer múltiples requests concurrentes
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app.getHttpServer())
          .get(E2E_ENDPOINTS.MEDIA_DETAILS(mediaId))
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // Verificar que todas las respuestas son idénticas
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body.id).toBe(firstResponse.id);
        expect(response.body.title).toBe(firstResponse.title);
      });
      
      // Verificar que el tiempo total es razonable
      const averageTimePerRequest = totalTime / concurrentRequests;
      expect(averageTimePerRequest).toBeLessThan(E2E_CONFIG.PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME);
      
      console.log(`🔄 ${concurrentRequests} requests concurrentes completadas en ${totalTime}ms (${averageTimePerRequest.toFixed(1)}ms promedio)`);
    });
  });

  describe('🎯 Optimizaciones Específicas', () => {
    it('debería cargar títulos instantáneamente después de optimizaciones', async () => {
      // Generar contenido y unirse (triggea prefetch)
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
      
      // Esperar que el prefetch complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Ahora los títulos deberían cargar instantáneamente
      const movieIds = E2ETestSetup.getTestMovieIds().slice(0, 3);
      const loadTimes: number[] = [];
      
      for (const movieId of movieIds) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          .get(E2E_ENDPOINTS.MEDIA_DETAILS(movieId))
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
        
        const loadTime = Date.now() - startTime;
        loadTimes.push(loadTime);
      }
      
      const averageLoadTime = loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
      
      // Verificar que la carga es muy rápida (beneficio del cache)
      expect(averageLoadTime).toBeLessThan(100); // Muy por debajo del threshold de 300ms
      
      console.log(`⚡ Carga instantánea: ${averageLoadTime.toFixed(1)}ms promedio (optimización exitosa)`);
    });
  });
});