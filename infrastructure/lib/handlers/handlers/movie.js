"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const node_fetch_1 = __importDefault(require("node-fetch"));
const circuit_breaker_1 = require("../utils/circuit-breaker");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * MovieHandler: Circuit Breaker + Cache
 * Implementa patrón Circuit Breaker para API TMDB con cache en DynamoDB
 */
const handler = async (event) => {
    console.log('🎬 Movie Handler:', JSON.stringify(event, null, 2));
    const fieldName = event.info?.fieldName;
    const args = event.arguments;
    try {
        switch (fieldName) {
            case 'getMovies':
                return await getMovies(args.genre);
            case 'getMovieDetails':
                return await getMovieDetails(args.movieId);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Obtener películas con Circuit Breaker
 */
async function getMovies(genre) {
    const timer = new metrics_1.PerformanceTimer('GetMovies');
    const cacheKey = `movies_${genre || 'popular'}`;
    try {
        // 1. Intentar obtener desde cache
        const cachedMovies = await getCachedMovies(cacheKey);
        if (cachedMovies && cachedMovies.length > 0) {
            (0, metrics_1.logCacheMetric)('MOVIES', true, cacheKey);
            console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
            timer.finish(true, undefined, { source: 'cache', count: cachedMovies.length });
            return cachedMovies;
        }
        (0, metrics_1.logCacheMetric)('MOVIES', false, cacheKey);
        // 2. Si no hay cache, intentar API TMDB con Circuit Breaker
        console.log('🌐 Obteniendo películas desde TMDB API con Circuit Breaker...');
        const moviesFromAPI = await circuit_breaker_1.tmdbCircuitBreaker.execute(() => fetchMoviesFromTMDB(genre));
        // 3. Cachear resultado exitoso
        await cacheMovies(cacheKey, moviesFromAPI);
        console.log(`✅ Películas obtenidas desde API: ${moviesFromAPI.length}`);
        timer.finish(true, undefined, { source: 'api', count: moviesFromAPI.length });
        return moviesFromAPI;
    }
    catch (apiError) {
        console.warn('⚠️ Error en API TMDB (Circuit Breaker activo), intentando fallback desde cache:', apiError);
        // 4. Fallback: intentar cache expirado como último recurso
        const fallbackMovies = await getCachedMovies(cacheKey, true);
        if (fallbackMovies && fallbackMovies.length > 0) {
            console.log(`🔄 Usando cache expirado como fallback: ${fallbackMovies.length}`);
            timer.finish(true, undefined, { source: 'expired_cache', count: fallbackMovies.length });
            return fallbackMovies;
        }
        // 5. Si todo falla, retornar películas por defecto
        console.log('🎭 Usando películas por defecto - Circuit Breaker protegió el sistema');
        const defaultMovies = getDefaultMovies();
        timer.finish(true, undefined, { source: 'default', count: defaultMovies.length });
        return defaultMovies;
    }
}
/**
 * Obtener películas desde cache DynamoDB
 */
async function getCachedMovies(cacheKey, allowExpired = false) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: cacheKey },
        }));
        if (!response.Item) {
            return null;
        }
        const cached = response.Item;
        // Verificar si el cache ha expirado (a menos que allowExpired sea true)
        if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
            console.log('⏰ Cache expirado');
            return null;
        }
        return cached.movies || [];
    }
    catch (error) {
        console.warn('⚠️ Error leyendo cache:', error);
        return null;
    }
}
/**
 * Cachear películas en DynamoDB con TTL de 30 días
 */
async function cacheMovies(cacheKey, movies) {
    try {
        const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Item: {
                tmdbId: cacheKey,
                movies,
                cachedAt: new Date().toISOString(),
                ttl,
            },
        }));
        console.log(`💾 Películas cacheadas: ${cacheKey}`);
    }
    catch (error) {
        console.warn('⚠️ Error cacheando películas:', error);
        // No lanzar error, el cache es opcional
    }
}
/**
 * Obtener películas desde API TMDB
 */
