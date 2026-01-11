// Servicio para obtener películas y series usando AppSync con Circuit Breaker
import { appSyncService } from './appSyncService';
import { imageCacheService } from './imageCacheService';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface StreamingProvider {
  id: number;
  name: string;
  logoPath: string;
}

export interface MediaItem {
  id: string;
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  voteCount: number;
  genres: string[];
  mediaType: 'movie' | 'tv';
  platform?: string;
  streamingProviders?: StreamingProvider[];
  isNew?: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoPath: string;
  type: 'streaming' | 'rent' | 'buy';
}

export interface MediaItemDetails extends MediaItem {
  runtime?: number | null;
  tagline?: string;
  budget?: number;
  revenue?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  trailerKey: string | null;
  watchProviders: WatchProvider[];
  cast: CastMember[];
  director?: string | null;
  creator?: string | null;
  // Properties expected by room screen
  mediaPosterPath?: string | null;
  mediaTitle?: string;
  mediaYear?: string;
  mediaOverview?: string;
  mediaRating?: number | null;
}

export interface MediaResponse {
  results: MediaItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

// Mapeo de géneros de TMDB
const genreMap: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  10770: 'Película de TV',
  53: 'Suspense',
  10752: 'Bélica',
  37: 'Western',
  // TV genres
  10759: 'Acción y Aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Telenovela',
  10767: 'Talk Show',
  10768: 'Guerra y Política',
};

// Plataformas ficticias para mostrar
const platforms = ['Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Apple TV+'];

const getRandomPlatform = () => platforms[Math.floor(Math.random() * platforms.length)];

const transformTMDBItem = (item: any, mediaType: 'movie' | 'tv'): MediaItem => {
  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.split('-')[0] : '';
  const isRecent = year && parseInt(year) >= new Date().getFullYear() - 1;

  return {
    id: `${mediaType}-${item.id}`,
    tmdbId: item.id,
    title: item.title || item.name,
    originalTitle: item.original_title || item.original_name,
    overview: item.overview,
    posterPath: item.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
      : null,
    backdropPath: item.backdrop_path
      ? `${TMDB_IMAGE_BASE}/w780${item.backdrop_path}`
      : null,
    releaseDate,
    year,
    rating: Math.round(item.vote_average * 10) / 10,
    voteCount: item.vote_count,
    genres: (item.genre_ids || []).map((id: number) => genreMap[id] || 'Otro'),
    mediaType,
    platform: getRandomPlatform(),
    isNew: isRecent,
  };
};

class MediaService {
  private providersCache: Map<string, StreamingProvider[]> = new Map();

