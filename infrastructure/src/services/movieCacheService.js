"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.movieCacheService = exports.MovieCacheService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Genre ID to name mapping from TMDB
const GENRE_MAP = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Science Fiction',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
};
/**
 * Movie Cache Service
 * Handles pre-caching of movies for instant loading during voting sessions
 */
class MovieCacheService {
    constructor() {
        this.CACHE_TTL_HOURS = 24;
        this.DEFAULT_CACHE_SIZE = 30;
        this.MAX_CACHE_SIZE = 50;
        this.MIN_CACHE_SIZE = 20;
    }
    /**
     * Pre-cache movies for a room with optional genre filtering
     */
    async preCacheMovies(roomId, genres) {
        const timer = new metrics_1.PerformanceTimer('PreCacheMovies');
        console.log(`🎬 Pre-caching movies for room ${roomId}`, genres ? `with genres: ${genres.join(', ')}` : 'all genres');
        try {
            // Check if cache already exists and is valid
            const existingCache = await this.getCachedMovies(roomId);
            if (existingCache.length > 0) {
                console.log(`✅ Using existing cache for room ${roomId}: ${existingCache.length} movies`);
                timer.finish(true, undefined, { source: 'existing_cache', movieCount: existingCache.length });
                return existingCache;
            }
            // Fetch movies from TMDB API
            const movies = await this.fetchMoviesFromTMDB(genres);
            if (movies.length === 0) {
                console.warn('⚠️ No movies fetched from TMDB, using fallback');
                const fallbackMovies = await this.getFallbackMovies();
                await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
                timer.finish(true, undefined, { source: 'fallback', movieCount: fallbackMovies.length });
                return fallbackMovies;
            }
            // Store in cache
            await this.storeCacheInDynamoDB(roomId, movies, genres || []);
            // Log business metric
            (0, metrics_1.logBusinessMetric)('MOVIES_CACHED', roomId, 'system', {
                movieCount: movies.length,
                genres: genres || [],
                cacheSize: movies.length
            });
            console.log(`✅ Successfully cached ${movies.length} movies for room ${roomId}`);
            timer.finish(true, undefined, { source: 'tmdb_api', movieCount: movies.length });
            return movies;
        }
        catch (error) {
            (0, metrics_1.logError)('PreCacheMovies', error, { roomId, genres });
            timer.finish(false, error.name);
            // Fallback to default movies on error
            console.log('🔄 Using fallback movies due to error');
            const fallbackMovies = await this.getFallbackMovies();
            try {
                await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
            }
            catch (storeError) {
                console.error('❌ Failed to store fallback cache:', storeError);
            }
            return fallbackMovies;
        }
    }
    /**
     * Get cached movies for a room
     */
    async getCachedMovies(roomId) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                Key: { cacheKey: roomId },
            }));
            if (!response.Item) {
                return [];
            }
            const cache = response.Item;
            // Check if cache is expired
            const now = Date.now();
            if (now > cache.ttl) {
                console.log(`⏰ Cache expired for room ${roomId}, removing`);
                // Could delete expired cache here, but for now just return empty
                return [];
            }
            console.log(`📦 Retrieved ${cache.movies.length} cached movies for room ${roomId}`);
            return cache.movies;
        }
        catch (error) {
            console.error('❌ Error retrieving cached movies:', error);
            return [];
        }
    }
    /**
     * Refresh cache for a room
     */
    async refreshCache(roomId, genres) {
        console.log(`🔄 Refreshing cache for room ${roomId}`);
        try {
            // Delete existing cache
            await this.deleteCacheFromDynamoDB(roomId);
            // Create new cache
            await this.preCacheMovies(roomId, genres);
            console.log(`✅ Cache refreshed for room ${roomId}`);
        }
        catch (error) {
            console.error('❌ Error refreshing cache:', error);
            throw error;
        }
    }
    /**
     * Fetch movies from TMDB API with genre filtering
     */
    async fetchMoviesFromTMDB(genres) {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            throw new Error('TMDB API key not configured');
        }
        try {
            let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`;
            // Add genre filtering if specified
            if (genres && genres.length > 0) {
                const genreIds = this.genreNamesToIds(genres);
                if (genreIds.length > 0) {
                    url += `&with_genres=${genreIds.join(',')}`;
                    console.log(`🎭 Applying genre filters: ${genres.join(', ')} (IDs: ${genreIds.join(', ')})`);
                }
                else {
                    console.warn(`⚠️ No valid genre IDs found for: ${genres.join(', ')}, using popular movies`);
                }
            }
            else {
                console.log('🎬 No genre filters specified, fetching popular movies across all genres');
            }
            console.log('🌐 Fetching movies from TMDB:', url.replace(apiKey, '[API_KEY]'));
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.warn('⚠️ No movies returned from TMDB API');
                throw new Error('No movies found from TMDB API');
            }
            // Convert TMDB format to our cached movie format
            const movies = data.results.slice(0, this.DEFAULT_CACHE_SIZE).map(movie => ({
                tmdbId: movie.id,
                title: movie.title,
                posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '',
                overview: movie.overview,
                genres: movie.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean),
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
                rating: movie.vote_average,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
            }));
            console.log(`✅ Fetched ${movies.length} movies from TMDB`);
            // Validate genre filtering worked correctly
            if (genres && genres.length > 0) {
                const genreFilteredCount = movies.filter(movie => movie.genres.some(movieGenre => genres.some(requestedGenre => movieGenre.toLowerCase() === requestedGenre.toLowerCase()))).length;
                console.log(`🎭 Genre filtering validation: ${genreFilteredCount}/${movies.length} movies match requested genres`);
            }
            return movies;
        }
        catch (error) {
            console.error('❌ Error fetching from TMDB:', error);
            throw error;
        }
    }
    /**
     * Convert genre names to TMDB genre IDs
     */
    genreNamesToIds(genreNames) {
        const genreIds = [];
        const unmatchedGenres = [];
        for (const name of genreNames) {
            const normalizedName = name.toLowerCase().trim();
            let found = false;
            for (const [id, genreName] of Object.entries(GENRE_MAP)) {
                if (genreName.toLowerCase() === normalizedName) {
                    genreIds.push(parseInt(id));
                    found = true;
                    break;
                }
            }
            if (!found) {
                unmatchedGenres.push(name);
            }
        }
        if (unmatchedGenres.length > 0) {
            console.warn(`⚠️ Unknown genres ignored: ${unmatchedGenres.join(', ')}`);
            console.log(`📋 Available genres: ${Object.values(GENRE_MAP).join(', ')}`);
        }
        return genreIds;
    }
    /**
     * Get list of available genres
     */
    getAvailableGenres() {
        return Object.values(GENRE_MAP).sort();
    }
    /**
     * Validate genre names against available genres
     */
    validateGenres(genreNames) {
        const availableGenres = this.getAvailableGenres().map(g => g.toLowerCase());
        const valid = [];
        const invalid = [];
        for (const genre of genreNames) {
            const normalizedGenre = genre.toLowerCase().trim();
            if (availableGenres.includes(normalizedGenre)) {
                // Find the properly capitalized version
                const properGenre = Object.values(GENRE_MAP).find(g => g.toLowerCase() === normalizedGenre);
                if (properGenre) {
                    valid.push(properGenre);
                }
            }
            else {
                invalid.push(genre);
            }
        }
        return { valid, invalid };
    }
    /**
     * Get fallback movies when TMDB API fails
     */
    async getFallbackMovies() {
        // Popular movie IDs as fallback
        const fallbackMovieIds = [
            550, 551, 552, 553, 554, 555, 556, 557, 558, 559,
            560, 561, 562, 563, 564, 565, 566, 567, 568, 569,
            570, 571, 572, 573, 574, 575, 576, 577, 578, 579
        ];
        return fallbackMovieIds.map((id, index) => ({
            tmdbId: id,
            title: `Popular Movie ${index + 1}`,
            posterPath: `https://image.tmdb.org/t/p/w500/placeholder${id}.jpg`,
            overview: `This is a popular movie with ID ${id}. Details will be loaded from TMDB when accessed.`,
            genres: ['Popular'],
            year: 2023,
            rating: 7.5,
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
        }));
    }
    /**
     * Store movie cache in DynamoDB
     */
    async storeCacheInDynamoDB(roomId, movies, genres) {
        const cache = {
            cacheKey: roomId,
            movies,
            genreFilters: genres,
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.MOVIE_CACHE_TABLE,
            Item: cache,
        }));
        console.log(`💾 Stored cache for room ${roomId}: ${movies.length} movies`);
    }
    /**
     * Delete cache from DynamoDB
     */
    async deleteCacheFromDynamoDB(roomId) {
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.MOVIE_CACHE_TABLE,
            Key: { cacheKey: roomId },
            UpdateExpression: 'REMOVE movies, genreFilters, cachedAt',
            ConditionExpression: 'attribute_exists(cacheKey)',
        }));
    }
    /**
     * Get cache statistics for monitoring
     */
    async getCacheStats(roomId) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                Key: { cacheKey: roomId },
            }));
            if (!response.Item) {
                return {
                    exists: false,
                    movieCount: 0,
                    genres: [],
                    isExpired: false,
                };
            }
            const cache = response.Item;
            const now = Date.now();
            const isExpired = now > cache.ttl;
            return {
                exists: true,
                movieCount: cache.movies.length,
                genres: cache.genreFilters,
                cachedAt: cache.cachedAt,
                expiresAt: new Date(cache.ttl).toISOString(),
                isExpired,
            };
        }
        catch (error) {
            console.error('❌ Error getting cache stats:', error);
            return {
                exists: false,
                movieCount: 0,
                genres: [],
                isExpired: false,
            };
        }
    }
}
exports.MovieCacheService = MovieCacheService;
// Export singleton instance
exports.movieCacheService = new MovieCacheService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWVDYWNoZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZUNhY2hlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBQW9IO0FBQ3BILDhDQUFpRjtBQU9qRixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBc0M1RCxxQ0FBcUM7QUFDckMsTUFBTSxTQUFTLEdBQTJCO0lBQ3hDLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsYUFBYTtJQUNqQixFQUFFLEVBQUUsT0FBTztJQUNYLEtBQUssRUFBRSxRQUFRO0lBQ2YsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osS0FBSyxFQUFFLE9BQU87SUFDZCxJQUFJLEVBQUUsU0FBUztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLEdBQUcsRUFBRSxpQkFBaUI7SUFDdEIsS0FBSyxFQUFFLFVBQVU7SUFDakIsRUFBRSxFQUFFLFVBQVU7SUFDZCxLQUFLLEVBQUUsS0FBSztJQUNaLEVBQUUsRUFBRSxTQUFTO0NBQ2QsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQWEsaUJBQWlCO0lBQTlCO1FBQ21CLG9CQUFlLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztRQUN4QixtQkFBYyxHQUFHLEVBQUUsQ0FBQztRQUNwQixtQkFBYyxHQUFHLEVBQUUsQ0FBQztJQXFXdkMsQ0FBQztJQW5XQzs7T0FFRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBYyxF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QztZQUVKLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO2dCQUNsQixPQUFPO29CQUNMLE1BQU0sRUFBRSxLQUFLO29CQUNiLFVBQVUsRUFBRSxDQUFDO29CQUNiLE1BQU0sRUFBRSxFQUFFO29CQUNWLFNBQVMsRUFBRSxLQUFLO2lCQUNqQixDQUFDO2FBQ0g7WUFFRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsSUFBa0IsQ0FBQztZQUMxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDdkIsTUFBTSxTQUFTLEdBQUcsR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7WUFFbEMsT0FBTztnQkFDTCxNQUFNLEVBQUUsSUFBSTtnQkFDWixVQUFVLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO2dCQUMvQixNQUFNLEVBQUUsS0FBSyxDQUFDLFlBQVk7Z0JBQzFCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtnQkFDeEIsU0FBUyxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVDLFNBQVM7YUFDVixDQUFDO1NBRUg7UUFBQyxPQUFPLEtBQUssRUFBRTtZQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckQsT0FBTztnQkFDTCxNQUFNLEVBQUUsS0FBSztnQkFDYixVQUFVLEVBQUUsQ0FBQztnQkFDYixNQUFNLEVBQUUsRUFBRTtnQkFDVixTQUFTLEVBQUUsS0FBSzthQUNqQixDQUFDO1NBQ0g7SUFDSCxDQUFDO0NBQ0Y7QUF6V0QsOENBeVdDO0FBRUQsNEJBQTRCO0FBQ2YsUUFBQSxpQkFBaUIsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQsIFF1ZXJ5Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IGxvZ0J1c2luZXNzTWV0cmljLCBsb2dFcnJvciwgUGVyZm9ybWFuY2VUaW1lciB9IGZyb20gJy4uL3V0aWxzL21ldHJpY3MnO1xyXG5cclxuLy8gRm9yIE5vZGUuanMgZmV0Y2ggc3VwcG9ydFxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgZnVuY3Rpb24gZmV0Y2goaW5wdXQ6IHN0cmluZywgaW5pdD86IGFueSk6IFByb21pc2U8YW55PjtcclxufVxyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlZE1vdmllIHtcclxuICB0bWRiSWQ6IG51bWJlcjtcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHBvc3RlclBhdGg6IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG4gIGdlbnJlczogc3RyaW5nW107XHJcbiAgeWVhcj86IG51bWJlcjtcclxuICByYXRpbmc/OiBudW1iZXI7XHJcbiAgY2FjaGVkQXQ6IHN0cmluZztcclxuICB0dGw6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNb3ZpZUNhY2hlIHtcclxuICBjYWNoZUtleTogc3RyaW5nOyAgICAgLy8gUEs6IHJvb21JZCBvciBnZW5yZS1iYXNlZCBrZXlcclxuICBtb3ZpZXM6IENhY2hlZE1vdmllW107XHJcbiAgZ2VucmVGaWx0ZXJzOiBzdHJpbmdbXTtcclxuICBjYWNoZWRBdDogc3RyaW5nO1xyXG4gIHR0bDogbnVtYmVyOyAgICAgICAgICAvLyAyNC1ob3VyIGV4cGlyYXRpb25cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCTW92aWUge1xyXG4gIGlkOiBudW1iZXI7XHJcbiAgdGl0bGU6IHN0cmluZztcclxuICBwb3N0ZXJfcGF0aDogc3RyaW5nIHwgbnVsbDtcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG4gIGdlbnJlX2lkczogbnVtYmVyW107XHJcbiAgcmVsZWFzZV9kYXRlOiBzdHJpbmc7XHJcbiAgdm90ZV9hdmVyYWdlOiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVE1EQlJlc3BvbnNlIHtcclxuICByZXN1bHRzOiBUTURCTW92aWVbXTtcclxuICB0b3RhbF9wYWdlczogbnVtYmVyO1xyXG4gIHRvdGFsX3Jlc3VsdHM6IG51bWJlcjtcclxufVxyXG5cclxuLy8gR2VucmUgSUQgdG8gbmFtZSBtYXBwaW5nIGZyb20gVE1EQlxyXG5jb25zdCBHRU5SRV9NQVA6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XHJcbiAgMjg6ICdBY3Rpb24nLFxyXG4gIDEyOiAnQWR2ZW50dXJlJyxcclxuICAxNjogJ0FuaW1hdGlvbicsXHJcbiAgMzU6ICdDb21lZHknLFxyXG4gIDgwOiAnQ3JpbWUnLFxyXG4gIDk5OiAnRG9jdW1lbnRhcnknLFxyXG4gIDE4OiAnRHJhbWEnLFxyXG4gIDEwNzUxOiAnRmFtaWx5JyxcclxuICAxNDogJ0ZhbnRhc3knLFxyXG4gIDM2OiAnSGlzdG9yeScsXHJcbiAgMjc6ICdIb3Jyb3InLFxyXG4gIDEwNDAyOiAnTXVzaWMnLFxyXG4gIDk2NDg6ICdNeXN0ZXJ5JyxcclxuICAxMDc0OTogJ1JvbWFuY2UnLFxyXG4gIDg3ODogJ1NjaWVuY2UgRmljdGlvbicsXHJcbiAgMTA3NzA6ICdUViBNb3ZpZScsXHJcbiAgNTM6ICdUaHJpbGxlcicsXHJcbiAgMTA3NTI6ICdXYXInLFxyXG4gIDM3OiAnV2VzdGVybicsXHJcbn07XHJcblxyXG4vKipcclxuICogTW92aWUgQ2FjaGUgU2VydmljZVxyXG4gKiBIYW5kbGVzIHByZS1jYWNoaW5nIG9mIG1vdmllcyBmb3IgaW5zdGFudCBsb2FkaW5nIGR1cmluZyB2b3Rpbmcgc2Vzc2lvbnNcclxuICovXHJcbmV4cG9ydCBjbGFzcyBNb3ZpZUNhY2hlU2VydmljZSB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBDQUNIRV9UVExfSE9VUlMgPSAyNDtcclxuICBwcml2YXRlIHJlYWRvbmx5IERFRkFVTFRfQ0FDSEVfU0laRSA9IDMwO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgTUFYX0NBQ0hFX1NJWkUgPSA1MDtcclxuICBwcml2YXRlIHJlYWRvbmx5IE1JTl9DQUNIRV9TSVpFID0gMjA7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByZS1jYWNoZSBtb3ZpZXMgZm9yIGEgcm9vbSB3aXRoIG9wdGlvbmFsIGdlbnJlIGZpbHRlcmluZ1xyXG4gICAqL1xyXG4gIGFzeW5jIHByZUNhY2hlTW92aWVzKHJvb21JZDogc3RyaW5nLCBnZW5yZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8Q2FjaGVkTW92aWVbXT4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignUHJlQ2FjaGVNb3ZpZXMnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn46sIFByZS1jYWNoaW5nIG1vdmllcyBmb3Igcm9vbSAke3Jvb21JZH1gLCBnZW5yZXMgPyBgd2l0aCBnZW5yZXM6ICR7Z2VucmVzLmpvaW4oJywgJyl9YCA6ICdhbGwgZ2VucmVzJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQ2hlY2sgaWYgY2FjaGUgYWxyZWFkeSBleGlzdHMgYW5kIGlzIHZhbGlkXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nQ2FjaGUgPSBhd2FpdCB0aGlzLmdldENhY2hlZE1vdmllcyhyb29tSWQpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdDYWNoZS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBVc2luZyBleGlzdGluZyBjYWNoZSBmb3Igcm9vbSAke3Jvb21JZH06ICR7ZXhpc3RpbmdDYWNoZS5sZW5ndGh9IG1vdmllc2ApO1xyXG4gICAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgc291cmNlOiAnZXhpc3RpbmdfY2FjaGUnLCBtb3ZpZUNvdW50OiBleGlzdGluZ0NhY2hlLmxlbmd0aCB9KTtcclxuICAgICAgICByZXR1cm4gZXhpc3RpbmdDYWNoZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRmV0Y2ggbW92aWVzIGZyb20gVE1EQiBBUElcclxuICAgICAgY29uc3QgbW92aWVzID0gYXdhaXQgdGhpcy5mZXRjaE1vdmllc0Zyb21UTURCKGdlbnJlcyk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAobW92aWVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIE5vIG1vdmllcyBmZXRjaGVkIGZyb20gVE1EQiwgdXNpbmcgZmFsbGJhY2snKTtcclxuICAgICAgICBjb25zdCBmYWxsYmFja01vdmllcyA9IGF3YWl0IHRoaXMuZ2V0RmFsbGJhY2tNb3ZpZXMoKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnN0b3JlQ2FjaGVJbkR5bmFtb0RCKHJvb21JZCwgZmFsbGJhY2tNb3ZpZXMsIGdlbnJlcyB8fCBbXSk7XHJcbiAgICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBzb3VyY2U6ICdmYWxsYmFjaycsIG1vdmllQ291bnQ6IGZhbGxiYWNrTW92aWVzLmxlbmd0aCB9KTtcclxuICAgICAgICByZXR1cm4gZmFsbGJhY2tNb3ZpZXM7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFN0b3JlIGluIGNhY2hlXHJcbiAgICAgIGF3YWl0IHRoaXMuc3RvcmVDYWNoZUluRHluYW1vREIocm9vbUlkLCBtb3ZpZXMsIGdlbnJlcyB8fCBbXSk7XHJcblxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICAgIGxvZ0J1c2luZXNzTWV0cmljKCdNT1ZJRVNfQ0FDSEVEJywgcm9vbUlkLCAnc3lzdGVtJywge1xyXG4gICAgICAgIG1vdmllQ291bnQ6IG1vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgZ2VucmVzOiBnZW5yZXMgfHwgW10sXHJcbiAgICAgICAgY2FjaGVTaXplOiBtb3ZpZXMubGVuZ3RoXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBTdWNjZXNzZnVsbHkgY2FjaGVkICR7bW92aWVzLmxlbmd0aH0gbW92aWVzIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHNvdXJjZTogJ3RtZGJfYXBpJywgbW92aWVDb3VudDogbW92aWVzLmxlbmd0aCB9KTtcclxuICAgICAgcmV0dXJuIG1vdmllcztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dFcnJvcignUHJlQ2FjaGVNb3ZpZXMnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIGdlbnJlcyB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICBcclxuICAgICAgLy8gRmFsbGJhY2sgdG8gZGVmYXVsdCBtb3ZpZXMgb24gZXJyb3JcclxuICAgICAgY29uc29sZS5sb2coJ/CflIQgVXNpbmcgZmFsbGJhY2sgbW92aWVzIGR1ZSB0byBlcnJvcicpO1xyXG4gICAgICBjb25zdCBmYWxsYmFja01vdmllcyA9IGF3YWl0IHRoaXMuZ2V0RmFsbGJhY2tNb3ZpZXMoKTtcclxuICAgICAgXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5zdG9yZUNhY2hlSW5EeW5hbW9EQihyb29tSWQsIGZhbGxiYWNrTW92aWVzLCBnZW5yZXMgfHwgW10pO1xyXG4gICAgICB9IGNhdGNoIChzdG9yZUVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBzdG9yZSBmYWxsYmFjayBjYWNoZTonLCBzdG9yZUVycm9yKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIGZhbGxiYWNrTW92aWVzO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGNhY2hlZCBtb3ZpZXMgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIGFzeW5jIGdldENhY2hlZE1vdmllcyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8Q2FjaGVkTW92aWVbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IGNhY2hlS2V5OiByb29tSWQgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBjYWNoZSA9IHJlc3BvbnNlLkl0ZW0gYXMgTW92aWVDYWNoZTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGlmIGNhY2hlIGlzIGV4cGlyZWRcclxuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICAgICAgaWYgKG5vdyA+IGNhY2hlLnR0bCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDij7AgQ2FjaGUgZXhwaXJlZCBmb3Igcm9vbSAke3Jvb21JZH0sIHJlbW92aW5nYCk7XHJcbiAgICAgICAgLy8gQ291bGQgZGVsZXRlIGV4cGlyZWQgY2FjaGUgaGVyZSwgYnV0IGZvciBub3cganVzdCByZXR1cm4gZW1wdHlcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OmIFJldHJpZXZlZCAke2NhY2hlLm1vdmllcy5sZW5ndGh9IGNhY2hlZCBtb3ZpZXMgZm9yIHJvb20gJHtyb29tSWR9YCk7XHJcbiAgICAgIHJldHVybiBjYWNoZS5tb3ZpZXM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHJldHJpZXZpbmcgY2FjaGVkIG1vdmllczonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlZnJlc2ggY2FjaGUgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIGFzeW5jIHJlZnJlc2hDYWNoZShyb29tSWQ6IHN0cmluZywgZ2VucmVzPzogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlZnJlc2hpbmcgY2FjaGUgZm9yIHJvb20gJHtyb29tSWR9YCk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIERlbGV0ZSBleGlzdGluZyBjYWNoZVxyXG4gICAgICBhd2FpdCB0aGlzLmRlbGV0ZUNhY2hlRnJvbUR5bmFtb0RCKHJvb21JZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDcmVhdGUgbmV3IGNhY2hlXHJcbiAgICAgIGF3YWl0IHRoaXMucHJlQ2FjaGVNb3ZpZXMocm9vbUlkLCBnZW5yZXMpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBDYWNoZSByZWZyZXNoZWQgZm9yIHJvb20gJHtyb29tSWR9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcmVmcmVzaGluZyBjYWNoZTonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggbW92aWVzIGZyb20gVE1EQiBBUEkgd2l0aCBnZW5yZSBmaWx0ZXJpbmdcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGZldGNoTW92aWVzRnJvbVRNREIoZ2VucmVzPzogc3RyaW5nW10pOiBQcm9taXNlPENhY2hlZE1vdmllW10+IHtcclxuICAgIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICAgIGlmICghYXBpS2V5KSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignVE1EQiBBUEkga2V5IG5vdCBjb25maWd1cmVkJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IHVybCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL2Rpc2NvdmVyL21vdmllP2FwaV9rZXk9JHthcGlLZXl9JnNvcnRfYnk9cG9wdWxhcml0eS5kZXNjJmluY2x1ZGVfYWR1bHQ9ZmFsc2UmaW5jbHVkZV92aWRlbz1mYWxzZSZwYWdlPTFgO1xyXG4gICAgICBcclxuICAgICAgLy8gQWRkIGdlbnJlIGZpbHRlcmluZyBpZiBzcGVjaWZpZWRcclxuICAgICAgaWYgKGdlbnJlcyAmJiBnZW5yZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IGdlbnJlSWRzID0gdGhpcy5nZW5yZU5hbWVzVG9JZHMoZ2VucmVzKTtcclxuICAgICAgICBpZiAoZ2VucmVJZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgdXJsICs9IGAmd2l0aF9nZW5yZXM9JHtnZW5yZUlkcy5qb2luKCcsJyl9YDtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46tIEFwcGx5aW5nIGdlbnJlIGZpbHRlcnM6ICR7Z2VucmVzLmpvaW4oJywgJyl9IChJRHM6ICR7Z2VucmVJZHMuam9pbignLCAnKX0pYCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIE5vIHZhbGlkIGdlbnJlIElEcyBmb3VuZCBmb3I6ICR7Z2VucmVzLmpvaW4oJywgJyl9LCB1c2luZyBwb3B1bGFyIG1vdmllc2ApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+OrCBObyBnZW5yZSBmaWx0ZXJzIHNwZWNpZmllZCwgZmV0Y2hpbmcgcG9wdWxhciBtb3ZpZXMgYWNyb3NzIGFsbCBnZW5yZXMnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc29sZS5sb2coJ/CfjJAgRmV0Y2hpbmcgbW92aWVzIGZyb20gVE1EQjonLCB1cmwucmVwbGFjZShhcGlLZXksICdbQVBJX0tFWV0nKSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhOiBUTURCUmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWRhdGEucmVzdWx0cyB8fCBkYXRhLnJlc3VsdHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gTm8gbW92aWVzIHJldHVybmVkIGZyb20gVE1EQiBBUEknKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG1vdmllcyBmb3VuZCBmcm9tIFRNREIgQVBJJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIENvbnZlcnQgVE1EQiBmb3JtYXQgdG8gb3VyIGNhY2hlZCBtb3ZpZSBmb3JtYXRcclxuICAgICAgY29uc3QgbW92aWVzOiBDYWNoZWRNb3ZpZVtdID0gZGF0YS5yZXN1bHRzLnNsaWNlKDAsIHRoaXMuREVGQVVMVF9DQUNIRV9TSVpFKS5tYXAobW92aWUgPT4gKHtcclxuICAgICAgICB0bWRiSWQ6IG1vdmllLmlkLFxyXG4gICAgICAgIHRpdGxlOiBtb3ZpZS50aXRsZSxcclxuICAgICAgICBwb3N0ZXJQYXRoOiBtb3ZpZS5wb3N0ZXJfcGF0aCA/IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwJHttb3ZpZS5wb3N0ZXJfcGF0aH1gIDogJycsXHJcbiAgICAgICAgb3ZlcnZpZXc6IG1vdmllLm92ZXJ2aWV3LFxyXG4gICAgICAgIGdlbnJlczogbW92aWUuZ2VucmVfaWRzLm1hcChpZCA9PiBHRU5SRV9NQVBbaWRdKS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgICAgICAgeWVhcjogbW92aWUucmVsZWFzZV9kYXRlID8gbmV3IERhdGUobW92aWUucmVsZWFzZV9kYXRlKS5nZXRGdWxsWWVhcigpIDogdW5kZWZpbmVkLFxyXG4gICAgICAgIHJhdGluZzogbW92aWUudm90ZV9hdmVyYWdlLFxyXG4gICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgKHRoaXMuQ0FDSEVfVFRMX0hPVVJTICogNjAgKiA2MCAqIDEwMDApLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEZldGNoZWQgJHttb3ZpZXMubGVuZ3RofSBtb3ZpZXMgZnJvbSBUTURCYCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBWYWxpZGF0ZSBnZW5yZSBmaWx0ZXJpbmcgd29ya2VkIGNvcnJlY3RseVxyXG4gICAgICBpZiAoZ2VucmVzICYmIGdlbnJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc3QgZ2VucmVGaWx0ZXJlZENvdW50ID0gbW92aWVzLmZpbHRlcihtb3ZpZSA9PiBcclxuICAgICAgICAgIG1vdmllLmdlbnJlcy5zb21lKG1vdmllR2VucmUgPT4gXHJcbiAgICAgICAgICAgIGdlbnJlcy5zb21lKHJlcXVlc3RlZEdlbnJlID0+IFxyXG4gICAgICAgICAgICAgIG1vdmllR2VucmUudG9Mb3dlckNhc2UoKSA9PT0gcmVxdWVzdGVkR2VucmUudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgKS5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq0gR2VucmUgZmlsdGVyaW5nIHZhbGlkYXRpb246ICR7Z2VucmVGaWx0ZXJlZENvdW50fS8ke21vdmllcy5sZW5ndGh9IG1vdmllcyBtYXRjaCByZXF1ZXN0ZWQgZ2VucmVzYCk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiBtb3ZpZXM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGZldGNoaW5nIGZyb20gVE1EQjonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ29udmVydCBnZW5yZSBuYW1lcyB0byBUTURCIGdlbnJlIElEc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2VucmVOYW1lc1RvSWRzKGdlbnJlTmFtZXM6IHN0cmluZ1tdKTogbnVtYmVyW10ge1xyXG4gICAgY29uc3QgZ2VucmVJZHM6IG51bWJlcltdID0gW107XHJcbiAgICBjb25zdCB1bm1hdGNoZWRHZW5yZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBnZW5yZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWROYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGNvbnN0IFtpZCwgZ2VucmVOYW1lXSBvZiBPYmplY3QuZW50cmllcyhHRU5SRV9NQVApKSB7XHJcbiAgICAgICAgaWYgKGdlbnJlTmFtZS50b0xvd2VyQ2FzZSgpID09PSBub3JtYWxpemVkTmFtZSkge1xyXG4gICAgICAgICAgZ2VucmVJZHMucHVzaChwYXJzZUludChpZCkpO1xyXG4gICAgICAgICAgZm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWZvdW5kKSB7XHJcbiAgICAgICAgdW5tYXRjaGVkR2VucmVzLnB1c2gobmFtZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHVubWF0Y2hlZEdlbnJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFVua25vd24gZ2VucmVzIGlnbm9yZWQ6ICR7dW5tYXRjaGVkR2VucmVzLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEF2YWlsYWJsZSBnZW5yZXM6ICR7T2JqZWN0LnZhbHVlcyhHRU5SRV9NQVApLmpvaW4oJywgJyl9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBnZW5yZUlkcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBsaXN0IG9mIGF2YWlsYWJsZSBnZW5yZXNcclxuICAgKi9cclxuICBnZXRBdmFpbGFibGVHZW5yZXMoKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMoR0VOUkVfTUFQKS5zb3J0KCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBnZW5yZSBuYW1lcyBhZ2FpbnN0IGF2YWlsYWJsZSBnZW5yZXNcclxuICAgKi9cclxuICB2YWxpZGF0ZUdlbnJlcyhnZW5yZU5hbWVzOiBzdHJpbmdbXSk6IHsgdmFsaWQ6IHN0cmluZ1tdOyBpbnZhbGlkOiBzdHJpbmdbXSB9IHtcclxuICAgIGNvbnN0IGF2YWlsYWJsZUdlbnJlcyA9IHRoaXMuZ2V0QXZhaWxhYmxlR2VucmVzKCkubWFwKGcgPT4gZy50b0xvd2VyQ2FzZSgpKTtcclxuICAgIGNvbnN0IHZhbGlkOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgY29uc3QgaW52YWxpZDogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBnZW5yZSBvZiBnZW5yZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRHZW5yZSA9IGdlbnJlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG4gICAgICBpZiAoYXZhaWxhYmxlR2VucmVzLmluY2x1ZGVzKG5vcm1hbGl6ZWRHZW5yZSkpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBwcm9wZXJseSBjYXBpdGFsaXplZCB2ZXJzaW9uXHJcbiAgICAgICAgY29uc3QgcHJvcGVyR2VucmUgPSBPYmplY3QudmFsdWVzKEdFTlJFX01BUCkuZmluZChnID0+IGcudG9Mb3dlckNhc2UoKSA9PT0gbm9ybWFsaXplZEdlbnJlKTtcclxuICAgICAgICBpZiAocHJvcGVyR2VucmUpIHtcclxuICAgICAgICAgIHZhbGlkLnB1c2gocHJvcGVyR2VucmUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpbnZhbGlkLnB1c2goZ2VucmUpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7IHZhbGlkLCBpbnZhbGlkIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgZmFsbGJhY2sgbW92aWVzIHdoZW4gVE1EQiBBUEkgZmFpbHNcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldEZhbGxiYWNrTW92aWVzKCk6IFByb21pc2U8Q2FjaGVkTW92aWVbXT4ge1xyXG4gICAgLy8gUG9wdWxhciBtb3ZpZSBJRHMgYXMgZmFsbGJhY2tcclxuICAgIGNvbnN0IGZhbGxiYWNrTW92aWVJZHMgPSBbXHJcbiAgICAgIDU1MCwgNTUxLCA1NTIsIDU1MywgNTU0LCA1NTUsIDU1NiwgNTU3LCA1NTgsIDU1OSxcclxuICAgICAgNTYwLCA1NjEsIDU2MiwgNTYzLCA1NjQsIDU2NSwgNTY2LCA1NjcsIDU2OCwgNTY5LFxyXG4gICAgICA1NzAsIDU3MSwgNTcyLCA1NzMsIDU3NCwgNTc1LCA1NzYsIDU3NywgNTc4LCA1NzlcclxuICAgIF07XHJcblxyXG4gICAgcmV0dXJuIGZhbGxiYWNrTW92aWVJZHMubWFwKChpZCwgaW5kZXgpID0+ICh7XHJcbiAgICAgIHRtZGJJZDogaWQsXHJcbiAgICAgIHRpdGxlOiBgUG9wdWxhciBNb3ZpZSAke2luZGV4ICsgMX1gLFxyXG4gICAgICBwb3N0ZXJQYXRoOiBgaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9wbGFjZWhvbGRlciR7aWR9LmpwZ2AsXHJcbiAgICAgIG92ZXJ2aWV3OiBgVGhpcyBpcyBhIHBvcHVsYXIgbW92aWUgd2l0aCBJRCAke2lkfS4gRGV0YWlscyB3aWxsIGJlIGxvYWRlZCBmcm9tIFRNREIgd2hlbiBhY2Nlc3NlZC5gLFxyXG4gICAgICBnZW5yZXM6IFsnUG9wdWxhciddLFxyXG4gICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICByYXRpbmc6IDcuNSxcclxuICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdHRsOiBEYXRlLm5vdygpICsgKHRoaXMuQ0FDSEVfVFRMX0hPVVJTICogNjAgKiA2MCAqIDEwMDApLFxyXG4gICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RvcmUgbW92aWUgY2FjaGUgaW4gRHluYW1vREJcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHN0b3JlQ2FjaGVJbkR5bmFtb0RCKHJvb21JZDogc3RyaW5nLCBtb3ZpZXM6IENhY2hlZE1vdmllW10sIGdlbnJlczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGNhY2hlOiBNb3ZpZUNhY2hlID0ge1xyXG4gICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICBtb3ZpZXMsXHJcbiAgICAgIGdlbnJlRmlsdGVyczogZ2VucmVzLFxyXG4gICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB0dGw6IERhdGUubm93KCkgKyAodGhpcy5DQUNIRV9UVExfSE9VUlMgKiA2MCAqIDYwICogMTAwMCksXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEl0ZW06IGNhY2hlLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5K+IFN0b3JlZCBjYWNoZSBmb3Igcm9vbSAke3Jvb21JZH06ICR7bW92aWVzLmxlbmd0aH0gbW92aWVzYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZWxldGUgY2FjaGUgZnJvbSBEeW5hbW9EQlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlQ2FjaGVGcm9tRHluYW1vREIocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEtleTogeyBjYWNoZUtleTogcm9vbUlkIH0sXHJcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdSRU1PVkUgbW92aWVzLCBnZW5yZUZpbHRlcnMsIGNhY2hlZEF0JyxcclxuICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9leGlzdHMoY2FjaGVLZXkpJyxcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjYWNoZSBzdGF0aXN0aWNzIGZvciBtb25pdG9yaW5nXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0Q2FjaGVTdGF0cyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8e1xyXG4gICAgZXhpc3RzOiBib29sZWFuO1xyXG4gICAgbW92aWVDb3VudDogbnVtYmVyO1xyXG4gICAgZ2VucmVzOiBzdHJpbmdbXTtcclxuICAgIGNhY2hlZEF0Pzogc3RyaW5nO1xyXG4gICAgZXhwaXJlc0F0Pzogc3RyaW5nO1xyXG4gICAgaXNFeHBpcmVkOiBib29sZWFuO1xyXG4gIH0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBjYWNoZUtleTogcm9vbUlkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBleGlzdHM6IGZhbHNlLFxyXG4gICAgICAgICAgbW92aWVDb3VudDogMCxcclxuICAgICAgICAgIGdlbnJlczogW10sXHJcbiAgICAgICAgICBpc0V4cGlyZWQ6IGZhbHNlLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGNhY2hlID0gcmVzcG9uc2UuSXRlbSBhcyBNb3ZpZUNhY2hlO1xyXG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gICAgICBjb25zdCBpc0V4cGlyZWQgPSBub3cgPiBjYWNoZS50dGw7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGV4aXN0czogdHJ1ZSxcclxuICAgICAgICBtb3ZpZUNvdW50OiBjYWNoZS5tb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIGdlbnJlczogY2FjaGUuZ2VucmVGaWx0ZXJzLFxyXG4gICAgICAgIGNhY2hlZEF0OiBjYWNoZS5jYWNoZWRBdCxcclxuICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKGNhY2hlLnR0bCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICBpc0V4cGlyZWQsXHJcbiAgICAgIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGdldHRpbmcgY2FjaGUgc3RhdHM6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGV4aXN0czogZmFsc2UsXHJcbiAgICAgICAgbW92aWVDb3VudDogMCxcclxuICAgICAgICBnZW5yZXM6IFtdLFxyXG4gICAgICAgIGlzRXhwaXJlZDogZmFsc2UsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgc2luZ2xldG9uIGluc3RhbmNlXHJcbmV4cG9ydCBjb25zdCBtb3ZpZUNhY2hlU2VydmljZSA9IG5ldyBNb3ZpZUNhY2hlU2VydmljZSgpOyJdfQ==