async function fetchMoviesFromTMDB(genre) {
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
    const response = await (0, node_fetch_1.default)(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Trinity-App/1.0',
        },
    });
    if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
        throw new Error('Formato de respuesta TMDB inválido');
    }
    // Transformar a formato simplificado
    return data.results.slice(0, 20).map((movie) => ({
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
function getGenreId(genreName) {
    const genreMap = {
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
async function getMovieDetails(movieId) {
    const timer = new metrics_1.PerformanceTimer('GetMovieDetails');
    const cacheKey = `movie_details_${movieId}`;
    try {
        // 1. Intentar obtener desde cache
        const cachedMovie = await getCachedMovieDetails(cacheKey);
        if (cachedMovie) {
            (0, metrics_1.logCacheMetric)('MOVIES', true, cacheKey);
            console.log(`💾 Detalles de película obtenidos desde cache: ${movieId}`);
            timer.finish(true, undefined, { source: 'cache', movieId });
            return cachedMovie;
        }
        (0, metrics_1.logCacheMetric)('MOVIES', false, cacheKey);
        // 2. Si no hay cache, intentar API TMDB con Circuit Breaker
        console.log(`🌐 Obteniendo detalles de película ${movieId} desde TMDB API...`);
        const movieDetails = await circuit_breaker_1.tmdbCircuitBreaker.execute(() => fetchMovieDetailsFromTMDB(movieId));
        // 3. Cachear resultado exitoso
        await cacheMovieDetails(cacheKey, movieDetails);
        console.log(`✅ Detalles de película obtenidos desde API: ${movieDetails.title}`);
        timer.finish(true, undefined, { source: 'api', movieId, title: movieDetails.title });
        return movieDetails;
    }
    catch (apiError) {
        console.warn(`⚠️ Error en API TMDB para película ${movieId}, intentando fallback:`, apiError);
        // 4. Fallback: intentar cache expirado
        const fallbackMovie = await getCachedMovieDetails(cacheKey, true);
        if (fallbackMovie) {
            console.log(`🔄 Usando cache expirado como fallback para película ${movieId}`);
            timer.finish(true, undefined, { source: 'expired_cache', movieId });
            return fallbackMovie;
        }
        // 5. Si todo falla, retornar película por defecto
        console.log(`🎭 Usando película por defecto para ID ${movieId}`);
        const defaultMovie = getDefaultMovieDetails(movieId);
        timer.finish(true, undefined, { source: 'default', movieId });
        return defaultMovie;
    }
}
/**
 * Obtener detalles de película desde cache DynamoDB
 */
async function getCachedMovieDetails(cacheKey, allowExpired = false) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: cacheKey },
        }));
        if (!response.Item) {
            return null;
        }
        const cached = response.Item;
        // Verificar si el cache ha expirado
        if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
            console.log('⏰ Cache de detalles expirado');
            return null;
        }
        return cached.movieDetails || null;
    }
    catch (error) {
        console.warn('⚠️ Error leyendo cache de detalles:', error);
        return null;
    }
}
/**
 * Cachear detalles de película en DynamoDB
 */
async function cacheMovieDetails(cacheKey, movieDetails) {
    try {
        const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Item: {
                tmdbId: cacheKey,
                movieDetails,
                cachedAt: new Date().toISOString(),
                ttl,
            },
        }));
        console.log(`💾 Detalles de película cacheados: ${cacheKey}`);
    }
    catch (error) {
        console.warn('⚠️ Error cacheando detalles de película:', error);
    }
}
/**
 * Obtener detalles de película desde API TMDB
 */
async function fetchMovieDetailsFromTMDB(movieId) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB_API_KEY no configurada');
    }
    const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=es-ES&append_to_response=credits,videos`;
    const response = await (0, node_fetch_1.default)(url, {
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
    const movie = await response.json();
    // Transformar a formato GraphQL esperado
    return {
        id: movie.id.toString(),
        title: movie.title || movie.original_title || 'Título no disponible',
        overview: movie.overview || 'Descripción no disponible',
        posterPath: movie.poster_path || null,
        backdropPath: movie.backdrop_path || null,
        releaseDate: movie.release_date || '',
        voteAverage: movie.vote_average || 0,
        genres: movie.genres?.map((g) => ({ id: g.id, name: g.name })) || [],
        runtime: movie.runtime || null,
    };
}
/**
 * Detalles de película por defecto cuando todo falla
 */
function getDefaultMovieDetails(movieId) {
    return {
        id: movieId,
        title: 'Película no disponible',
        overview: 'Los detalles de esta película no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
        posterPath: null,
        backdropPath: null,
        releaseDate: '',
        voteAverage: 0,
        genres: [],
        runtime: null,
    };
}
/**
 * Películas por defecto cuando todo falla
 */
function getDefaultMovies() {
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
