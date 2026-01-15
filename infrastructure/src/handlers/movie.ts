import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';

// Use AWS SDK v3 from Lambda runtime
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Import fetch for Node.js
const fetch = require('node-fetch');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface Movie {
  id: string;
  title: string;
  poster: string;
  overview: string;
  vote_average?: number;
  release_date?: string;
}

interface CachedMovie extends Movie {
  tmdbId: string;
  cachedAt: string;
  ttl: number;
}

/**
 * MovieHandler: Circuit Breaker + Cache
 * Implementa patrón Circuit Breaker para API TMDB con cache en DynamoDB
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🎬 Movie Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'getMovies':
        return await getMovies(args.genre, args.page);
      
      case 'getMovieDetails':
        return await getMovieDetails(args.movieId);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener películas - carga MÚLTIPLES PÁGINAS de TMDB para obtener todo el contenido
 */
async function getMovies(genre?: string, page: number = 1): Promise<Movie[]> {
  try {
    const cacheKey = `movies_all_${genre || 'popular'}`;
    
    // 1. Intentar obtener desde cache
    const cachedMovies = await getCachedMovies(cacheKey);
    if (cachedMovies && cachedMovies.length > 100) {
      console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
      return cachedMovies;
    }

    // 2. Cargar MÚLTIPLES PÁGINAS de TMDB en paralelo
    console.log('🌐 Cargando TODAS las películas desde TMDB API...');
    const allMovies = await fetchAllMoviesFromTMDB(genre);
    
    // 3. Cachear resultado
    await cacheMovies(cacheKey, allMovies);
    
    console.log(`✅ Total películas cargadas: ${allMovies.length}`);
    return allMovies;

  } catch (apiError) {
    console.warn('⚠️ Error en API TMDB:', apiError);
    
    const cacheKey = `movies_all_${genre || 'popular'}`;
    const fallbackMovies = await getCachedMovies(cacheKey, true);
    if (fallbackMovies && fallbackMovies.length > 0) {
      return fallbackMovies;
    }

    return getDefaultMovies();
  }
}

/**
 * Obtener películas desde cache DynamoDB
 */
async function getCachedMovies(cacheKey: string, allowExpired = false): Promise<Movie[] | null> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: cacheKey },
    }));

    if (!response.Item) {
      return null;
    }

    const cached = response.Item as any;
    
    // Verificar si el cache ha expirado (a menos que allowExpired sea true)
    if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
      console.log('⏰ Cache expirado');
      return null;
    }

    return cached.movies || [];
  } catch (error) {
    console.warn('⚠️ Error leyendo cache:', error);
    return null;
  }
}

/**
 * Cachear películas en DynamoDB con TTL de 30 días
 */
async function cacheMovies(cacheKey: string, movies: Movie[]): Promise<void> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
    
    await docClient.send(new PutCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Item: {
        tmdbId: cacheKey,
        movies,
        cachedAt: new Date().toISOString(),
        ttl,
      },
    }));

    console.log(`💾 Películas cacheadas: ${cacheKey}`);
  } catch (error) {
    console.warn('⚠️ Error cacheando películas:', error);
    // No lanzar error, el cache es opcional
  }
}

/**
 * Cargar TODAS las películas de TMDB (múltiples páginas en paralelo)
 */
async function fetchAllMoviesFromTMDB(genre?: string): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  // Cargar 25 páginas en paralelo = ~500 películas
  const TOTAL_PAGES = 25;
  const pagePromises: Promise<Movie[]>[] = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    pagePromises.push(fetchMoviesFromTMDBPage(apiKey, genre, page));
  }

  console.log(`📦 Cargando ${TOTAL_PAGES} páginas en paralelo...`);
  const results = await Promise.all(pagePromises);

  // Combinar todas las películas
  const allMovies: Movie[] = [];
  const seenIds = new Set<string>();

  results.forEach((movies, index) => {
    console.log(`✅ Página ${index + 1}: ${movies.length} películas`);
    movies.forEach(movie => {
      if (!seenIds.has(movie.id)) {
        seenIds.add(movie.id);
        allMovies.push(movie);
      }
    });
  });

  console.log(`✅ Total películas únicas: ${allMovies.length}`);
  return allMovies;
}

