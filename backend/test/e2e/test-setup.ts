import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppModule } from '../../src/app.module';

/**
 * Setup para tests de integración E2E
 * Configura el entorno de testing con base de datos separada
 */
export class E2ETestSetup {
  private static app: INestApplication;
  private static moduleFixture: TestingModule;

  /**
   * Inicializar aplicación para tests E2E
   */
  static async setupApp(): Promise<INestApplication> {
    if (this.app) {
      return this.app;
    }

    // Configurar variables de entorno para testing
    process.env.NODE_ENV = 'test';
    process.env.DYNAMODB_TABLE_NAME = 'trinity-rooms-test';
    process.env.USERS_TABLE = 'trinity-users-test';
    process.env.MOVIES_CACHE_TABLE = 'trinity-movies-cache-test';
    process.env.ANALYTICS_TABLE = 'trinity-analytics-test';
    
    // Configurar timeouts más cortos para testing
    process.env.INACTIVE_MEMBER_TIMEOUT_MINUTES = '1';
    process.env.MEDIA_CACHE_ENABLED = 'true';
    process.env.MEDIA_PREFETCH_ENABLED = 'true';
    process.env.AUTO_REFRESH_ENABLED = 'true';
    process.env.AUTO_REFRESH_THRESHOLD = '0.9';

    this.moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        AppModule,
      ],
    }).compile();

    this.app = this.moduleFixture.createNestApplication();
    
    // Configurar timeouts para tests
    this.app.useGlobalPipes();
    
    await this.app.init();
    return this.app;
  }

  /**
   * Limpiar después de los tests
   */
  static async teardownApp(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
    if (this.moduleFixture) {
      await this.moduleFixture.close();
      this.moduleFixture = null;
    }
  }

  /**
   * Obtener instancia de la aplicación
   */
  static getApp(): INestApplication {
    return this.app;
  }

  /**
   * Limpiar base de datos entre tests
   */
  static async cleanDatabase(): Promise<void> {
    // En un entorno real, aquí limpiaríamos las tablas de test
    // Por ahora, simplemente esperamos un momento para evitar conflictos
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Crear usuario de prueba
   */
  static async createTestUser(): Promise<{
    userId: string;
    email: string;
    token: string;
  }> {
    const testUser = {
      userId: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email: `test-${Date.now()}@trinity.test`,
      token: 'test-jwt-token-' + Math.random().toString(36).substr(2, 9),
    };

    return testUser;
  }

  /**
   * Crear sala de prueba
   */
  static async createTestRoom(userId: string): Promise<{
    roomId: string;
    name: string;
    adminId: string;
  }> {
    const testRoom = {
      roomId: `test-room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Test Room ${Date.now()}`,
      adminId: userId,
    };

    return testRoom;
  }

  /**
   * Generar datos de prueba para TMDB
   */
  static getTestMovieIds(): string[] {
    return [
      '550',    // Fight Club
      '13',     // Forrest Gump  
      '680',    // Pulp Fiction
      '155',    // The Dark Knight
      '497',    // The Green Mile
      '389',    // 12 Angry Men
      '129',    // Spirited Away
      '19404',  // Dilwale Dulhania Le Jayenge
      '372058', // Your Name
      '122',    // The Lord of the Rings: The Return of the King
    ];
  }

  /**
   * Esperar por condición con timeout
   */
  static async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeoutMs: number = 5000,
    intervalMs: number = 100,
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }
}