  /**
   * Obtener detalles de película usando AppSync con Circuit Breaker
   */
  async getMovieDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Fetching movie details for ID: ${tmdbId} via AppSync`);
      
      const result = await appSyncService.getMovieDetails(tmdbId.toString());
      
      if (!result.getMovieDetails) {
        console.warn(`⚠️ No movie details found for ID: ${tmdbId}`);
        return null;
      }

      const details = result.getMovieDetails;
      
      // Transformar respuesta de GraphQL al formato esperado
      const movieDetails: MediaItemDetails = {
        id: `movie-${details.id}`,
        tmdbId: parseInt(details.id),
        title: details.title,
        originalTitle: details.title, // GraphQL no devuelve original_title por ahora
        overview: details.overview || '',
        posterPath: details.poster 
          ? `${TMDB_IMAGE_BASE}/w500${details.poster}`
          : null,
        backdropPath: null, // No disponible en GraphQL actual
        releaseDate: details.release_date || '',
        year: details.release_date ? details.release_date.split('-')[0] : '',
        rating: Math.round((details.vote_average || 0) * 10) / 10,
        voteCount: 0, // No disponible en GraphQL actual
        genres: details.genres?.map((g: any) => g.name) || [],
        mediaType: 'movie' as const,
        runtime: details.runtime || null,
        tagline: '', // No disponible en GraphQL actual
        budget: 0, // No disponible en GraphQL actual
        revenue: 0, // No disponible en GraphQL actual
        trailerKey: null, // No disponible en GraphQL actual
        watchProviders: [], // No disponible en GraphQL actual
        cast: [], // No disponible en GraphQL actual
        director: null, // No disponible en GraphQL actual
      };

      // Get cached poster image if available
      if (movieDetails.posterPath) {
        try {
          const cachedPosterPath = await imageCacheService.getCachedImage(movieDetails.posterPath);
          movieDetails.posterPath = cachedPosterPath;
        } catch (error) {
          console.warn(`⚠️ Failed to get cached poster for ${movieDetails.title}:`, error);
          // Keep original posterPath as fallback
        }
      }

      console.log(`✅ Movie details loaded successfully: ${movieDetails.title}`);
      return movieDetails;
      
    } catch (error: any) {
      console.error('❌ Error fetching movie details via AppSync:', error);
      
      // Manejar errores específicos del Circuit Breaker
      if (error.message?.includes('Circuit breaker is OPEN')) {
        console.warn('⚡ Circuit breaker is open, service temporarily unavailable');
        // Podrías devolver datos en caché o un fallback aquí
        return this.getFallbackMovieDetails(tmdbId);
      }
      
      if (error.message?.includes('Service temporarily unavailable')) {
        console.warn('🔧 External service unavailable, using fallback');
        return this.getFallbackMovieDetails(tmdbId);
      }
      
      // Para otros errores, devolver null
      return null;
    }
  }

  /**
   * Obtener detalles de serie usando AppSync con Circuit Breaker
   */
  async getTVDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      console.log(`📺 Fetching TV details for ID: ${tmdbId} via AppSync`);
      
      // Por ahora, usar el mismo endpoint que movies
      // En una implementación real, habría un endpoint separado para TV
      const result = await appSyncService.getMovieDetails(tmdbId.toString());
      
      if (!result.getMovieDetails) {
        console.warn(`⚠️ No TV details found for ID: ${tmdbId}`);
        return null;
      }

      const details = result.getMovieDetails;
      
      // Transformar respuesta de GraphQL al formato esperado para TV
      const tvDetails: MediaItemDetails = {
        id: `tv-${details.id}`,
        tmdbId: parseInt(details.id),
        title: details.title,
        originalTitle: details.title,
        overview: details.overview || '',
        posterPath: details.poster 
          ? `${TMDB_IMAGE_BASE}/w500${details.poster}`
          : null,
        backdropPath: null, // No disponible en GraphQL actual
        releaseDate: details.release_date || '',
        year: details.release_date ? details.release_date.split('-')[0] : '',
        rating: Math.round((details.vote_average || 0) * 10) / 10,
        voteCount: 0,
        genres: details.genres?.map((g: any) => g.name) || [],
        mediaType: 'tv' as const,
        runtime: details.runtime || null,
        tagline: '',
        numberOfSeasons: 1, // Valor por defecto
        numberOfEpisodes: 10, // Valor por defecto
        trailerKey: null,
        watchProviders: [],
        cast: [],
        creator: null,
      };

      // Get cached poster image if available
      if (tvDetails.posterPath) {
        try {
          const cachedPosterPath = await imageCacheService.getCachedImage(tvDetails.posterPath);
          tvDetails.posterPath = cachedPosterPath;
        } catch (error) {
          console.warn(`⚠️ Failed to get cached poster for ${tvDetails.title}:`, error);
          // Keep original posterPath as fallback
        }
      }

      console.log(`✅ TV details loaded successfully: ${tvDetails.title}`);
      return tvDetails;
      
    } catch (error: any) {
      console.error('❌ Error fetching TV details via AppSync:', error);
      
      // Manejar errores del Circuit Breaker
      if (error.message?.includes('Circuit breaker is OPEN')) {
        console.warn('⚡ Circuit breaker is open for TV service');
        return this.getFallbackTVDetails(tmdbId);
      }
      
      return null;
    }
  }

  /**
   * Datos de fallback cuando el Circuit Breaker está abierto
   */
  private getFallbackMovieDetails(tmdbId: number): MediaItemDetails {
    console.log(`🔄 Using fallback data for movie ID: ${tmdbId}`);
    
    return {
      id: `movie-${tmdbId}`,
      tmdbId,
      title: 'Película no disponible',
      originalTitle: 'Movie Unavailable',
      overview: 'Los detalles de esta película no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
      posterPath: null,
      backdropPath: null,
      releaseDate: '',
      year: '',
      rating: 0,
      voteCount: 0,
      genres: ['No disponible'],
      mediaType: 'movie' as const,
      runtime: null,
      tagline: 'Servicio temporalmente no disponible',
      budget: 0,
      revenue: 0,
      trailerKey: null,
      watchProviders: [],
      cast: [],
      director: null,
    };
  }

  /**
   * Datos de fallback para series cuando el Circuit Breaker está abierto
   */
  private getFallbackTVDetails(tmdbId: number): MediaItemDetails {
    console.log(`🔄 Using fallback data for TV ID: ${tmdbId}`);
    
    return {
      id: `tv-${tmdbId}`,
      tmdbId,
      title: 'Serie no disponible',
      originalTitle: 'TV Show Unavailable',
      overview: 'Los detalles de esta serie no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
      posterPath: null,
      backdropPath: null,
      releaseDate: '',
      year: '',
      rating: 0,
      voteCount: 0,
      genres: ['No disponible'],
      mediaType: 'tv' as const,
      runtime: null,
      tagline: 'Servicio temporalmente no disponible',
      numberOfSeasons: 0,
      numberOfEpisodes: 0,
      trailerKey: null,
      watchProviders: [],
      cast: [],
      creator: null,
    };
  }

  // Métodos legacy mantenidos para compatibilidad (ahora usan fallback local)
  async getPopularMovies(page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getPopularMovies: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async getPopularTV(page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getPopularTV: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async getTrending(timeWindow: 'day' | 'week' = 'week', page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getTrending: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async searchContent(query: string, page = 1): Promise<MediaResponse> {
    console.warn('⚠️ searchContent: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async discoverMovies(filters: any = {}): Promise<MediaResponse> {
    console.warn('⚠️ discoverMovies: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async discoverTV(filters: any = {}): Promise<MediaResponse> {
    console.warn('⚠️ discoverTV: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  private getLegacyFallbackResponse(): MediaResponse {
    return {
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    };
  }

  // Métodos de utilidad mantenidos
  async getStreamingProviders(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<StreamingProvider[]> {
    // Devolver array vacío ya que no tenemos esta funcionalidad en AppSync aún
    return [];
  }

  /**
   * Pre-cache images for offline viewing
   */
  async preCacheImages(imageUris: string[]): Promise<void> {
    if (!imageUris || imageUris.length === 0) return;

    console.log(`🖼️ Pre-caching ${imageUris.length} images via MediaService`);
    
    try {
      await imageCacheService.preCacheImages(imageUris);
      console.log(`✅ Successfully pre-cached ${imageUris.length} images`);
    } catch (error) {
      console.error('❌ Error pre-caching images:', error);
    }
  }

  /**
   * Get cached image or original URI
   */
  async getCachedImageUri(originalUri: string): Promise<string> {
    if (!originalUri) return originalUri;
    
    try {
      return await imageCacheService.getCachedImage(originalUri);
    } catch (error) {
      console.warn(`⚠️ Failed to get cached image for ${originalUri}:`, error);
      return originalUri;
    }
  }

  /**
   * Clear image cache
   */
  async clearImageCache(): Promise<void> {
    try {
      await imageCacheService.clearCache();
      console.log('✅ Image cache cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing image cache:', error);
    }
  }

  /**
   * Get image cache statistics
   */
  getImageCacheStats() {
    return imageCacheService.getCacheStats();
  }

  /**
   * Get current media for a room (required by room screen)
   */
  async getCurrentMedia(roomId: string): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Getting current media for room: ${roomId}`);
      
      // Try to get current media via AppSync
      const result = await appSyncService.getMovies();
      
      if (!result.getMovies || result.getMovies.length === 0) {
        console.warn(`⚠️ No movies found for room: ${roomId}`);
        return null;
      }

      // Get the first movie as current media (simplified for now)
      const movie = result.getMovies[0];
      
      const currentMedia: MediaItemDetails = {
        id: `movie-${movie.id}`,
        tmdbId: parseInt(movie.id),
        title: movie.title,
        originalTitle: movie.title,
        overview: movie.overview || '',
        posterPath: movie.poster 
          ? `${TMDB_IMAGE_BASE}/w500${movie.poster}`
          : null,
        backdropPath: null,
        releaseDate: movie.release_date || '',
        year: movie.release_date ? movie.release_date.split('-')[0] : '',
        rating: Math.round((movie.vote_average || 0) * 10) / 10,
        voteCount: 0,
        genres: [],
        mediaType: 'movie' as const,
        runtime: null,
        tagline: '',
        budget: 0,
        revenue: 0,
        trailerKey: null,
        watchProviders: [],
        cast: [],
        director: null,
        // Add properties expected by room screen
        mediaPosterPath: movie.poster,
        mediaTitle: movie.title,
        mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
        mediaOverview: movie.overview || '',
        mediaRating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      };

      console.log(`✅ Current media loaded: ${currentMedia.title}`);
      return currentMedia;
      
    } catch (error: any) {
      console.error('❌ Error getting current media:', error);
      
      // Return fallback media to prevent crashes
      return this.getFallbackCurrentMedia(roomId);
    }
  }

  /**
   * Get next media for a room (required by room screen)
   */
  async getNextMedia(roomId: string): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Getting next media for room: ${roomId}`);
      
      // Try to get movies via AppSync
      const result = await appSyncService.getMovies();
      
      if (!result.getMovies || result.getMovies.length === 0) {
        console.warn(`⚠️ No more movies found for room: ${roomId}`);
        return null;
      }

      // Get a random movie as next media (simplified for now)
      const randomIndex = Math.floor(Math.random() * result.getMovies.length);
      const movie = result.getMovies[randomIndex];
      
      const nextMedia: MediaItemDetails = {
        id: `movie-${movie.id}`,
        tmdbId: parseInt(movie.id),
        title: movie.title,
        originalTitle: movie.title,
        overview: movie.overview || '',
        posterPath: movie.poster 
          ? `${TMDB_IMAGE_BASE}/w500${movie.poster}`
          : null,
        backdropPath: null,
        releaseDate: movie.release_date || '',
        year: movie.release_date ? movie.release_date.split('-')[0] : '',
        rating: Math.round((movie.vote_average || 0) * 10) / 10,
        voteCount: 0,
        genres: [],
        mediaType: 'movie' as const,
        runtime: null,
        tagline: '',
        budget: 0,
        revenue: 0,
        trailerKey: null,
        watchProviders: [],
        cast: [],
        director: null,
        // Add properties expected by room screen
        mediaPosterPath: movie.poster,
        mediaTitle: movie.title,
        mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
        mediaOverview: movie.overview || '',
        mediaRating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      };

      console.log(`✅ Next media loaded: ${nextMedia.title}`);
      return nextMedia;
      
    } catch (error: any) {
      console.error('❌ Error getting next media:', error);
      
      // Return fallback media to prevent crashes
      return this.getFallbackCurrentMedia(roomId);
    }
  }

  /**
   * Fallback current media when API fails
   */
  private getFallbackCurrentMedia(roomId: string): MediaItemDetails {
    console.log(`🔄 Using fallback current media for room: ${roomId}`);
    
    return {
      id: `fallback-movie-${Date.now()}`,
      tmdbId: 12345,
      title: 'Película de ejemplo',
      originalTitle: 'Example Movie',
      overview: 'Esta es una película de ejemplo que se muestra cuando no se pueden cargar los datos reales. Por favor, verifica tu conexión a internet.',
      posterPath: null,
      backdropPath: null,
      releaseDate: '2024-01-01',
      year: '2024',
      rating: 7.5,
      voteCount: 1000,
      genres: ['Drama', 'Acción'],
      mediaType: 'movie' as const,
      runtime: 120,
      tagline: 'Una película de ejemplo',
      budget: 0,
      revenue: 0,
      trailerKey: null,
      watchProviders: [],
      cast: [],
      director: null,
      // Add properties expected by room screen
      mediaPosterPath: null,
      mediaTitle: 'Película de ejemplo',
      mediaYear: '2024',
      mediaOverview: 'Esta es una película de ejemplo que se muestra cuando no se pueden cargar los datos reales.',
      mediaRating: 7.5,
    };
  }
}

// Extraer proveedores de streaming
function extractWatchProviders(results: any): WatchProvider[] {
  // Priorizar España (ES), luego US
  const region = results?.ES || results?.US || null;
  if (!region) return [];

  const providers: WatchProvider[] = [];

  // Flatrate = streaming incluido en suscripción
  if (region.flatrate) {
    region.flatrate.forEach((p: any) => {
      providers.push({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
        type: 'streaming',
      });
    });
  }

  // Rent = alquiler
  if (region.rent) {
    region.rent.slice(0, 3).forEach((p: any) => {
      if (!providers.find(pr => pr.id === p.provider_id)) {
        providers.push({
          id: p.provider_id,
          name: p.provider_name,
          logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
          type: 'rent',
        });
      }
    });
  }

  // Buy = compra
  if (region.buy) {
    region.buy.slice(0, 3).forEach((p: any) => {
      if (!providers.find(pr => pr.id === p.provider_id)) {
        providers.push({
          id: p.provider_id,
          name: p.provider_name,
          logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
          type: 'buy',
        });
      }
    });
  }

  return providers;
}

export const mediaService = new MediaService();