/**
 * Cargar una página específica de TMDB
 */
async function fetchMoviesFromTMDBPage(apiKey: string, genre: string | undefined, page: number): Promise<Movie[]> {
  try {
    let endpoint = 'https://api.themoviedb.org/3/movie/popular';
    if (genre) {
      endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${getGenreId(genre)}`;
    }

    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}&language=es-ES&page=${page}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ Error en página ${page}: ${response.status}`);
      return [];
    }

    const data: any = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((movie: any) => ({
      id: movie.id.toString(),
      title: movie.title || movie.original_title || 'Título no disponible',
      poster: movie.poster_path || null,
      overview: movie.overview || 'Descripción no disponible',
      vote_average: movie.vote_average || 0,
      release_date: movie.release_date || '',
    }));
  } catch (error) {
    console.warn(`⚠️ Error cargando página ${page}:`, error);
    return [];
  }
}

/**
 * Obtener películas desde API TMDB con soporte para paginación (legacy)
 */
async function fetchMoviesFromTMDB(genre?: string, page: number = 1): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  // Determinar endpoint según género
  let endpoint = 'https://api.themoviedb.org/3/movie/popular';
  if (genre) {
    // Para géneros específicos, usar discover
    endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${getGenreId(genre)}`;
  }

  const url = `${endpoint}?api_key=${apiKey}&language=es-ES&page=${page}`;
  
  console.log(`🔍 Fetching from TMDB: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Trinity-App/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  
  if (!data.results || !Array.isArray(data.results)) {
    throw new Error('Formato de respuesta TMDB inválido');
  }

  console.log(`✅ TMDB returned ${data.results.length} movies for page ${page}`);

  // Transformar TODAS las películas de la página (no limitar a 20)
  return data.results.map((movie: any) => ({
    id: movie.id.toString(),
    title: movie.title || movie.original_title || 'Título no disponible',
    poster: movie.poster_path 
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://via.placeholder.com/500x750?text=Sin+Poster',
    overview: movie.overview || 'Descripción no disponible',
    vote_average: movie.vote_average || 0,
    release_date: movie.release_date || '',
  }));
}

/**
 * Mapear nombres de géneros a IDs de TMDB
 */
function getGenreId(genreName: string): string {
  const genreMap: { [key: string]: string } = {
    'action': '28',
    'adventure': '12',
    'animation': '16',
    'comedy': '35',
    'crime': '80',
    'documentary': '99',
    'drama': '18',
    'family': '10751',
    'fantasy': '14',
    'history': '36',
    'horror': '27',
    'music': '10402',
    'mystery': '9648',
    'romance': '10749',
    'science_fiction': '878',
    'thriller': '53',
    'war': '10752',
    'western': '37',
  };

  return genreMap[genreName.toLowerCase()] || '28'; // Default: Action
}

/**
 * Obtener detalles de una película específica
 */
async function getMovieDetails(movieId: string): Promise<any> {
  const cacheKey = `movie_details_${movieId}`;
  
  try {
    // 1. Intentar obtener desde cache
    const cachedMovie = await getCachedMovieDetails(cacheKey);
    if (cachedMovie) {
      console.log(`💾 Detalles de película obtenidos desde cache: ${movieId}`);
      return cachedMovie;
    }

    // 2. Si no hay cache, obtener desde API TMDB
    console.log(`🌐 Obteniendo detalles de película ${movieId} desde TMDB API...`);
    const movieDetails = await fetchMovieDetailsFromTMDB(movieId);
    
    // 3. Cachear resultado exitoso
    await cacheMovieDetails(cacheKey, movieDetails);
    
    console.log(`✅ Detalles de película obtenidos desde API: ${movieDetails.title}`);
    return movieDetails;

  } catch (apiError) {
    console.warn(`⚠️ Error en API TMDB para película ${movieId}, intentando fallback:`, apiError);
    
    // 4. Fallback: intentar cache expirado
    const fallbackMovie = await getCachedMovieDetails(cacheKey, true);
    if (fallbackMovie) {
      console.log(`🔄 Usando cache expirado como fallback para película ${movieId}`);
      return fallbackMovie;
    }

    // 5. Si todo falla, retornar película por defecto
    console.log(`🎭 Usando película por defecto para ID ${movieId}`);
    return getDefaultMovieDetails(movieId);
  }
}

