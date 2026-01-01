"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// Use AWS SDK v3 from Lambda runtime
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
// Import fetch for Node.js
const fetch = require('node-fetch');
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
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
 * Obtener películas simplificado
 */
async function getMovies(genre) {
    try {
        // 1. Intentar obtener desde cache
        const cachedMovies = await getCachedMovies(`movies_${genre || 'popular'}`);
        if (cachedMovies && cachedMovies.length > 0) {
            console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
            return cachedMovies;
        }
        // 2. Si no hay cache, obtener desde API TMDB
        console.log('🌐 Obteniendo películas desde TMDB API...');
        const moviesFromAPI = await fetchMoviesFromTMDB(genre);
        // 3. Cachear resultado exitoso
        await cacheMovies(`movies_${genre || 'popular'}`, moviesFromAPI);
        console.log(`✅ Películas obtenidas desde API: ${moviesFromAPI.length}`);
        return moviesFromAPI;
    }
    catch (apiError) {
        console.warn('⚠️ Error en API TMDB, intentando fallback desde cache:', apiError);
        // 4. Fallback: intentar cache expirado como último recurso
        const fallbackMovies = await getCachedMovies(`movies_${genre || 'popular'}`, true);
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
        const response = await docClient.send(new GetCommand({
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
        await docClient.send(new PutCommand({
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
    const response = await fetch(url, {
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
    }
    catch (apiError) {
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
async function getCachedMovieDetails(cacheKey, allowExpired = false) {
    try {
        const response = await docClient.send(new GetCommand({
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
        await docClient.send(new PutCommand({
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
    const movie = await response.json();
    // Transformar a formato GraphQL esperado
    return {
        id: movie.id.toString(),
        title: movie.title || movie.original_title || 'Título no disponible',
        overview: movie.overview || 'Descripción no disponible',
        poster: movie.poster_path || null,
        vote_average: movie.vote_average || 0,
        release_date: movie.release_date || '',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxxQ0FBcUM7QUFDckMsTUFBTSxFQUFFLGNBQWMsRUFBRSxHQUFHLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQy9ELE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFFNUYsMkJBQTJCO0FBQzNCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUVwQyxNQUFNLFlBQVksR0FBRyxJQUFJLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFlNUQ7OztHQUdHO0FBQ0ksTUFBTSxPQUFPLEdBQXFDLEtBQUssRUFBRSxLQUFnQyxFQUFFLEVBQUU7SUFDbEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVqRSxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQztJQUN4QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBRTdCLElBQUk7UUFDRixRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLFdBQVc7Z0JBQ2QsT0FBTyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFckMsS0FBSyxpQkFBaUI7Z0JBQ3BCLE9BQU8sTUFBTSxlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRTdDO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFNBQVMsRUFBRSxDQUFDLENBQUM7U0FDM0Q7S0FD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QUFFLFFBQVE7WUFDZixNQUFNLEVBQUUsaURBQWlEO1lBQ3pELFFBQVEsRUFBRSxzREFBc0Q7U0FDakU7S0FDRixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcFN5bmNSZXNvbHZlckV2ZW50LCBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcblxyXG4vLyBVc2UgQVdTIFNESyB2MyBmcm9tIExhbWJkYSBydW50aW1lXHJcbmNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xyXG5jb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG5cclxuLy8gSW1wb3J0IGZldGNoIGZvciBOb2RlLmpzXHJcbmNvbnN0IGZldGNoID0gcmVxdWlyZSgnbm9kZS1mZXRjaCcpO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5pbnRlcmZhY2UgTW92aWUge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgdGl0bGU6IHN0cmluZztcclxuICBwb3N0ZXI6IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2FjaGVkTW92aWUgZXh0ZW5kcyBNb3ZpZSB7XHJcbiAgdG1kYklkOiBzdHJpbmc7XHJcbiAgY2FjaGVkQXQ6IHN0cmluZztcclxuICB0dGw6IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1vdmllSGFuZGxlcjogQ2lyY3VpdCBCcmVha2VyICsgQ2FjaGVcclxuICogSW1wbGVtZW50YSBwYXRyw7NuIENpcmN1aXQgQnJlYWtlciBwYXJhIEFQSSBUTURCIGNvbiBjYWNoZSBlbiBEeW5hbW9EQlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/CfjqwgTW92aWUgSGFuZGxlcjonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG5cclxuICBjb25zdCBmaWVsZE5hbWUgPSBldmVudC5pbmZvPy5maWVsZE5hbWU7XHJcbiAgY29uc3QgYXJncyA9IGV2ZW50LmFyZ3VtZW50cztcclxuXHJcbiAgdHJ5IHtcclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2dldE1vdmllcyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE1vdmllcyhhcmdzLmdlbnJlKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2dldE1vdmllRGV0YWlscyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE1vdmllRGV0YWlscyhhcmdzLm1vdmllSWQpO1xyXG4gICAgICBcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhY2nDs24gbm8gc29wb3J0YWRhOiAke2ZpZWxkTmFtZX1gKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVuICR7ZmllbGROYW1lfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBwZWzDrWN1bGFzIHNpbXBsaWZpY2Fkb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0TW92aWVzKGdlbnJlPzogc3RyaW5nKTogUHJvbWlzZTxNb3ZpZVtdPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIDEuIEludGVudGFyIG9idGVuZXIgZGVzZGUgY2FjaGVcclxuICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IGdldENhY2hlZE1vdmllcyhgbW92aWVzXyR7Z2VucmUgfHwgJ3BvcHVsYXInfWApO1xyXG4gICAgaWYgKGNhY2hlZE1vdmllcyAmJiBjYWNoZWRNb3ZpZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+SviBQZWzDrWN1bGFzIG9idGVuaWRhcyBkZXNkZSBjYWNoZTogJHtjYWNoZWRNb3ZpZXMubGVuZ3RofWApO1xyXG4gICAgICByZXR1cm4gY2FjaGVkTW92aWVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDIuIFNpIG5vIGhheSBjYWNoZSwgb2J0ZW5lciBkZXNkZSBBUEkgVE1EQlxyXG4gICAgY29uc29sZS5sb2coJ/CfjJAgT2J0ZW5pZW5kbyBwZWzDrWN1bGFzIGRlc2RlIFRNREIgQVBJLi4uJyk7XHJcbiAgICBjb25zdCBtb3ZpZXNGcm9tQVBJID0gYXdhaXQgZmV0Y2hNb3ZpZXNGcm9tVE1EQihnZW5yZSk7XHJcbiAgICBcclxuICAgIC8vIDMuIENhY2hlYXIgcmVzdWx0YWRvIGV4aXRvc29cclxuICAgIGF3YWl0IGNhY2hlTW92aWVzKGBtb3ZpZXNfJHtnZW5yZSB8fCAncG9wdWxhcid9YCwgbW92aWVzRnJvbUFQSSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUGVsw61jdWxhcyBvYnRlbmlkYXMgZGVzZGUgQVBJOiAke21vdmllc0Zyb21BUEkubGVuZ3RofWApO1xyXG4gICAgcmV0dXJuIG1vdmllc0Zyb21BUEk7XHJcblxyXG4gIH0gY2F0Y2ggKGFwaUVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBlbiBBUEkgVE1EQiwgaW50ZW50YW5kbyBmYWxsYmFjayBkZXNkZSBjYWNoZTonLCBhcGlFcnJvcik7XHJcbiAgICBcclxuICAgIC8vIDQuIEZhbGxiYWNrOiBpbnRlbnRhciBjYWNoZSBleHBpcmFkbyBjb21vIMO6bHRpbW8gcmVjdXJzb1xyXG4gICAgY29uc3QgZmFsbGJhY2tNb3ZpZXMgPSBhd2FpdCBnZXRDYWNoZWRNb3ZpZXMoYG1vdmllc18ke2dlbnJlIHx8ICdwb3B1bGFyJ31gLCB0cnVlKTtcclxuICAgIGlmIChmYWxsYmFja01vdmllcyAmJiBmYWxsYmFja01vdmllcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFVzYW5kbyBjYWNoZSBleHBpcmFkbyBjb21vIGZhbGxiYWNrOiAke2ZhbGxiYWNrTW92aWVzLmxlbmd0aH1gKTtcclxuICAgICAgcmV0dXJuIGZhbGxiYWNrTW92aWVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDUuIFNpIHRvZG8gZmFsbGEsIHJldG9ybmFyIHBlbMOtY3VsYXMgcG9yIGRlZmVjdG9cclxuICAgIGNvbnNvbGUubG9nKCfwn46tIFVzYW5kbyBwZWzDrWN1bGFzIHBvciBkZWZlY3RvJyk7XHJcbiAgICByZXR1cm4gZ2V0RGVmYXVsdE1vdmllcygpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBkZXNkZSBjYWNoZSBEeW5hbW9EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2FjaGVkTW92aWVzKGNhY2hlS2V5OiBzdHJpbmcsIGFsbG93RXhwaXJlZCA9IGZhbHNlKTogUHJvbWlzZTxNb3ZpZVtdIHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgdG1kYklkOiBjYWNoZUtleSB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjYWNoZWQgPSByZXNwb25zZS5JdGVtIGFzIGFueTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZpY2FyIHNpIGVsIGNhY2hlIGhhIGV4cGlyYWRvIChhIG1lbm9zIHF1ZSBhbGxvd0V4cGlyZWQgc2VhIHRydWUpXHJcbiAgICBpZiAoIWFsbG93RXhwaXJlZCAmJiBjYWNoZWQudHRsIDwgTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KPsCBDYWNoZSBleHBpcmFkbycpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FjaGVkLm1vdmllcyB8fCBbXTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgbGV5ZW5kbyBjYWNoZTonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYWNoZWFyIHBlbMOtY3VsYXMgZW4gRHluYW1vREIgY29uIFRUTCBkZSAzMCBkw61hc1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY2FjaGVNb3ZpZXMoY2FjaGVLZXk6IHN0cmluZywgbW92aWVzOiBNb3ZpZVtdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgKDMwICogMjQgKiA2MCAqIDYwKTsgLy8gMzAgZMOtYXNcclxuICAgIFxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52Lk1PVklFU19DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICB0bWRiSWQ6IGNhY2hlS2V5LFxyXG4gICAgICAgIG1vdmllcyxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHR0bCxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBQZWzDrWN1bGFzIGNhY2hlYWRhczogJHtjYWNoZUtleX1gKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgY2FjaGVhbmRvIHBlbMOtY3VsYXM6JywgZXJyb3IpO1xyXG4gICAgLy8gTm8gbGFuemFyIGVycm9yLCBlbCBjYWNoZSBlcyBvcGNpb25hbFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBkZXNkZSBBUEkgVE1EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb3ZpZXNGcm9tVE1EQihnZW5yZT86IHN0cmluZyk6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIC8vIERldGVybWluYXIgZW5kcG9pbnQgc2Vnw7puIGfDqW5lcm9cclxuICBsZXQgZW5kcG9pbnQgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9tb3ZpZS9wb3B1bGFyJztcclxuICBpZiAoZ2VucmUpIHtcclxuICAgIC8vIFBhcmEgZ8OpbmVyb3MgZXNwZWPDrWZpY29zLCB1c2FyIGRpc2NvdmVyXHJcbiAgICBlbmRwb2ludCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL2Rpc2NvdmVyL21vdmllP3dpdGhfZ2VucmVzPSR7Z2V0R2VucmVJZChnZW5yZSl9YDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHVybCA9IGAke2VuZHBvaW50fT9hcGlfa2V5PSR7YXBpS2V5fSZsYW5ndWFnZT1lcy1FUyZwYWdlPTFgO1xyXG4gIFxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICBoZWFkZXJzOiB7XHJcbiAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQXBwLzEuMCcsXHJcbiAgICB9LFxyXG4gIH0pO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZGF0YTogYW55ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gIFxyXG4gIGlmICghZGF0YS5yZXN1bHRzIHx8ICFBcnJheS5pc0FycmF5KGRhdGEucmVzdWx0cykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignRm9ybWF0byBkZSByZXNwdWVzdGEgVE1EQiBpbnbDoWxpZG8nKTtcclxuICB9XHJcblxyXG4gIC8vIFRyYW5zZm9ybWFyIGEgZm9ybWF0byBzaW1wbGlmaWNhZG9cclxuICByZXR1cm4gZGF0YS5yZXN1bHRzLnNsaWNlKDAsIDIwKS5tYXAoKG1vdmllOiBhbnkpID0+ICh7XHJcbiAgICBpZDogbW92aWUuaWQudG9TdHJpbmcoKSxcclxuICAgIHRpdGxlOiBtb3ZpZS50aXRsZSB8fCBtb3ZpZS5vcmlnaW5hbF90aXRsZSB8fCAnVMOtdHVsbyBubyBkaXNwb25pYmxlJyxcclxuICAgIHBvc3RlcjogbW92aWUucG9zdGVyX3BhdGggXHJcbiAgICAgID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAke21vdmllLnBvc3Rlcl9wYXRofWBcclxuICAgICAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1TaW4rUG9zdGVyJyxcclxuICAgIG92ZXJ2aWV3OiBtb3ZpZS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gIH0pKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcGVhciBub21icmVzIGRlIGfDqW5lcm9zIGEgSURzIGRlIFRNREJcclxuICovXHJcbmZ1bmN0aW9uIGdldEdlbnJlSWQoZ2VucmVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGdlbnJlTWFwOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge1xyXG4gICAgJ2FjdGlvbic6ICcyOCcsXHJcbiAgICAnYWR2ZW50dXJlJzogJzEyJyxcclxuICAgICdhbmltYXRpb24nOiAnMTYnLFxyXG4gICAgJ2NvbWVkeSc6ICczNScsXHJcbiAgICAnY3JpbWUnOiAnODAnLFxyXG4gICAgJ2RvY3VtZW50YXJ5JzogJzk5JyxcclxuICAgICdkcmFtYSc6ICcxOCcsXHJcbiAgICAnZmFtaWx5JzogJzEwNzUxJyxcclxuICAgICdmYW50YXN5JzogJzE0JyxcclxuICAgICdoaXN0b3J5JzogJzM2JyxcclxuICAgICdob3Jyb3InOiAnMjcnLFxyXG4gICAgJ211c2ljJzogJzEwNDAyJyxcclxuICAgICdteXN0ZXJ5JzogJzk2NDgnLFxyXG4gICAgJ3JvbWFuY2UnOiAnMTA3NDknLFxyXG4gICAgJ3NjaWVuY2VfZmljdGlvbic6ICc4NzgnLFxyXG4gICAgJ3RocmlsbGVyJzogJzUzJyxcclxuICAgICd3YXInOiAnMTA3NTInLFxyXG4gICAgJ3dlc3Rlcm4nOiAnMzcnLFxyXG4gIH07XHJcblxyXG4gIHJldHVybiBnZW5yZU1hcFtnZW5yZU5hbWUudG9Mb3dlckNhc2UoKV0gfHwgJzI4JzsgLy8gRGVmYXVsdDogQWN0aW9uXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGRldGFsbGVzIGRlIHVuYSBwZWzDrWN1bGEgZXNwZWPDrWZpY2FcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldE1vdmllRGV0YWlscyhtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gIGNvbnN0IGNhY2hlS2V5ID0gYG1vdmllX2RldGFpbHNfJHttb3ZpZUlkfWA7XHJcbiAgXHJcbiAgdHJ5IHtcclxuICAgIC8vIDEuIEludGVudGFyIG9idGVuZXIgZGVzZGUgY2FjaGVcclxuICAgIGNvbnN0IGNhY2hlZE1vdmllID0gYXdhaXQgZ2V0Q2FjaGVkTW92aWVEZXRhaWxzKGNhY2hlS2V5KTtcclxuICAgIGlmIChjYWNoZWRNb3ZpZSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+SviBEZXRhbGxlcyBkZSBwZWzDrWN1bGEgb2J0ZW5pZG9zIGRlc2RlIGNhY2hlOiAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybiBjYWNoZWRNb3ZpZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAyLiBTaSBubyBoYXkgY2FjaGUsIG9idGVuZXIgZGVzZGUgQVBJIFRNREJcclxuICAgIGNvbnNvbGUubG9nKGDwn4yQIE9idGVuaWVuZG8gZGV0YWxsZXMgZGUgcGVsw61jdWxhICR7bW92aWVJZH0gZGVzZGUgVE1EQiBBUEkuLi5gKTtcclxuICAgIGNvbnN0IG1vdmllRGV0YWlscyA9IGF3YWl0IGZldGNoTW92aWVEZXRhaWxzRnJvbVRNREIobW92aWVJZCk7XHJcbiAgICBcclxuICAgIC8vIDMuIENhY2hlYXIgcmVzdWx0YWRvIGV4aXRvc29cclxuICAgIGF3YWl0IGNhY2hlTW92aWVEZXRhaWxzKGNhY2hlS2V5LCBtb3ZpZURldGFpbHMpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIERldGFsbGVzIGRlIHBlbMOtY3VsYSBvYnRlbmlkb3MgZGVzZGUgQVBJOiAke21vdmllRGV0YWlscy50aXRsZX1gKTtcclxuICAgIHJldHVybiBtb3ZpZURldGFpbHM7XHJcblxyXG4gIH0gY2F0Y2ggKGFwaUVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBlbiBBUEkgVE1EQiBwYXJhIHBlbMOtY3VsYSAke21vdmllSWR9LCBpbnRlbnRhbmRvIGZhbGxiYWNrOmAsIGFwaUVycm9yKTtcclxuICAgIFxyXG4gICAgLy8gNC4gRmFsbGJhY2s6IGludGVudGFyIGNhY2hlIGV4cGlyYWRvXHJcbiAgICBjb25zdCBmYWxsYmFja01vdmllID0gYXdhaXQgZ2V0Q2FjaGVkTW92aWVEZXRhaWxzKGNhY2hlS2V5LCB0cnVlKTtcclxuICAgIGlmIChmYWxsYmFja01vdmllKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFVzYW5kbyBjYWNoZSBleHBpcmFkbyBjb21vIGZhbGxiYWNrIHBhcmEgcGVsw61jdWxhICR7bW92aWVJZH1gKTtcclxuICAgICAgcmV0dXJuIGZhbGxiYWNrTW92aWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gNS4gU2kgdG9kbyBmYWxsYSwgcmV0b3JuYXIgcGVsw61jdWxhIHBvciBkZWZlY3RvXHJcbiAgICBjb25zb2xlLmxvZyhg8J+OrSBVc2FuZG8gcGVsw61jdWxhIHBvciBkZWZlY3RvIHBhcmEgSUQgJHttb3ZpZUlkfWApO1xyXG4gICAgcmV0dXJuIGdldERlZmF1bHRNb3ZpZURldGFpbHMobW92aWVJZCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBkZXRhbGxlcyBkZSBwZWzDrWN1bGEgZGVzZGUgY2FjaGUgRHluYW1vREJcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldENhY2hlZE1vdmllRGV0YWlscyhjYWNoZUtleTogc3RyaW5nLCBhbGxvd0V4cGlyZWQgPSBmYWxzZSk6IFByb21pc2U8YW55IHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgdG1kYklkOiBjYWNoZUtleSB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjYWNoZWQgPSByZXNwb25zZS5JdGVtIGFzIGFueTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZpY2FyIHNpIGVsIGNhY2hlIGhhIGV4cGlyYWRvXHJcbiAgICBpZiAoIWFsbG93RXhwaXJlZCAmJiBjYWNoZWQudHRsIDwgTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KPsCBDYWNoZSBkZSBkZXRhbGxlcyBleHBpcmFkbycpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FjaGVkLm1vdmllRGV0YWlscyB8fCBudWxsO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBsZXllbmRvIGNhY2hlIGRlIGRldGFsbGVzOicsIGVycm9yKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENhY2hlYXIgZGV0YWxsZXMgZGUgcGVsw61jdWxhIGVuIER5bmFtb0RCXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjYWNoZU1vdmllRGV0YWlscyhjYWNoZUtleTogc3RyaW5nLCBtb3ZpZURldGFpbHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSArICgzMCAqIDI0ICogNjAgKiA2MCk7IC8vIDMwIGTDrWFzXHJcbiAgICBcclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgdG1kYklkOiBjYWNoZUtleSxcclxuICAgICAgICBtb3ZpZURldGFpbHMsXHJcbiAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB0dGwsXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfkr4gRGV0YWxsZXMgZGUgcGVsw61jdWxhIGNhY2hlYWRvczogJHtjYWNoZUtleX1gKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgY2FjaGVhbmRvIGRldGFsbGVzIGRlIHBlbMOtY3VsYTonLCBlcnJvcik7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBkZXRhbGxlcyBkZSBwZWzDrWN1bGEgZGVzZGUgQVBJIFRNREJcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoTW92aWVEZXRhaWxzRnJvbVRNREIobW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcclxuICBjb25zdCBhcGlLZXkgPSBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVk7XHJcbiAgaWYgKCFhcGlLZXkpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignVE1EQl9BUElfS0VZIG5vIGNvbmZpZ3VyYWRhJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9tb3ZpZS8ke21vdmllSWR9P2FwaV9rZXk9JHthcGlLZXl9Jmxhbmd1YWdlPWVzLUVTJmFwcGVuZF90b19yZXNwb25zZT1jcmVkaXRzLHZpZGVvc2A7XHJcbiAgXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgIGhlYWRlcnM6IHtcclxuICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1BcHAvMS4wJyxcclxuICAgIH0sXHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBlbMOtY3VsYSBubyBlbmNvbnRyYWRhOiAke21vdmllSWR9YCk7XHJcbiAgICB9XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbW92aWU6IGFueSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICBcclxuICAvLyBUcmFuc2Zvcm1hciBhIGZvcm1hdG8gR3JhcGhRTCBlc3BlcmFkb1xyXG4gIHJldHVybiB7XHJcbiAgICBpZDogbW92aWUuaWQudG9TdHJpbmcoKSxcclxuICAgIHRpdGxlOiBtb3ZpZS50aXRsZSB8fCBtb3ZpZS5vcmlnaW5hbF90aXRsZSB8fCAnVMOtdHVsbyBubyBkaXNwb25pYmxlJyxcclxuICAgIG92ZXJ2aWV3OiBtb3ZpZS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgcG9zdGVyOiBtb3ZpZS5wb3N0ZXJfcGF0aCB8fCBudWxsLFxyXG4gICAgdm90ZV9hdmVyYWdlOiBtb3ZpZS52b3RlX2F2ZXJhZ2UgfHwgMCxcclxuICAgIHJlbGVhc2VfZGF0ZTogbW92aWUucmVsZWFzZV9kYXRlIHx8ICcnLFxyXG4gICAgZ2VucmVzOiBtb3ZpZS5nZW5yZXM/Lm1hcCgoZzogYW55KSA9PiAoeyBpZDogZy5pZCwgbmFtZTogZy5uYW1lIH0pKSB8fCBbXSxcclxuICAgIHJ1bnRpbWU6IG1vdmllLnJ1bnRpbWUgfHwgbnVsbCxcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogRGV0YWxsZXMgZGUgcGVsw61jdWxhIHBvciBkZWZlY3RvIGN1YW5kbyB0b2RvIGZhbGxhXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXREZWZhdWx0TW92aWVEZXRhaWxzKG1vdmllSWQ6IHN0cmluZyk6IGFueSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGlkOiBtb3ZpZUlkLFxyXG4gICAgdGl0bGU6ICdQZWzDrWN1bGEgbm8gZGlzcG9uaWJsZScsXHJcbiAgICBvdmVydmlldzogJ0xvcyBkZXRhbGxlcyBkZSBlc3RhIHBlbMOtY3VsYSBubyBlc3TDoW4gZGlzcG9uaWJsZXMgdGVtcG9yYWxtZW50ZSBkZWJpZG8gYSBwcm9ibGVtYXMgZGUgY29uZWN0aXZpZGFkLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gbcOhcyB0YXJkZS4nLFxyXG4gICAgcG9zdGVyOiBudWxsLFxyXG4gICAgdm90ZV9hdmVyYWdlOiAwLFxyXG4gICAgcmVsZWFzZV9kYXRlOiAnJyxcclxuICAgIGdlbnJlczogW10sXHJcbiAgICBydW50aW1lOiBudWxsLFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQZWzDrWN1bGFzIHBvciBkZWZlY3RvIGN1YW5kbyB0b2RvIGZhbGxhXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXREZWZhdWx0TW92aWVzKCk6IE1vdmllW10ge1xyXG4gIHJldHVybiBbXHJcbiAgICB7XHJcbiAgICAgIGlkOiAnZGVmYXVsdF8xJyxcclxuICAgICAgdGl0bGU6ICdFbCBQYWRyaW5vJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1FbCtQYWRyaW5vJyxcclxuICAgICAgb3ZlcnZpZXc6ICdMYSBoaXN0b3JpYSBkZSB1bmEgZmFtaWxpYSBkZSBsYSBtYWZpYSBpdGFsaWFuYSBlbiBOdWV2YSBZb3JrLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfMicsXHJcbiAgICAgIHRpdGxlOiAnUHVscCBGaWN0aW9uJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1QdWxwK0ZpY3Rpb24nLFxyXG4gICAgICBvdmVydmlldzogJ0hpc3RvcmlhcyBlbnRyZWxhemFkYXMgZGUgY3JpbWVuIGVuIExvcyDDgW5nZWxlcy4nLFxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgaWQ6ICdkZWZhdWx0XzMnLFxyXG4gICAgICB0aXRsZTogJ0VsIFNlw7FvciBkZSBsb3MgQW5pbGxvcycsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS81MDB4NzUwP3RleHQ9TE9UUicsXHJcbiAgICAgIG92ZXJ2aWV3OiAnVW5hIMOpcGljYSBhdmVudHVyYSBkZSBmYW50YXPDrWEgZW4gbGEgVGllcnJhIE1lZGlhLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJ2RlZmF1bHRfNCcsXHJcbiAgICAgIHRpdGxlOiAnRm9ycmVzdCBHdW1wJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1Gb3JyZXN0K0d1bXAnLFxyXG4gICAgICBvdmVydmlldzogJ0xhIGV4dHJhb3JkaW5hcmlhIHZpZGEgZGUgdW4gaG9tYnJlIHNpbXBsZS4nLFxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgaWQ6ICdkZWZhdWx0XzUnLFxyXG4gICAgICB0aXRsZTogJ01hdHJpeCcsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vdmlhLnBsYWNlaG9sZGVyLmNvbS81MDB4NzUwP3RleHQ9TWF0cml4JyxcclxuICAgICAgb3ZlcnZpZXc6ICdVbiBwcm9ncmFtYWRvciBkZXNjdWJyZSBsYSB2ZXJkYWQgc29icmUgbGEgcmVhbGlkYWQuJyxcclxuICAgIH0sXHJcbiAgXTtcclxufSJdfQ==