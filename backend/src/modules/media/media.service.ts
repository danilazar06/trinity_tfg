import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { TMDBService } from '../../infrastructure/tmdb/tmdb.service';
import { CircuitBreakerService } from '../../infrastructure/circuit-breaker/circuit-breaker.service';
import {
  MediaItem,
  TMDBSearchFilters,
} from '../../domain/entities/media.entity';
import { ContentFilters } from '../../domain/entities/room.entity';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly CIRCUIT_NAME = 'tmdb-api';
  private readonly CACHE_TTL_HOURS = 24; // TTL para caché de contenido

  constructor(
    private dynamoDBService: DynamoDBService,
    private tmdbService: TMDBService,
    private circuitBreakerService: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    // Inicializar TMDB y poblar caché inicial
    await this.initializeService();
  }

  /**
   * Inicializar servicio y caché
   */
  private async initializeService(): Promise<void> {
    try {
      await this.tmdbService.initialize();
      await this.populateInitialCache();
      this.logger.log('MediaService initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize MediaService: ${error.message}`);
    }
  }

  /**
   * Obtener contenido con filtros (con Circuit Breaker y fallback)
   */
  async fetchMovies(filters: ContentFilters): Promise<MediaItem[]> {
    const tmdbFilters = this.convertToTMDBFilters(filters);

    return this.circuitBreakerService.execute(
      this.CIRCUIT_NAME,
      // Operación principal: TMDB API
      async () => {
        const results = await this.tmdbService.discoverContent(tmdbFilters);
        
        // Cachear resultados exitosos
        await this.cacheMediaItems(results);
        
        this.logger.log(`Fetched ${results.length} movies from TMDB`);
        return results;
      },
      // Fallback: Shadow Database
      async () => {
        const cachedResults = await this.getCachedContent(filters);
        this.logger.warn(`Using cached content, returned ${cachedResults.length} items`);
        return cachedResults;
      }
    );
  }

  /**
   * Obtener detalles de un elemento multimedia específico
   */
  async getMediaDetails(tmdbId: string): Promise<MediaItem | null> {
    return this.circuitBreakerService.execute(
      `${this.CIRCUIT_NAME}-details`,
      // Operación principal: TMDB API
      async () => {
        const tmdbMovie = await this.tmdbService.getMovieDetails(tmdbId);
        const mediaItem = this.tmdbService.convertToMediaItem(tmdbMovie);
        
        // Cachear el resultado
        await this.cacheMediaItem(mediaItem);
        
        return mediaItem;
      },
      // Fallback: Shadow Database
      async () => {
        return this.getCachedMediaItem(tmdbId);
      }
    );
  }

  /**
   * Obtener contenido popular para llenar caché
   */
  async getPopularContent(page: number = 1): Promise<MediaItem[]> {
    return this.circuitBreakerService.execute(
      `${this.CIRCUIT_NAME}-popular`,
      // Operación principal: TMDB API
      async () => {
        const response = await this.tmdbService.getPopularMovies(page);
        const mediaItems = response.results.map(movie => 
          this.tmdbService.convertToMediaItem(movie)
        );
        
        // Cachear contenido popular
        await this.cacheMediaItems(mediaItems, true);
        
        return mediaItems;
      },
      // Fallback: Contenido popular cacheado
      async () => {
        return this.getPopularCachedContent();
      }
    );
  }

  /**
   * Buscar contenido por texto
   */
  async searchContent(query: string, page: number = 1): Promise<MediaItem[]> {
    if (!query.trim()) {
      return [];
    }

    return this.circuitBreakerService.execute(
      `${this.CIRCUIT_NAME}-search`,
      // Operación principal: TMDB API
      async () => {
        const response = await this.tmdbService.searchMovies({ query, page });
        const mediaItems = response.results.map(movie => 
          this.tmdbService.convertToMediaItem(movie)
        );
        
        // Cachear resultados de búsqueda
        await this.cacheMediaItems(mediaItems);
        
        return mediaItems;
      },
      // Fallback: Búsqueda en caché local
      async () => {
        return this.searchCachedContent(query);
      }
    );
  }

  /**
   * Cachear un elemento multimedia
   */
  private async cacheMediaItem(mediaItem: MediaItem, isPopular: boolean = false): Promise<void> {
    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.mediaPK(mediaItem.tmdbId),
        SK: DynamoDBKeys.mediaSK(),
        GSI1PK: DynamoDBKeys.mediaGSI1PK(mediaItem.genres[0] || 'unknown'),
        GSI1SK: DynamoDBKeys.mediaGSI1SK(mediaItem.popularity),
        ...mediaItem,
        isPopular,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error caching media item ${mediaItem.tmdbId}: ${error.message}`);
    }
  }

  /**
   * Cachear múltiples elementos multimedia
   */
  private async cacheMediaItems(mediaItems: MediaItem[], isPopular: boolean = false): Promise<void> {
    if (mediaItems.length === 0) return;

    try {
      const items = mediaItems.map(mediaItem => ({
        PK: DynamoDBKeys.mediaPK(mediaItem.tmdbId),
        SK: DynamoDBKeys.mediaSK(),
        GSI1PK: DynamoDBKeys.mediaGSI1PK(mediaItem.genres[0] || 'unknown'),
        GSI1SK: DynamoDBKeys.mediaGSI1SK(mediaItem.popularity),
        ...mediaItem,
        isPopular,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
      }));

      await this.dynamoDBService.batchWrite(items);
      this.logger.debug(`Cached ${mediaItems.length} media items`);
    } catch (error) {
      this.logger.error(`Error batch caching media items: ${error.message}`);
    }
  }

  /**
   * Obtener elemento multimedia cacheado
   */
  private async getCachedMediaItem(tmdbId: string): Promise<MediaItem | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.mediaPK(tmdbId),
        DynamoDBKeys.mediaSK()
      );

      if (!item) return null;

      // Verificar si el caché ha expirado
      if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
        return null;
      }

      return item as MediaItem;
    } catch (error) {
      this.logger.error(`Error getting cached media item: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtener contenido cacheado con filtros
   */
  private async getCachedContent(filters: ContentFilters): Promise<MediaItem[]> {
    try {
      // Si hay filtros de género, usar GSI1
      if (filters.genres && filters.genres.length > 0) {
        const results: MediaItem[] = [];
        
        for (const genre of filters.genres) {
          const items = await this.dynamoDBService.query({
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :gsi1pk',
            FilterExpression: 'expiresAt > :now',
            ExpressionAttributeValues: {
              ':gsi1pk': DynamoDBKeys.mediaGSI1PK(genre.toLowerCase()),
              ':now': new Date().toISOString(),
            },
            Limit: 20, // Limitar resultados para evitar costos altos
          });
          
          results.push(...(items as MediaItem[]));
        }
        
        return this.applyAdditionalFilters(results, filters);
      }

      // Fallback: obtener contenido popular cacheado
      return this.getPopularCachedContent();
    } catch (error) {
      this.logger.error(`Error getting cached content: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtener contenido popular cacheado
   */
  private async getPopularCachedContent(): Promise<MediaItem[]> {
    try {
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'SK = :sk',
        FilterExpression: 'isPopular = :isPopular AND expiresAt > :now',
        ExpressionAttributeValues: {
          ':sk': DynamoDBKeys.mediaSK(),
          ':isPopular': true,
          ':now': new Date().toISOString(),
        },
        Limit: 50,
      });

      return items as MediaItem[];
    } catch (error) {
      this.logger.error(`Error getting popular cached content: ${error.message}`);
      return [];
    }
  }

  /**
   * Buscar en contenido cacheado
   */
  private async searchCachedContent(query: string): Promise<MediaItem[]> {
    try {
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'SK = :sk',
        FilterExpression: 'contains(#title, :query) AND expiresAt > :now',
        ExpressionAttributeNames: {
          '#title': 'title',
        },
        ExpressionAttributeValues: {
          ':sk': DynamoDBKeys.mediaSK(),
          ':query': query.toLowerCase(),
          ':now': new Date().toISOString(),
        },
        Limit: 20,
      });

      return items as MediaItem[];
    } catch (error) {
      this.logger.error(`Error searching cached content: ${error.message}`);
      return [];
    }
  }

  /**
   * Aplicar filtros adicionales a resultados
   */
  private applyAdditionalFilters(items: MediaItem[], filters: ContentFilters): MediaItem[] {
    return items.filter(item => {
      // Filtro por año de lanzamiento
      if (filters.releaseYearFrom || filters.releaseYearTo) {
        const releaseYear = new Date(item.releaseDate).getFullYear();
        if (filters.releaseYearFrom && releaseYear < filters.releaseYearFrom) return false;
        if (filters.releaseYearTo && releaseYear > filters.releaseYearTo) return false;
      }

      // Filtro por calificación mínima
      if (filters.minRating && item.voteAverage < filters.minRating) return false;

      // Filtro por tipo de contenido
      if (filters.contentTypes && !filters.contentTypes.includes(item.mediaType)) return false;

      return true;
    });
  }

  /**
   * Convertir ContentFilters a TMDBSearchFilters
   */
  private convertToTMDBFilters(filters: ContentFilters): TMDBSearchFilters {
    return {
      genres: filters.genres,
      releaseYearFrom: filters.releaseYearFrom,
      releaseYearTo: filters.releaseYearTo,
      minRating: filters.minRating,
      sortBy: 'popularity.desc',
      page: 1,
    };
  }

  /**
   * Poblar caché inicial con contenido popular
   */
  private async populateInitialCache(): Promise<void> {
    try {
      this.logger.log('Populating initial cache with popular content...');
      
      // Obtener contenido popular de las primeras 3 páginas
      for (let page = 1; page <= 3; page++) {
        await this.getPopularContent(page);
        // Pequeña pausa para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.logger.log('Initial cache population completed');
    } catch (error) {
      this.logger.error(`Error populating initial cache: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas del Circuit Breaker
   */
  getCircuitBreakerStats() {
    return {
      tmdb: this.circuitBreakerService.getCircuitStats(this.CIRCUIT_NAME),
      details: this.circuitBreakerService.getCircuitStats(`${this.CIRCUIT_NAME}-details`),
      popular: this.circuitBreakerService.getCircuitStats(`${this.CIRCUIT_NAME}-popular`),
      search: this.circuitBreakerService.getCircuitStats(`${this.CIRCUIT_NAME}-search`),
    };
  }

  /**
   * Limpiar caché expirado
   */
  async cleanExpiredCache(): Promise<void> {
    try {
      // Esta operación sería costosa en DynamoDB, se implementaría con TTL automático
      this.logger.log('Cache cleanup would be handled by DynamoDB TTL in production');
    } catch (error) {
      this.logger.error(`Error cleaning expired cache: ${error.message}`);
    }
  }
}