/**
 * Obtener detalles de película desde cache DynamoDB
 */
async function getCachedMovieDetails(cacheKey: string, allowExpired = false): Promise<any | null> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: cacheKey },
    }));

    if (!response.Item) {
      return null;
    }

    const cached = response.Item as any;
    
    // Verificar si el cache ha expirado
    if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
      console.log('⏰ Cache de detalles expirado');
      return null;
    }

    return cached.movieDetails || null;
  } catch (error) {
    console.warn('⚠️ Error leyendo cache de detalles:', error);
    return null;
  }
}

/**
 * Cachear detalles de película en DynamoDB
 */
async function cacheMovieDetails(cacheKey: string, movieDetails: any): Promise<void> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
    
    await docClient.send(new PutCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Item: {
        tmdbId: cacheKey,
        movieDetails,
        cachedAt: new Date().toISOString(),
        ttl,
      },
    }));

    console.log(`💾 Detalles de película cacheados: ${cacheKey}`);
  } catch (error) {
    console.warn('⚠️ Error cacheando detalles de película:', error);
  }
}

/**
 * Obtener detalles de película desde API TMDB
 */
async function fetchMovieDetailsFromTMDB(movieId: string): Promise<any> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=es-ES&append_to_response=credits,videos`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Trinity-App/1.0',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Película no encontrada: ${movieId}`);
    }
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  const movie: any = await response.json();
  
  // Transformar a formato GraphQL esperado
  return {
    id: movie.id.toString(),
    title: movie.title || movie.original_title || 'Título no disponible',
    overview: movie.overview || 'Descripción no disponible',
    poster: movie.poster_path || null,
    vote_average: movie.vote_average || 0,
    release_date: movie.release_date || '',
    genres: movie.genres?.map((g: any) => ({ id: g.id, name: g.name })) || [],
    runtime: movie.runtime || null,
  };
}

/**
 * Detalles de película por defecto cuando todo falla
 */
function getDefaultMovieDetails(movieId: string): any {
  return {
    id: movieId,
    title: 'Película no disponible',
    overview: 'Los detalles de esta película no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
    poster: null,
    vote_average: 0,
    release_date: '',
    genres: [],
    runtime: null,
  };
}

/**
 * Películas por defecto cuando todo falla
 */
function getDefaultMovies(): Movie[] {
  return [
    {
      id: 'default_1',
      title: 'El Padrino',
      poster: 'https://via.placeholder.com/500x750?text=El+Padrino',
      overview: 'La historia de una familia de la mafia italiana en Nueva York.',
    },
    {
      id: 'default_2',
      title: 'Pulp Fiction',
      poster: 'https://via.placeholder.com/500x750?text=Pulp+Fiction',
      overview: 'Historias entrelazadas de crimen en Los Ángeles.',
    },
    {
      id: 'default_3',
      title: 'El Señor de los Anillos',
      poster: 'https://via.placeholder.com/500x750?text=LOTR',
      overview: 'Una épica aventura de fantasía en la Tierra Media.',
    },
    {
      id: 'default_4',
      title: 'Forrest Gump',
      poster: 'https://via.placeholder.com/500x750?text=Forrest+Gump',
      overview: 'La extraordinaria vida de un hombre simple.',
    },
    {
      id: 'default_5',
      title: 'Matrix',
      poster: 'https://via.placeholder.com/500x750?text=Matrix',
      overview: 'Un programador descubre la verdad sobre la realidad.',
    },
  ];
}