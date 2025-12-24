import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import fetch from 'node-fetch';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface Movie {
  id: string;
  title: string;
  poster: string;
  overview: string;
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
        return await getMovies(args.genre);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener películas con Circuit Breaker
 */
async function getMovies(genre?: string): Promise<Movie[]> {
  const cacheKey = `movies_${genre || 'popular'}`;
  
  try {
    // 1. Intentar obtener desde cache
    const cachedMovies = await getCachedMovies(cacheKey);
    if (cachedMovies && cachedMovies.length > 0) {
      console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
      return cachedMovies;
    }

    // 2. Si no hay cache, intentar API TMDB
    console.log('🌐 Obteniendo películas desde TMDB API...');
    const moviesFromAPI = await fetchMoviesFromTMDB(genre);
    
    // 3. Cachear resultado exitoso
    await cacheMovies(cacheKey, moviesFromAPI);
    
    console.log(`✅ Películas obtenidas desde API: ${moviesFromAPI.length}`);
    return moviesFromAPI;

  } catch (apiError) {
    console.warn('⚠️ Error en API TMDB, intentando fallback desde cache:', apiError);
    
    // 4. Fallback: intentar cache expirado como último recurso
    const fallbackMovies = await getCachedMovies(cacheKey, true);
    if (fallbackMovies && fallbackMovies.length > 0) {
      console.log(`🔄 Usando cache expirado como fallback: ${fallbackMovies.length}`);
      return fallbackMovies;
    }

    // 5. Si todo falla, retornar películas por defecto
    console.log('🎭 Usando películas por defecto');
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

    const cached = response.Item as CachedMovie & { movies: Movie[] };
    
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
 * Obtener películas desde API TMDB
 */
async function fetchMoviesFromTMDB(genre?: string): Promise<Movie[]> {
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

  const url = `${endpoint}?api_key=${apiKey}&language=es-ES&page=1`;
  
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

  // Transformar a formato simplificado
  return data.results.slice(0, 20).map((movie: any) => ({
    id: movie.id.toString(),
    title: movie.title || movie.original_title || 'Título no disponible',
    poster: movie.poster_path 
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://via.placeholder.com/500x750?text=Sin+Poster',
    overview: movie.overview || 'Descripción no disponible',
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