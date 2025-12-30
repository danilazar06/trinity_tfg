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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQXVGO0FBQ3ZGLDREQUErQjtBQUMvQiw4REFBOEQ7QUFDOUQsOENBQWlHO0FBRWpHLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFlNUQ7OztHQUdHO0FBQ0ksTUFBTSxPQUFPLEdBQXFDLEtBQUssRUFBRSxLQUFnQyxFQUFFLEVBQUU7SUFDbEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVqRSxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQztJQUN4QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBRTdCLElBQUk7UUFDRixRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLFdBQVc7Z0JBQ2QsT0FBTyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFckM7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsU0FBUyxFQUFFLENBQUMsQ0FBQztTQUMzRDtLQUNGO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsU0FBUyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxLQUFLLENBQUM7S0FDYjtBQUNILENBQUMsQ0FBQztBQWxCVyxRQUFBLE9BQU8sV0FrQmxCO0FBRUY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsU0FBUyxDQUFDLEtBQWM7SUFDckMsTUFBTSxLQUFLLEdBQUcsSUFBSSwwQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNoRCxNQUFNLFFBQVEsR0FBRyxVQUFVLEtBQUssSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUVoRCxJQUFJO1FBQ0Ysa0NBQWtDO1FBQ2xDLE1BQU0sWUFBWSxHQUFHLE1BQU0sZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JELElBQUksWUFBWSxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQzNDLElBQUEsd0JBQWMsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzFFLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQy9FLE9BQU8sWUFBWSxDQUFDO1NBQ3JCO1FBRUQsSUFBQSx3QkFBYyxFQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFMUMsNERBQTREO1FBQzVELE9BQU8sQ0FBQyxHQUFHLENBQUMsK0RBQStELENBQUMsQ0FBQztRQUM3RSxNQUFNLGFBQWEsR0FBRyxNQUFNLG9DQUFrQixDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXpGLCtCQUErQjtRQUMvQixNQUFNLFdBQVcsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFFM0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDeEUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDOUUsT0FBTyxhQUFhLENBQUM7S0FFdEI7SUFBQyxPQUFPLFFBQVEsRUFBRTtRQUNqQixPQUFPLENBQUMsSUFBSSxDQUFDLGlGQUFpRixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTFHLDJEQUEyRDtRQUMzRCxNQUFNLGNBQWMsR0FBRyxNQUFNLGVBQWUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0QsSUFBSSxjQUFjLElBQUksY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDL0MsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQ0FBMkMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDaEYsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDekYsT0FBTyxjQUFjLENBQUM7U0FDdkI7UUFFRCxtREFBbUQ7UUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sYUFBYSxHQUFHLGdCQUFnQixFQUFFLENBQUM7UUFDekMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbEYsT0FBTyxhQUFhLENBQUM7S0FDdEI7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsZUFBZSxDQUFDLFFBQWdCLEVBQUUsWUFBWSxHQUFHLEtBQUs7SUFDbkUsSUFBSTtRQUNGLE1BQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7WUFDbkQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQW1CO1lBQzFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7U0FDMUIsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRTtZQUNsQixPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQXlDLENBQUM7UUFFbEUsd0VBQXdFO1FBQ3hFLElBQUksQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRTtZQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDaEMsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELE9BQU8sTUFBTSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7S0FDNUI7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0MsT0FBTyxJQUFJLENBQUM7S0FDYjtBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxXQUFXLENBQUMsUUFBZ0IsRUFBRSxNQUFlO0lBQzFELElBQUk7UUFDRixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVTtRQUUzRSxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSx5QkFBVSxDQUFDO1lBQ2xDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFtQjtZQUMxQyxJQUFJLEVBQUU7Z0JBQ0osTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLE1BQU07Z0JBQ04sUUFBUSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2dCQUNsQyxHQUFHO2FBQ0o7U0FDRixDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLFFBQVEsRUFBRSxDQUFDLENBQUM7S0FDcEQ7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckQsd0NBQXdDO0tBQ3pDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLG1CQUFtQixDQUFDLEtBQWM7SUFDL0MsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7SUFDeEMsSUFBSSxDQUFDLE1BQU0sRUFBRTtRQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztLQUNoRDtJQUVELG1DQUFtQztJQUNuQyxJQUFJLFFBQVEsR0FBRyw0Q0FBNEMsQ0FBQztJQUM1RCxJQUFJLEtBQUssRUFBRTtRQUNULDBDQUEwQztRQUMxQyxRQUFRLEdBQUcsMkRBQTJELFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO0tBQzNGO0lBRUQsTUFBTSxHQUFHLEdBQUcsR0FBRyxRQUFRLFlBQVksTUFBTSx3QkFBd0IsQ0FBQztJQUVsRSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsb0JBQUssRUFBQyxHQUFHLEVBQUU7UUFDaEMsT0FBTyxFQUFFO1lBQ1AsUUFBUSxFQUFFLGtCQUFrQjtZQUM1QixZQUFZLEVBQUUsaUJBQWlCO1NBQ2hDO0tBQ0YsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUU7UUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztLQUM5RTtJQUVELE1BQU0sSUFBSSxHQUFRLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRXhDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDakQsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO0tBQ3ZEO0lBRUQscUNBQXFDO0lBQ3JDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRCxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUU7UUFDdkIsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLGNBQWMsSUFBSSxzQkFBc0I7UUFDcEUsTUFBTSxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQ3ZCLENBQUMsQ0FBQyxrQ0FBa0MsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUN2RCxDQUFDLENBQUMscURBQXFEO1FBQ3pELFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxJQUFJLDJCQUEyQjtLQUN4RCxDQUFDLENBQUMsQ0FBQztBQUNOLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsVUFBVSxDQUFDLFNBQWlCO0lBQ25DLE1BQU0sUUFBUSxHQUE4QjtRQUMxQyxRQUFRLEVBQUUsSUFBSTtRQUNkLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLFFBQVEsRUFBRSxJQUFJO1FBQ2QsT0FBTyxFQUFFLElBQUk7UUFDYixhQUFhLEVBQUUsSUFBSTtRQUNuQixPQUFPLEVBQUUsSUFBSTtRQUNiLFFBQVEsRUFBRSxPQUFPO1FBQ2pCLFNBQVMsRUFBRSxJQUFJO1FBQ2YsU0FBUyxFQUFFLElBQUk7UUFDZixRQUFRLEVBQUUsSUFBSTtRQUNkLE9BQU8sRUFBRSxPQUFPO1FBQ2hCLFNBQVMsRUFBRSxNQUFNO1FBQ2pCLFNBQVMsRUFBRSxPQUFPO1FBQ2xCLGlCQUFpQixFQUFFLEtBQUs7UUFDeEIsVUFBVSxFQUFFLElBQUk7UUFDaEIsS0FBSyxFQUFFLE9BQU87UUFDZCxTQUFTLEVBQUUsSUFBSTtLQUNoQixDQUFDO0lBRUYsT0FBTyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsa0JBQWtCO0FBQ3RFLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsZ0JBQWdCO0lBQ3ZCLE9BQU87UUFDTDtZQUNFLEVBQUUsRUFBRSxXQUFXO1lBQ2YsS0FBSyxFQUFFLFlBQVk7WUFDbkIsTUFBTSxFQUFFLHFEQUFxRDtZQUM3RCxRQUFRLEVBQUUsZ0VBQWdFO1NBQzNFO1FBQ0Q7WUFDRSxFQUFFLEVBQUUsV0FBVztZQUNmLEtBQUssRUFBRSxjQUFjO1lBQ3JCLE1BQU0sRUFBRSx1REFBdUQ7WUFDL0QsUUFBUSxFQUFFLGtEQUFrRDtTQUM3RDtRQUNEO1lBQ0UsRUFBRSxFQUFFLFdBQVc7WUFDZixLQUFLLEVBQUUseUJBQXlCO1lBQ2hDLE1BQU0sRUFBRSwrQ0FBK0M7WUFDdkQsUUFBUSxFQUFFLG9EQUFvRDtTQUMvRDtRQUNEO1lBQ0UsRUFBRSxFQUFFLFdBQVc7WUFDZixLQUFLLEVBQUUsY0FBYztZQUNyQixNQUFNLEVBQUUsdURBQXVEO1lBQy9ELFFBQVEsRUFBRSw2Q0FBNkM7U0FDeEQ7UUFDRDtZQUNFLEVBQUUsRUFBRSxXQUFXO1lBQ2YsS0FBSyxFQUFFLFFBQVE7WUFDZixNQUFNLEVBQUUsaURBQWlEO1lBQ3pELFFBQVEsRUFBRSxzREFBc0Q7U0FDakU7S0FDRixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcFN5bmNSZXNvbHZlckV2ZW50LCBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCBmZXRjaCBmcm9tICdub2RlLWZldGNoJztcclxuaW1wb3J0IHsgdG1kYkNpcmN1aXRCcmVha2VyIH0gZnJvbSAnLi4vdXRpbHMvY2lyY3VpdC1icmVha2VyJztcclxuaW1wb3J0IHsgbG9nQ2FjaGVNZXRyaWMsIGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgTW92aWUge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgdGl0bGU6IHN0cmluZztcclxuICBwb3N0ZXI6IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2FjaGVkTW92aWUgZXh0ZW5kcyBNb3ZpZSB7XHJcbiAgdG1kYklkOiBzdHJpbmc7XHJcbiAgY2FjaGVkQXQ6IHN0cmluZztcclxuICB0dGw6IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1vdmllSGFuZGxlcjogQ2lyY3VpdCBCcmVha2VyICsgQ2FjaGVcclxuICogSW1wbGVtZW50YSBwYXRyw7NuIENpcmN1aXQgQnJlYWtlciBwYXJhIEFQSSBUTURCIGNvbiBjYWNoZSBlbiBEeW5hbW9EQlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/CfjqwgTW92aWUgSGFuZGxlcjonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG5cclxuICBjb25zdCBmaWVsZE5hbWUgPSBldmVudC5pbmZvPy5maWVsZE5hbWU7XHJcbiAgY29uc3QgYXJncyA9IGV2ZW50LmFyZ3VtZW50cztcclxuXHJcbiAgdHJ5IHtcclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2dldE1vdmllcyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE1vdmllcyhhcmdzLmdlbnJlKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBjb24gQ2lyY3VpdCBCcmVha2VyXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRNb3ZpZXMoZ2VucmU/OiBzdHJpbmcpOiBQcm9taXNlPE1vdmllW10+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdHZXRNb3ZpZXMnKTtcclxuICBjb25zdCBjYWNoZUtleSA9IGBtb3ZpZXNfJHtnZW5yZSB8fCAncG9wdWxhcid9YDtcclxuICBcclxuICB0cnkge1xyXG4gICAgLy8gMS4gSW50ZW50YXIgb2J0ZW5lciBkZXNkZSBjYWNoZVxyXG4gICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgZ2V0Q2FjaGVkTW92aWVzKGNhY2hlS2V5KTtcclxuICAgIGlmIChjYWNoZWRNb3ZpZXMgJiYgY2FjaGVkTW92aWVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgbG9nQ2FjaGVNZXRyaWMoJ01PVklFUycsIHRydWUsIGNhY2hlS2V5KTtcclxuICAgICAgY29uc29sZS5sb2coYPCfkr4gUGVsw61jdWxhcyBvYnRlbmlkYXMgZGVzZGUgY2FjaGU6ICR7Y2FjaGVkTW92aWVzLmxlbmd0aH1gKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBzb3VyY2U6ICdjYWNoZScsIGNvdW50OiBjYWNoZWRNb3ZpZXMubGVuZ3RoIH0pO1xyXG4gICAgICByZXR1cm4gY2FjaGVkTW92aWVzO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ0NhY2hlTWV0cmljKCdNT1ZJRVMnLCBmYWxzZSwgY2FjaGVLZXkpO1xyXG5cclxuICAgIC8vIDIuIFNpIG5vIGhheSBjYWNoZSwgaW50ZW50YXIgQVBJIFRNREIgY29uIENpcmN1aXQgQnJlYWtlclxyXG4gICAgY29uc29sZS5sb2coJ/CfjJAgT2J0ZW5pZW5kbyBwZWzDrWN1bGFzIGRlc2RlIFRNREIgQVBJIGNvbiBDaXJjdWl0IEJyZWFrZXIuLi4nKTtcclxuICAgIGNvbnN0IG1vdmllc0Zyb21BUEkgPSBhd2FpdCB0bWRiQ2lyY3VpdEJyZWFrZXIuZXhlY3V0ZSgoKSA9PiBmZXRjaE1vdmllc0Zyb21UTURCKGdlbnJlKSk7XHJcbiAgICBcclxuICAgIC8vIDMuIENhY2hlYXIgcmVzdWx0YWRvIGV4aXRvc29cclxuICAgIGF3YWl0IGNhY2hlTW92aWVzKGNhY2hlS2V5LCBtb3ZpZXNGcm9tQVBJKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYOKchSBQZWzDrWN1bGFzIG9idGVuaWRhcyBkZXNkZSBBUEk6ICR7bW92aWVzRnJvbUFQSS5sZW5ndGh9YCk7XHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHNvdXJjZTogJ2FwaScsIGNvdW50OiBtb3ZpZXNGcm9tQVBJLmxlbmd0aCB9KTtcclxuICAgIHJldHVybiBtb3ZpZXNGcm9tQVBJO1xyXG5cclxuICB9IGNhdGNoIChhcGlFcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZW4gQVBJIFRNREIgKENpcmN1aXQgQnJlYWtlciBhY3Rpdm8pLCBpbnRlbnRhbmRvIGZhbGxiYWNrIGRlc2RlIGNhY2hlOicsIGFwaUVycm9yKTtcclxuICAgIFxyXG4gICAgLy8gNC4gRmFsbGJhY2s6IGludGVudGFyIGNhY2hlIGV4cGlyYWRvIGNvbW8gw7psdGltbyByZWN1cnNvXHJcbiAgICBjb25zdCBmYWxsYmFja01vdmllcyA9IGF3YWl0IGdldENhY2hlZE1vdmllcyhjYWNoZUtleSwgdHJ1ZSk7XHJcbiAgICBpZiAoZmFsbGJhY2tNb3ZpZXMgJiYgZmFsbGJhY2tNb3ZpZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBVc2FuZG8gY2FjaGUgZXhwaXJhZG8gY29tbyBmYWxsYmFjazogJHtmYWxsYmFja01vdmllcy5sZW5ndGh9YCk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgc291cmNlOiAnZXhwaXJlZF9jYWNoZScsIGNvdW50OiBmYWxsYmFja01vdmllcy5sZW5ndGggfSk7XHJcbiAgICAgIHJldHVybiBmYWxsYmFja01vdmllcztcclxuICAgIH1cclxuXHJcbiAgICAvLyA1LiBTaSB0b2RvIGZhbGxhLCByZXRvcm5hciBwZWzDrWN1bGFzIHBvciBkZWZlY3RvXHJcbiAgICBjb25zb2xlLmxvZygn8J+OrSBVc2FuZG8gcGVsw61jdWxhcyBwb3IgZGVmZWN0byAtIENpcmN1aXQgQnJlYWtlciBwcm90ZWdpw7MgZWwgc2lzdGVtYScpO1xyXG4gICAgY29uc3QgZGVmYXVsdE1vdmllcyA9IGdldERlZmF1bHRNb3ZpZXMoKTtcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgc291cmNlOiAnZGVmYXVsdCcsIGNvdW50OiBkZWZhdWx0TW92aWVzLmxlbmd0aCB9KTtcclxuICAgIHJldHVybiBkZWZhdWx0TW92aWVzO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBkZXNkZSBjYWNoZSBEeW5hbW9EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2FjaGVkTW92aWVzKGNhY2hlS2V5OiBzdHJpbmcsIGFsbG93RXhwaXJlZCA9IGZhbHNlKTogUHJvbWlzZTxNb3ZpZVtdIHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgdG1kYklkOiBjYWNoZUtleSB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjYWNoZWQgPSByZXNwb25zZS5JdGVtIGFzIENhY2hlZE1vdmllICYgeyBtb3ZpZXM6IE1vdmllW10gfTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZpY2FyIHNpIGVsIGNhY2hlIGhhIGV4cGlyYWRvIChhIG1lbm9zIHF1ZSBhbGxvd0V4cGlyZWQgc2VhIHRydWUpXHJcbiAgICBpZiAoIWFsbG93RXhwaXJlZCAmJiBjYWNoZWQudHRsIDwgTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KPsCBDYWNoZSBleHBpcmFkbycpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FjaGVkLm1vdmllcyB8fCBbXTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgbGV5ZW5kbyBjYWNoZTonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYWNoZWFyIHBlbMOtY3VsYXMgZW4gRHluYW1vREIgY29uIFRUTCBkZSAzMCBkw61hc1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY2FjaGVNb3ZpZXMoY2FjaGVLZXk6IHN0cmluZywgbW92aWVzOiBNb3ZpZVtdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgKDMwICogMjQgKiA2MCAqIDYwKTsgLy8gMzAgZMOtYXNcclxuICAgIFxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52Lk1PVklFU19DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICB0bWRiSWQ6IGNhY2hlS2V5LFxyXG4gICAgICAgIG1vdmllcyxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHR0bCxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBQZWzDrWN1bGFzIGNhY2hlYWRhczogJHtjYWNoZUtleX1gKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgY2FjaGVhbmRvIHBlbMOtY3VsYXM6JywgZXJyb3IpO1xyXG4gICAgLy8gTm8gbGFuemFyIGVycm9yLCBlbCBjYWNoZSBlcyBvcGNpb25hbFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBkZXNkZSBBUEkgVE1EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb3ZpZXNGcm9tVE1EQihnZW5yZT86IHN0cmluZyk6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIC8vIERldGVybWluYXIgZW5kcG9pbnQgc2Vnw7puIGfDqW5lcm9cclxuICBsZXQgZW5kcG9pbnQgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9tb3ZpZS9wb3B1bGFyJztcclxuICBpZiAoZ2VucmUpIHtcclxuICAgIC8vIFBhcmEgZ8OpbmVyb3MgZXNwZWPDrWZpY29zLCB1c2FyIGRpc2NvdmVyXHJcbiAgICBlbmRwb2ludCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL2Rpc2NvdmVyL21vdmllP3dpdGhfZ2VucmVzPSR7Z2V0R2VucmVJZChnZW5yZSl9YDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHVybCA9IGAke2VuZHBvaW50fT9hcGlfa2V5PSR7YXBpS2V5fSZsYW5ndWFnZT1lcy1FUyZwYWdlPTFgO1xyXG4gIFxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICBoZWFkZXJzOiB7XHJcbiAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQXBwLzEuMCcsXHJcbiAgICB9LFxyXG4gIH0pO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZGF0YTogYW55ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gIFxyXG4gIGlmICghZGF0YS5yZXN1bHRzIHx8ICFBcnJheS5pc0FycmF5KGRhdGEucmVzdWx0cykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignRm9ybWF0byBkZSByZXNwdWVzdGEgVE1EQiBpbnbDoWxpZG8nKTtcclxuICB9XHJcblxyXG4gIC8vIFRyYW5zZm9ybWFyIGEgZm9ybWF0byBzaW1wbGlmaWNhZG9cclxuICByZXR1cm4gZGF0YS5yZXN1bHRzLnNsaWNlKDAsIDIwKS5tYXAoKG1vdmllOiBhbnkpID0+ICh7XHJcbiAgICBpZDogbW92aWUuaWQudG9TdHJpbmcoKSxcclxuICAgIHRpdGxlOiBtb3ZpZS50aXRsZSB8fCBtb3ZpZS5vcmlnaW5hbF90aXRsZSB8fCAnVMOtdHVsbyBubyBkaXNwb25pYmxlJyxcclxuICAgIHBvc3RlcjogbW92aWUucG9zdGVyX3BhdGggXHJcbiAgICAgID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAke21vdmllLnBvc3Rlcl9wYXRofWBcclxuICAgICAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1TaW4rUG9zdGVyJyxcclxuICAgIG92ZXJ2aWV3OiBtb3ZpZS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gIH0pKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcGVhciBub21icmVzIGRlIGfDqW5lcm9zIGEgSURzIGRlIFRNREJcclxuICovXHJcbmZ1bmN0aW9uIGdldEdlbnJlSWQoZ2VucmVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGdlbnJlTWFwOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge1xyXG4gICAgJ2FjdGlvbic6ICcyOCcsXHJcbiAgICAnYWR2ZW50dXJlJzogJzEyJyxcclxuICAgICdhbmltYXRpb24nOiAnMTYnLFxyXG4gICAgJ2NvbWVkeSc6ICczNScsXHJcbiAgICAnY3JpbWUnOiAnODAnLFxyXG4gICAgJ2RvY3VtZW50YXJ5JzogJzk5JyxcclxuICAgICdkcmFtYSc6ICcxOCcsXHJcbiAgICAnZmFtaWx5JzogJzEwNzUxJyxcclxuICAgICdmYW50YXN5JzogJzE0JyxcclxuICAgICdoaXN0b3J5JzogJzM2JyxcclxuICAgICdob3Jyb3InOiAnMjcnLFxyXG4gICAgJ211c2ljJzogJzEwNDAyJyxcclxuICAgICdteXN0ZXJ5JzogJzk2NDgnLFxyXG4gICAgJ3JvbWFuY2UnOiAnMTA3NDknLFxyXG4gICAgJ3NjaWVuY2VfZmljdGlvbic6ICc4NzgnLFxyXG4gICAgJ3RocmlsbGVyJzogJzUzJyxcclxuICAgICd3YXInOiAnMTA3NTInLFxyXG4gICAgJ3dlc3Rlcm4nOiAnMzcnLFxyXG4gIH07XHJcblxyXG4gIHJldHVybiBnZW5yZU1hcFtnZW5yZU5hbWUudG9Mb3dlckNhc2UoKV0gfHwgJzI4JzsgLy8gRGVmYXVsdDogQWN0aW9uXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQZWzDrWN1bGFzIHBvciBkZWZlY3RvIGN1YW5kbyB0b2RvIGZhbGxhXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXREZWZhdWx0TW92aWVzKCk6IE1vdmllW10ge1xyXG4gIHJldHVybiBbXHJcbiAgICB7XHJcbiAgICAgIGlkOiAnZGVmYXVsdF8xJyxcclxuICAgICAgdGl0bGU6ICdFbCBQYWRyaW5vJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1FbCtQYWRyaW5vJyxcclxuICAgICAgb3ZlcnZpZXc6ICdMYSBoaXN0b3JpYSBkZSB1bmEgZmFtaWxpYSBkZSBsYSBtYWZpYSBpdGFsaWFuYSBlbiBOdWV2YSBZb3JrLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfMicsXHJcbiAgICAgIHRpdGxlOiAnUHVscCBGaWN0aW9uJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1QdWxwK0ZpY3Rpb24nLFxyXG4gICAgICBvdmVydmlldzogJ0hpc3RvcmlhcyBlbnRyZWxhemFkYXMgZGUgY3JpbWVuIGVuIExvcyDDgW5nZWxlcy4nLFxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgaWQ6ICdkZWZhdWx0XzMnLFxyXG4gICAgICB0aXRsZTogJ0VsIFNlw7FvciBkZSBsb3MgQW5pbGxvcycsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS81MDB4NzUwP3RleHQ9TE9UUicsXHJcbiAgICAgIG92ZXJ2aWV3OiAnVW5hIMOpcGljYSBhdmVudHVyYSBkZSBmYW50YXPDrWEgZW4gbGEgVGllcnJhIE1lZGlhLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfNCcsXHJcbiAgICAgIHRpdGxlOiAnRm9ycmVzdCBHdW1wJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1Gb3JyZXN0K0d1bXAnLFxyXG4gICAgICBvdmVydmlldzogJ0xhIGV4dHJhb3JkaW5hcmlhIHZpZGEgZGUgdW4gaG9tYnJlIHNpbXBsZS4nLFxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgaWQ6ICdkZWZhdWx0XzUnLFxyXG4gICAgICB0aXRsZTogJ01hdHJpeCcsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS81MDB4NzUwP3RleHQ9TWF0cml4JyxcclxuICAgICAgb3ZlcnZpZXc6ICdVbiBwcm9ncmFtYWRvciBkZXNjdWJyZSBsYSB2ZXJkYWQgc29icmUgbGEgcmVhbGlkYWQuJyxcclxuICAgIH0sXHJcbiAgXTtcclxufSJdfQ==