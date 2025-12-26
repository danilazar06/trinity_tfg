// Servicio para obtener películas y series de TMDB
// En producción, esto debería pasar por el backend

const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
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

  private async fetchFromTMDB<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const queryParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'es-ES',
      ...params,
    });

    const url = `${TMDB_BASE_URL}${endpoint}?${queryParams}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error('TMDB fetch error:', error);
      throw error;
    }
  }

  // Obtener providers de streaming para un item
  async getStreamingProviders(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<StreamingProvider[]> {
    const cacheKey = `${mediaType}-${tmdbId}`;
    if (this.providersCache.has(cacheKey)) {
      return this.providersCache.get(cacheKey)!;
    }

    try {
      const endpoint = mediaType === 'movie' 
        ? `/movie/${tmdbId}/watch/providers`
        : `/tv/${tmdbId}/watch/providers`;
      
      const data = await this.fetchFromTMDB<any>(endpoint);
      const region = data.results?.ES || data.results?.US || null;
      
      const providers: StreamingProvider[] = [];
      if (region?.flatrate) {
        region.flatrate.slice(0, 4).forEach((p: any) => {
          providers.push({
            id: p.provider_id,
            name: p.provider_name,
            logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
          });
        });
      }
      
      this.providersCache.set(cacheKey, providers);
      return providers;
    } catch (error) {
      console.error('Error fetching providers:', error);
      return [];
    }
  }

  // Enriquecer items con providers (para los primeros N items)
  private async enrichWithProviders(items: MediaItem[], limit = 10): Promise<MediaItem[]> {
    const itemsToEnrich = items.slice(0, limit);
    const enrichedItems = await Promise.all(
      itemsToEnrich.map(async (item) => {
        const providers = await this.getStreamingProviders(item.tmdbId, item.mediaType);
        return { ...item, streamingProviders: providers };
      })
    );
    
    // Combinar items enriquecidos con el resto
    return [...enrichedItems, ...items.slice(limit)];
  }

  async getPopularMovies(page = 1): Promise<MediaResponse> {
    const data = await this.fetchFromTMDB<any>('/movie/popular', { page: String(page) });
    const items = data.results.map((item: any) => transformTMDBItem(item, 'movie'));
    const enrichedItems = await this.enrichWithProviders(items);
    
    return {
      results: enrichedItems,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async getPopularTV(page = 1): Promise<MediaResponse> {
    const data = await this.fetchFromTMDB<any>('/tv/popular', { page: String(page) });
    const items = data.results.map((item: any) => transformTMDBItem(item, 'tv'));
    const enrichedItems = await this.enrichWithProviders(items);
    
    return {
      results: enrichedItems,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async getTrending(timeWindow: 'day' | 'week' = 'week', page = 1): Promise<MediaResponse> {
    const data = await this.fetchFromTMDB<any>(`/trending/all/${timeWindow}`, { page: String(page) });
    const items = data.results.map((item: any) => 
      transformTMDBItem(item, item.media_type === 'tv' ? 'tv' : 'movie')
    );
    const enrichedItems = await this.enrichWithProviders(items);
    
    return {
      results: enrichedItems,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async searchContent(query: string, page = 1): Promise<MediaResponse> {
    if (!query.trim()) {
      return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    }

    const data = await this.fetchFromTMDB<any>('/search/multi', { 
      query, 
      page: String(page),
      include_adult: 'false',
    });
    
    // Filtrar solo películas y series
    const filtered = data.results.filter(
      (item: any) => item.media_type === 'movie' || item.media_type === 'tv'
    );

    const items = filtered.map((item: any) => 
      transformTMDBItem(item, item.media_type === 'tv' ? 'tv' : 'movie')
    );
    const enrichedItems = await this.enrichWithProviders(items);

    return {
      results: enrichedItems,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async discoverMovies(filters: {
    genres?: number[];
    yearFrom?: number;
    yearTo?: number;
    minRating?: number;
    page?: number;
  } = {}): Promise<MediaResponse> {
    const params: Record<string, string> = {
      page: String(filters.page || 1),
      sort_by: 'popularity.desc',
    };

    if (filters.genres?.length) {
      params.with_genres = filters.genres.join(',');
    }
    if (filters.yearFrom) {
      params['primary_release_date.gte'] = `${filters.yearFrom}-01-01`;
    }
    if (filters.yearTo) {
      params['primary_release_date.lte'] = `${filters.yearTo}-12-31`;
    }
    if (filters.minRating) {
      params['vote_average.gte'] = String(filters.minRating);
    }

    const data = await this.fetchFromTMDB<any>('/discover/movie', params);
    
    return {
      results: data.results.map((item: any) => transformTMDBItem(item, 'movie')),
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async discoverTV(filters: {
    genres?: number[];
    yearFrom?: number;
    yearTo?: number;
    minRating?: number;
    page?: number;
  } = {}): Promise<MediaResponse> {
    const params: Record<string, string> = {
      page: String(filters.page || 1),
      sort_by: 'popularity.desc',
    };

    if (filters.genres?.length) {
      params.with_genres = filters.genres.join(',');
    }
    if (filters.yearFrom) {
      params['first_air_date.gte'] = `${filters.yearFrom}-01-01`;
    }
    if (filters.yearTo) {
      params['first_air_date.lte'] = `${filters.yearTo}-12-31`;
    }
    if (filters.minRating) {
      params['vote_average.gte'] = String(filters.minRating);
    }

    const data = await this.fetchFromTMDB<any>('/discover/tv', params);
    
    return {
      results: data.results.map((item: any) => transformTMDBItem(item, 'tv')),
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async getMovieDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      const [details, videos, watchProviders, credits] = await Promise.all([
        this.fetchFromTMDB<any>(`/movie/${tmdbId}`),
        this.fetchFromTMDB<any>(`/movie/${tmdbId}/videos`),
        this.fetchFromTMDB<any>(`/movie/${tmdbId}/watch/providers`),
        this.fetchFromTMDB<any>(`/movie/${tmdbId}/credits`),
      ]);

      const trailer = videos.results?.find(
        (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
      );

      return {
        ...transformTMDBItem(details, 'movie'),
        genres: details.genres?.map((g: any) => g.name) || [],
        runtime: details.runtime,
        tagline: details.tagline,
        budget: details.budget,
        revenue: details.revenue,
        trailerKey: trailer?.key || null,
        watchProviders: extractWatchProviders(watchProviders.results),
        cast: credits.cast?.slice(0, 10).map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profile_path
            ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}`
            : null,
        })) || [],
        director: credits.crew?.find((c: any) => c.job === 'Director')?.name || null,
      };
    } catch (error) {
      console.error('Error fetching movie details:', error);
      return null;
    }
  }

  async getTVDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      const [details, videos, watchProviders, credits] = await Promise.all([
        this.fetchFromTMDB<any>(`/tv/${tmdbId}`),
        this.fetchFromTMDB<any>(`/tv/${tmdbId}/videos`),
        this.fetchFromTMDB<any>(`/tv/${tmdbId}/watch/providers`),
        this.fetchFromTMDB<any>(`/tv/${tmdbId}/credits`),
      ]);

      const trailer = videos.results?.find(
        (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
      );

      return {
        ...transformTMDBItem(details, 'tv'),
        genres: details.genres?.map((g: any) => g.name) || [],
        runtime: details.episode_run_time?.[0] || null,
        tagline: details.tagline,
        numberOfSeasons: details.number_of_seasons,
        numberOfEpisodes: details.number_of_episodes,
        trailerKey: trailer?.key || null,
        watchProviders: extractWatchProviders(watchProviders.results),
        cast: credits.cast?.slice(0, 10).map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profile_path
            ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}`
            : null,
        })) || [],
        creator: details.created_by?.[0]?.name || null,
      };
    } catch (error) {
      console.error('Error fetching TV details:', error);
      return null;
    }
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
