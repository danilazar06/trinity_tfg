"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const node_fetch_1 = __importDefault(require("node-fetch"));
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
    }
    catch (apiError) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQXVGO0FBQ3ZGLDREQUErQjtBQUUvQixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBZTVEOzs7R0FHRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFO0lBQ2xHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7SUFDeEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztJQUU3QixJQUFJO1FBQ0YsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyxXQUFXO2dCQUNkLE9BQU8sTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJDO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFNBQVMsRUFBRSxDQUFDLENBQUM7U0FDM0Q7S0FDRjtJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxDQUFDO0tBQ2I7QUFDSCxDQUFDLENBQUM7QUFsQlcsUUFBQSxPQUFPLFdBa0JsQjtBQUVGOztHQUVHO0FBQ0gsS0FBSyxVQUFVLFNBQVMsQ0FBQyxLQUFjO0lBQ3JDLE1BQU0sUUFBUSxHQUFHLFVBQVUsS0FBSyxJQUFJLFNBQVMsRUFBRSxDQUFD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QUFFLElBQUk7UUFDZCxPQUFPLEVBQUUsT0FBTztRQUNoQixTQUFTLEVBQUUsTUFBTTtRQUNqQixTQUFTLEVBQUUsT0FBTztRQUNsQixpQkFBaUIsRUFBRSxLQUFLO1FBQ3hCLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLEtBQUssRUFBRSxPQUFPO1FBQ2QsU0FBUyxFQUFFLElBQUk7S0FDaEIsQ0FBQztJQUVGLE9BQU8sUUFBUSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLGtCQUFrQjtBQUN0RSxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGdCQUFnQjtJQUN2QixPQUFPO1FBQ0w7WUFDRSxFQUFFLEVBQUUsV0FBVztZQUNmLEtBQUssRUFBRSxZQUFZO1lBQ25CLE1BQU0sRUFBRSxxREFBcUQ7WUFDN0QsUUFBUSxFQUFFLGdFQUFnRTtTQUMzRTtRQUNEO1lBQ0UsRUFBRSxFQUFFLFdBQVc7WUFDZixLQUFLLEVBQUUsY0FBYztZQUNyQixNQUFNLEVBQUUsdURBQXVEO1lBQy9ELFFBQVEsRUFBRSxrREFBa0Q7U0FDN0Q7UUFDRDtZQUNFLEVBQUUsRUFBRSxXQUFXO1lBQ2YsS0FBSyxFQUFFLHlCQUF5QjtZQUNoQyxNQUFNLEVBQUUsK0NBQStDO1lBQ3ZELFFBQVEsRUFBRSxvREFBb0Q7U0FDL0Q7UUFDRDtZQUNFLEVBQUUsRUFBRSxXQUFXO1lBQ2YsS0FBSyxFQUFFLGNBQWM7WUFDckIsTUFBTSxFQUFFLHVEQUF1RDtZQUMvRCxRQUFRLEVBQUUsNkNBQTZDO1NBQ3hEO1FBQ0Q7WUFDRSxFQUFFLEVBQUUsV0FBVztZQUNmLEtBQUssRUFBRSxRQUFRO1lBQ2YsTUFBTSxFQUFFLGlEQUFpRDtZQUN6RCxRQUFRLEVBQUUsc0RBQXNEO1NBQ2pFO0tBQ0YsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5pbXBvcnQgZmV0Y2ggZnJvbSAnbm9kZS1mZXRjaCc7XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcclxuXHJcbmludGVyZmFjZSBNb3ZpZSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHBvc3Rlcjogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDYWNoZWRNb3ZpZSBleHRlbmRzIE1vdmllIHtcclxuICB0bWRiSWQ6IHN0cmluZztcclxuICBjYWNoZWRBdDogc3RyaW5nO1xyXG4gIHR0bDogbnVtYmVyO1xyXG59XHJcblxyXG4vKipcclxuICogTW92aWVIYW5kbGVyOiBDaXJjdWl0IEJyZWFrZXIgKyBDYWNoZVxyXG4gKiBJbXBsZW1lbnRhIHBhdHLDs24gQ2lyY3VpdCBCcmVha2VyIHBhcmEgQVBJIFRNREIgY29uIGNhY2hlIGVuIER5bmFtb0RCXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+OrCBNb3ZpZSBIYW5kbGVyOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gIGNvbnN0IGZpZWxkTmFtZSA9IGV2ZW50LmluZm8/LmZpZWxkTmFtZTtcclxuICBjb25zdCBhcmdzID0gZXZlbnQuYXJndW1lbnRzO1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnZ2V0TW92aWVzJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgZ2V0TW92aWVzKGFyZ3MuZ2VucmUpO1xyXG4gICAgICBcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhY2nDs24gbm8gc29wb3J0YWRhOiAke2ZpZWxkTmFtZX1gKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVuICR7ZmllbGROYW1lfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBwZWzDrWN1bGFzIGNvbiBDaXJjdWl0IEJyZWFrZXJcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldE1vdmllcyhnZW5yZT86IHN0cmluZyk6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGNhY2hlS2V5ID0gYG1vdmllc18ke2dlbnJlIHx8ICdwb3B1bGFyJ31gO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyAxLiBJbnRlbnRhciBvYnRlbmVyIGRlc2RlIGNhY2hlXHJcbiAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBnZXRDYWNoZWRNb3ZpZXMoY2FjaGVLZXkpO1xyXG4gICAgaWYgKGNhY2hlZE1vdmllcyAmJiBjYWNoZWRNb3ZpZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+SviBQZWzDrWN1bGFzIG9idGVuaWRhcyBkZXNkZSBjYWNoZTogJHtjYWNoZWRNb3ZpZXMubGVuZ3RofWApO1xyXG4gICAgICByZXR1cm4gY2FjaGVkTW92aWVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDIuIFNpIG5vIGhheSBjYWNoZSwgaW50ZW50YXIgQVBJIFRNREJcclxuICAgIGNvbnNvbGUubG9nKCfwn4yQIE9idGVuaWVuZG8gcGVsw61jdWxhcyBkZXNkZSBUTURCIEFQSS4uLicpO1xyXG4gICAgY29uc3QgbW92aWVzRnJvbUFQSSA9IGF3YWl0IGZldGNoTW92aWVzRnJvbVRNREIoZ2VucmUpO1xyXG4gICAgXHJcbiAgICAvLyAzLiBDYWNoZWFyIHJlc3VsdGFkbyBleGl0b3NvXHJcbiAgICBhd2FpdCBjYWNoZU1vdmllcyhjYWNoZUtleSwgbW92aWVzRnJvbUFQSSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUGVsw61jdWxhcyBvYnRlbmlkYXMgZGVzZGUgQVBJOiAke21vdmllc0Zyb21BUEkubGVuZ3RofWApO1xyXG4gICAgcmV0dXJuIG1vdmllc0Zyb21BUEk7XHJcblxyXG4gIH0gY2F0Y2ggKGFwaUVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBlbiBBUEkgVE1EQiwgaW50ZW50YW5kbyBmYWxsYmFjayBkZXNkZSBjYWNoZTonLCBhcGlFcnJvcik7XHJcbiAgICBcclxuICAgIC8vIDQuIEZhbGxiYWNrOiBpbnRlbnRhciBjYWNoZSBleHBpcmFkbyBjb21vIMO6bHRpbW8gcmVjdXJzb1xyXG4gICAgY29uc3QgZmFsbGJhY2tNb3ZpZXMgPSBhd2FpdCBnZXRDYWNoZWRNb3ZpZXMoY2FjaGVLZXksIHRydWUpO1xyXG4gICAgaWYgKGZhbGxiYWNrTW92aWVzICYmIGZhbGxiYWNrTW92aWVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc29sZS5sb2coYPCflIQgVXNhbmRvIGNhY2hlIGV4cGlyYWRvIGNvbW8gZmFsbGJhY2s6ICR7ZmFsbGJhY2tNb3ZpZXMubGVuZ3RofWApO1xyXG4gICAgICByZXR1cm4gZmFsbGJhY2tNb3ZpZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gNS4gU2kgdG9kbyBmYWxsYSwgcmV0b3JuYXIgcGVsw61jdWxhcyBwb3IgZGVmZWN0b1xyXG4gICAgY29uc29sZS5sb2coJ/Cfjq0gVXNhbmRvIHBlbMOtY3VsYXMgcG9yIGRlZmVjdG8nKTtcclxuICAgIHJldHVybiBnZXREZWZhdWx0TW92aWVzKCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBwZWzDrWN1bGFzIGRlc2RlIGNhY2hlIER5bmFtb0RCXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRDYWNoZWRNb3ZpZXMoY2FjaGVLZXk6IHN0cmluZywgYWxsb3dFeHBpcmVkID0gZmFsc2UpOiBQcm9taXNlPE1vdmllW10gfCBudWxsPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52Lk1PVklFU19DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEtleTogeyB0bWRiSWQ6IGNhY2hlS2V5IH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNhY2hlZCA9IHJlc3BvbnNlLkl0ZW0gYXMgQ2FjaGVkTW92aWUgJiB7IG1vdmllczogTW92aWVbXSB9O1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZmljYXIgc2kgZWwgY2FjaGUgaGEgZXhwaXJhZG8gKGEgbWVub3MgcXVlIGFsbG93RXhwaXJlZCBzZWEgdHJ1ZSlcclxuICAgIGlmICghYWxsb3dFeHBpcmVkICYmIGNhY2hlZC50dGwgPCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSkge1xyXG4gICAgICBjb25zb2xlLmxvZygn4o+wIENhY2hlIGV4cGlyYWRvJyk7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWNoZWQubW92aWVzIHx8IFtdO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBsZXllbmRvIGNhY2hlOicsIGVycm9yKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENhY2hlYXIgcGVsw61jdWxhcyBlbiBEeW5hbW9EQiBjb24gVFRMIGRlIDMwIGTDrWFzXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjYWNoZU1vdmllcyhjYWNoZUtleTogc3RyaW5nLCBtb3ZpZXM6IE1vdmllW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgdHRsID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoMzAgKiAyNCAqIDYwICogNjApOyAvLyAzMCBkw61hc1xyXG4gICAgXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVTX0NBQ0hFX1RBQkxFISxcclxuICAgICAgSXRlbToge1xyXG4gICAgICAgIHRtZGJJZDogY2FjaGVLZXksXHJcbiAgICAgICAgbW92aWVzLFxyXG4gICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdHRsLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5K+IFBlbMOtY3VsYXMgY2FjaGVhZGFzOiAke2NhY2hlS2V5fWApO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBjYWNoZWFuZG8gcGVsw61jdWxhczonLCBlcnJvcik7XHJcbiAgICAvLyBObyBsYW56YXIgZXJyb3IsIGVsIGNhY2hlIGVzIG9wY2lvbmFsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBwZWzDrWN1bGFzIGRlc2RlIEFQSSBUTURCXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBmZXRjaE1vdmllc0Zyb21UTURCKGdlbnJlPzogc3RyaW5nKTogUHJvbWlzZTxNb3ZpZVtdPiB7XHJcbiAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZO1xyXG4gIGlmICghYXBpS2V5KSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RNREJfQVBJX0tFWSBubyBjb25maWd1cmFkYScpO1xyXG4gIH1cclxuXHJcbiAgLy8gRGV0ZXJtaW5hciBlbmRwb2ludCBzZWfDum4gZ8OpbmVyb1xyXG4gIGxldCBlbmRwb2ludCA9ICdodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL21vdmllL3BvcHVsYXInO1xyXG4gIGlmIChnZW5yZSkge1xyXG4gICAgLy8gUGFyYSBnw6luZXJvcyBlc3BlY8OtZmljb3MsIHVzYXIgZGlzY292ZXJcclxuICAgIGVuZHBvaW50ID0gYGh0dHBzOi8vYXBpLnRoZW1vdmllZGIub3JnLzMvZGlzY292ZXIvbW92aWU/d2l0aF9nZW5yZXM9JHtnZXRHZW5yZUlkKGdlbnJlKX1gO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgdXJsID0gYCR7ZW5kcG9pbnR9P2FwaV9rZXk9JHthcGlLZXl9Jmxhbmd1YWdlPWVzLUVTJnBhZ2U9MWA7XHJcbiAgXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgIGhlYWRlcnM6IHtcclxuICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1BcHAvMS4wJyxcclxuICAgIH0sXHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgVE1EQiBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBkYXRhOiBhbnkgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgXHJcbiAgaWYgKCFkYXRhLnJlc3VsdHMgfHwgIUFycmF5LmlzQXJyYXkoZGF0YS5yZXN1bHRzKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGb3JtYXRvIGRlIHJlc3B1ZXN0YSBUTURCIGludsOhbGlkbycpO1xyXG4gIH1cclxuXHJcbiAgLy8gVHJhbnNmb3JtYXIgYSBmb3JtYXRvIHNpbXBsaWZpY2Fkb1xyXG4gIHJldHVybiBkYXRhLnJlc3VsdHMuc2xpY2UoMCwgMjApLm1hcCgobW92aWU6IGFueSkgPT4gKHtcclxuICAgIGlkOiBtb3ZpZS5pZC50b1N0cmluZygpLFxyXG4gICAgdGl0bGU6IG1vdmllLnRpdGxlIHx8IG1vdmllLm9yaWdpbmFsX3RpdGxlIHx8ICdUw610dWxvIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgcG9zdGVyOiBtb3ZpZS5wb3N0ZXJfcGF0aCBcclxuICAgICAgPyBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMCR7bW92aWUucG9zdGVyX3BhdGh9YFxyXG4gICAgICA6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vNTAweDc1MD90ZXh0PVNpbitQb3N0ZXInLFxyXG4gICAgb3ZlcnZpZXc6IG1vdmllLm92ZXJ2aWV3IHx8ICdEZXNjcmlwY2nDs24gbm8gZGlzcG9uaWJsZScsXHJcbiAgfSkpO1xyXG59XHJcblxyXG4vKipcclxuICogTWFwZWFyIG5vbWJyZXMgZGUgZ8OpbmVyb3MgYSBJRHMgZGUgVE1EQlxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0R2VucmVJZChnZW5yZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3QgZ2VucmVNYXA6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XHJcbiAgICAnYWN0aW9uJzogJzI4JyxcclxuICAgICdhZHZlbnR1cmUnOiAnMTInLFxyXG4gICAgJ2FuaW1hdGlvbic6ICcxNicsXHJcbiAgICAnY29tZWR5JzogJzM1JyxcclxuICAgICdjcmltZSc6ICc4MCcsXHJcbiAgICAnZG9jdW1lbnRhcnknOiAnOTknLFxyXG4gICAgJ2RyYW1hJzogJzE4JyxcclxuICAgICdmYW1pbHknOiAnMTA3NTEnLFxyXG4gICAgJ2ZhbnRhc3knOiAnMTQnLFxyXG4gICAgJ2hpc3RvcnknOiAnMzYnLFxyXG4gICAgJ2hvcnJvcic6ICcyNycsXHJcbiAgICAnbXVzaWMnOiAnMTA0MDInLFxyXG4gICAgJ215c3RlcnknOiAnOTY0OCcsXHJcbiAgICAncm9tYW5jZSc6ICcxMDc0OScsXHJcbiAgICAnc2NpZW5jZV9maWN0aW9uJzogJzg3OCcsXHJcbiAgICAndGhyaWxsZXInOiAnNTMnLFxyXG4gICAgJ3dhcic6ICcxMDc1MicsXHJcbiAgICAnd2VzdGVybic6ICczNycsXHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIGdlbnJlTWFwW2dlbnJlTmFtZS50b0xvd2VyQ2FzZSgpXSB8fCAnMjgnOyAvLyBEZWZhdWx0OiBBY3Rpb25cclxufVxyXG5cclxuLyoqXHJcbiAqIFBlbMOtY3VsYXMgcG9yIGRlZmVjdG8gY3VhbmRvIHRvZG8gZmFsbGFcclxuICovXHJcbmZ1bmN0aW9uIGdldERlZmF1bHRNb3ZpZXMoKTogTW92aWVbXSB7XHJcbiAgcmV0dXJuIFtcclxuICAgIHtcclxuICAgICAgaWQ6ICdkZWZhdWx0XzEnLFxyXG4gICAgICB0aXRsZTogJ0VsIFBhZHJpbm8nLFxyXG4gICAgICBwb3N0ZXI6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vNTAweDc1MD90ZXh0PUVsK1BhZHJpbm8nLFxyXG4gICAgICBvdmVydmlldzogJ0xhIGhpc3RvcmlhIGRlIHVuYSBmYW1pbGlhIGRlIGxhIG1hZmlhIGl0YWxpYW5hIGVuIE51ZXZhIFlvcmsuJyxcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGlkOiAnZGVmYXVsdF8yJyxcclxuICAgICAgdGl0bGU6ICdQdWxwIEZpY3Rpb24nLFxyXG4gICAgICBwb3N0ZXI6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vNTAweDc1MD90ZXh0PVB1bHArRmljdGlvbicsXHJcbiAgICAgIG92ZXJ2aWV3OiAnSGlzdG9yaWFzIGVudHJlbGF6YWRhcyBkZSBjcmltZW4gZW4gTG9zIMOBbmdlbGVzLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfMycsXHJcbiAgICAgIHRpdGxlOiAnRWwgU2XDsW9yIGRlIGxvcyBBbmlsbG9zJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1MT1RSJyxcclxuICAgICAgb3ZlcnZpZXc6ICdVbmEgw6lwaWNhIGF2ZW50dXJhIGRlIGZhbnRhc8OtYSBlbiBsYSBUaWVycmEgTWVkaWEuJyxcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGlkOiAnZGVmYXVsdF80JyxcclxuICAgICAgdGl0bGU6ICdGb3JyZXN0IEd1bXAnLFxyXG4gICAgICBwb3N0ZXI6ICdodHRwczovL3ZpYS5wbGFjZWhvbGRlci5jb20vNTAweDc1MD90ZXh0PUZvcnJlc3QrR3VtcCcsXHJcbiAgICAgIG92ZXJ2aWV3OiAnTGEgZXh0cmFvcmRpbmFyaWEgdmlkYSBkZSB1biBob21icmUgc2ltcGxlLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfNScsXHJcbiAgICAgIHRpdGxlOiAnTWF0cml4JyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1NYXRyaXgnLFxyXG4gICAgICBvdmVydmlldzogJ1VuIHByb2dyYW1hZG9yIGRlc2N1YnJlIGxhIHZlcmRhZCBzb2JyZSBsYSByZWFsaWRhZC4nLFxyXG4gICAgfSxcclxuICBdO1xyXG59Il19