import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
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

  constructor(
    private multiTableService: MultiTableService,
    private tmdbService: TMDBService,
    private circuitBreakerService: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    await this.initializeService();
  }

  /**
   * Patrón Circuit Breaker - Obtener películas con fallback a caché
   */
  async fetchMovies(filters: ContentFilters): Promise<MediaItem[]> {
    const tmdbFilters = this.convertToTMDBFilters(filters);

    return this.circuitBreakerService.execute(
      this.CIRCUIT_NAME,
      // Operación principal: TMDB API
      async () => {
        const results = await this.tmdbService.discoverContent(tmdbFilters);

        // Cachear resultados exitosos de forma asíncrona
        this.cacheMoviesAsync(results);

        this.logger.log(`Fetched ${results.length} movies from TMDB`);
        return results;
      },
      // Fallback: Caché local (Trinity_MoviesCache)
      async () => {
        const cachedResults = await this.getCachedMovies(filters);
        this.logger.warn(
          `Using cached content, returned ${cachedResults.length} items`,
        );
        return cachedResults;
      },
    );
  }

  /**
   * Obtener detalles de una película específica
   */
  async getMovieDetails(tmdbId: string): Promise<MediaItem | null> {
    return this.circuitBreakerService.execute(
      `${this.CIRCUIT_NAME}-details`,
      // Operación principal: TMDB API
      async () => {
        const tmdbMovie = await this.tmdbService.getMovieDetails(tmdbId);
        if (tmdbMovie && tmdbMovie.id) {
          const mediaItem = this.tmdbService.convertToMediaItem(tmdbMovie);

          // Cachear el resultado
          await this.multiTableService.cacheMovie(mediaItem);

          return mediaItem;
        }
        return null;
      },
      // Fallback: Caché local
      async () => {
        return this.getCachedMovie(tmdbId);
      },
    );
  }

  /**
   * Buscar películas por texto
   */
  async searchMovies(query: string, page: number = 1): Promise<MediaItem[]> {
    if (!query.trim()) {
      return [];
    }

    return this.circuitBreakerService.execute(
      `${this.CIRCUIT_NAME}-search`,
      // Operación principal: TMDB API
      async () => {
        const response = await this.tmdbService.searchMovies({ query, page });
        const mediaItems = response.results.map((movie) =>
          this.tmdbService.convertToMediaItem(movie),
        );

        // Cachear resultados de búsqueda
        this.cacheMoviesAsync(mediaItems);

        return mediaItems;
      },
      // Fallback: Búsqueda en caché local
      async () => {
        return this.searchCachedMovies(query);
      },
    );
  }

  /**
   * Métodos privados para manejo de caché
   */
  private async cacheMoviesAsync(movies: MediaItem[]): Promise<void> {
    try {
      // Cachear de forma asíncrona para no bloquear la respuesta
      Promise.all(
        movies.map((movie) => this.multiTableService.cacheMovie(movie)),
      ).catch((error) => {
        this.logger.error(`Error caching movies: ${error.message}`);
      });
    } catch (error) {
      this.logger.error(`Error in async caching: ${error.message}`);
    }
  }

  private async getCachedMovies(filters: ContentFilters): Promise<MediaItem[]> {
    try {
      return await this.multiTableService.searchCachedMovies(filters);
    } catch (error) {
      this.logger.error(`Error getting cached movies: ${error.message}`);
      return [];
    }
  }

  private async getCachedMovie(tmdbId: string): Promise<MediaItem | null> {
    try {
      return await this.multiTableService.getCachedMovie(tmdbId);
    } catch (error) {
      this.logger.error(`Error getting cached movie: ${error.message}`);
      return null;
    }
  }

  private async searchCachedMovies(query: string): Promise<MediaItem[]> {
    try {
      // Búsqueda simple en caché por título
      const allCached = await this.multiTableService.searchCachedMovies({});
      return allCached.filter((movie) =>
        movie.title.toLowerCase().includes(query.toLowerCase()),
      );
    } catch (error) {
      this.logger.error(`Error searching cached movies: ${error.message}`);
      return [];
    }
  }

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

  private async initializeService(): Promise<void> {
    try {
      await this.tmdbService.initialize();
      this.logger.log('MediaService initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize MediaService: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas del Circuit Breaker
   */
  getCircuitBreakerStats() {
    return {
      tmdb: this.circuitBreakerService.getCircuitStats(this.CIRCUIT_NAME),
      details: this.circuitBreakerService.getCircuitStats(
        `${this.CIRCUIT_NAME}-details`,
      ),
      search: this.circuitBreakerService.getCircuitStats(
        `${this.CIRCUIT_NAME}-search`,
      ),
    };
  }
}
