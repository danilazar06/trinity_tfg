"use strict";
/**
 * Unit Tests for Movie Pre-caching System
 * Feature: trinity-voting-fixes
 *
 * Property 8: Movie Pre-caching Behavior
 * Validates: Requirements 4.1
 *
 * For any newly created room, the system should pre-fetch and cache
 * 20-50 movie titles from TMDB API within 30 seconds
 */
Object.defineProperty(exports, "__esModule", { value: true });
const movieCacheService_1 = require("../services/movieCacheService");
// Mock DynamoDB and TMDB API
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/metrics');
// Mock fetch for TMDB API
const mockFetch = jest.fn();
global.fetch = mockFetch;
describe('Movie Pre-caching Behavior - Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock environment variables
        process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
        process.env.TMDB_API_KEY = 'test-api-key';
    });
    describe('Property 8: Movie Pre-caching Behavior', () => {
        it('should pre-fetch and cache 20-50 movies for a room within timeout', async () => {
            const roomId = 'test-room-123';
            const genres = ['Action', 'Comedy'];
            // Mock successful TMDB API response
            const mockMovies = Array.from({ length: 30 }, (_, i) => ({
                id: 1000 + i,
                title: `Test Movie ${i + 1}`,
                poster_path: `/poster${i + 1}.jpg`,
                overview: `Overview for movie ${i + 1}`,
                genre_ids: [28, 12],
                release_date: '2023-01-01',
                vote_average: 7.5 + (i % 3),
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: mockMovies,
                    total_pages: 1,
                    total_results: mockMovies.length,
                }),
            });
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
                .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Start timer
            const startTime = Date.now();
            // Execute pre-caching
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // End timer
            const endTime = Date.now();
            const duration = endTime - startTime;
            // Verify timing constraint (30 seconds = 30000ms)
            expect(duration).toBeLessThan(30000);
            // Verify movie count is within expected range
            expect(cachedMovies.length).toBeGreaterThanOrEqual(20);
            expect(cachedMovies.length).toBeLessThanOrEqual(50);
            // Verify all movies have required properties
            cachedMovies.forEach(movie => {
                expect(movie).toHaveProperty('tmdbId');
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('posterPath');
                expect(movie).toHaveProperty('overview');
                expect(movie).toHaveProperty('genres');
                expect(movie).toHaveProperty('cachedAt');
                expect(movie).toHaveProperty('ttl');
                // Verify data types
                expect(typeof movie.tmdbId).toBe('number');
                expect(typeof movie.title).toBe('string');
                expect(typeof movie.posterPath).toBe('string');
                expect(typeof movie.overview).toBe('string');
                expect(Array.isArray(movie.genres)).toBe(true);
                expect(typeof movie.cachedAt).toBe('string');
                expect(typeof movie.ttl).toBe('number');
                // Verify TTL is set for 24 hours from now
                const expectedTTL = Date.now() + (24 * 60 * 60 * 1000);
                expect(movie.ttl).toBeGreaterThan(Date.now());
                expect(movie.ttl).toBeLessThan(expectedTTL + 60000); // Allow 1 minute tolerance
            });
        });
        it('should handle TMDB API failures gracefully with fallback movies', async () => {
            const roomId = 'test-room-456';
            // Mock TMDB API failure
            mockFetch.mockRejectedValueOnce(new Error('TMDB API unavailable'));
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
                .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Execute pre-caching (should use fallback)
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            // Should still return movies (fallback)
            expect(cachedMovies.length).toBeGreaterThanOrEqual(20);
            expect(cachedMovies.length).toBeLessThanOrEqual(50);
            // Verify fallback movies have correct structure
            cachedMovies.forEach(movie => {
                expect(movie).toHaveProperty('tmdbId');
                expect(movie).toHaveProperty('title');
                expect(movie.title).toContain('Popular Movie');
                expect(movie.genres).toContain('Popular');
            });
        });
        it('should reuse existing valid cache instead of fetching new movies', async () => {
            const roomId = 'test-room-789';
            const genres = ['Drama'];
            // Mock existing cache in DynamoDB
            const existingMovies = Array.from({ length: 25 }, (_, i) => ({
                tmdbId: 2000 + i,
                title: `Cached Movie ${i + 1}`,
                posterPath: `/cached${i + 1}.jpg`,
                overview: `Cached overview ${i + 1}`,
                genres: genres,
                year: 2023,
                rating: 8.0,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + (23 * 60 * 60 * 1000), // Valid for 23 more hours
            }));
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({
                Item: {
                    cacheKey: roomId,
                    movies: existingMovies,
                    genreFilters: genres,
                    cachedAt: new Date().toISOString(),
                    ttl: Date.now() + (23 * 60 * 60 * 1000),
                }
            });
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Execute pre-caching
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Should return existing cached movies
            expect(cachedMovies).toEqual(existingMovies);
            expect(cachedMovies.length).toBe(25);
            // Should only call DynamoDB once (to get existing cache)
            expect(mockSend).toHaveBeenCalledTimes(1);
            // Should NOT call TMDB API
            expect(mockFetch).not.toHaveBeenCalled();
        });
        it('should set TTL to exactly 24 hours from cache creation time', async () => {
            const roomId = 'test-room-ttl';
            // Mock TMDB API response
            const mockMovies = Array.from({ length: 25 }, (_, i) => ({
                id: 5000 + i,
                title: `TTL Test Movie ${i + 1}`,
                poster_path: `/ttl${i + 1}.jpg`,
                overview: `TTL test overview ${i + 1}`,
                genre_ids: [18],
                release_date: '2023-06-01',
                vote_average: 7.0,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: mockMovies,
                    total_pages: 1,
                    total_results: mockMovies.length,
                }),
            });
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
                .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            const beforeCaching = Date.now();
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            const afterCaching = Date.now();
            // Verify TTL is set correctly for each movie
            const expectedTTLMin = beforeCaching + (24 * 60 * 60 * 1000);
            const expectedTTLMax = afterCaching + (24 * 60 * 60 * 1000);
            cachedMovies.forEach(movie => {
                expect(movie.ttl).toBeGreaterThanOrEqual(expectedTTLMin);
                expect(movie.ttl).toBeLessThanOrEqual(expectedTTLMax);
                // Verify TTL is approximately 24 hours from now
                const ttlHours = (movie.ttl - Date.now()) / (60 * 60 * 1000);
                expect(ttlHours).toBeGreaterThan(23.9); // Allow small tolerance
                expect(ttlHours).toBeLessThan(24.1);
            });
        });
        it('should handle expired cache by fetching new movies', async () => {
            const roomId = 'test-room-expired';
            // Mock expired cache in DynamoDB
            const expiredMovies = Array.from({ length: 20 }, (_, i) => ({
                tmdbId: 3000 + i,
                title: `Expired Movie ${i + 1}`,
                posterPath: `/expired${i + 1}.jpg`,
                overview: `Expired overview ${i + 1}`,
                genres: ['Action'],
                cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
                ttl: Date.now() - (1 * 60 * 60 * 1000), // Expired 1 hour ago
            }));
            // Mock fresh TMDB API response
            const freshMovies = Array.from({ length: 30 }, (_, i) => ({
                id: 4000 + i,
                title: `Fresh Movie ${i + 1}`,
                poster_path: `/fresh${i + 1}.jpg`,
                overview: `Fresh overview ${i + 1}`,
                genre_ids: [35],
                release_date: '2024-01-01',
                vote_average: 8.5,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: freshMovies,
                    total_pages: 1,
                    total_results: freshMovies.length,
                }),
            });
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({
                Item: {
                    cacheKey: roomId,
                    movies: expiredMovies,
                    genreFilters: [],
                    cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
                    ttl: Date.now() - (1 * 60 * 60 * 1000), // Expired
                }
            })
                .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Execute pre-caching
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            // Should return fresh movies, not expired ones
            expect(cachedMovies.length).toBe(30);
            cachedMovies.forEach(movie => {
                expect(movie.title).toContain('Fresh Movie');
                expect(movie.tmdbId).toBeGreaterThanOrEqual(4000);
                expect(movie.tmdbId).toBeLessThan(4030);
            });
            // Should call TMDB API to get fresh movies
            expect(mockFetch).toHaveBeenCalledTimes(1);
            // Should call DynamoDB twice (get expired cache, store new cache)
            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });
    describe('Genre Filtering', () => {
        it('should apply genre filters to TMDB API calls', async () => {
            const roomId = 'test-room-genres';
            const genres = ['Action', 'Comedy'];
            // Mock TMDB API response
            const mockMovies = Array.from({ length: 25 }, (_, i) => ({
                id: 6000 + i,
                title: `Genre Movie ${i + 1}`,
                poster_path: `/genre${i + 1}.jpg`,
                overview: `Genre overview ${i + 1}`,
                genre_ids: [28, 35],
                release_date: '2023-08-01',
                vote_average: 7.8,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: mockMovies,
                    total_pages: 1,
                    total_results: mockMovies.length,
                }),
            });
            // Mock DynamoDB operations
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
                .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Execute pre-caching with genres
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Verify TMDB API was called with genre filters
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('with_genres=28,35'));
            // Verify movies were cached with correct genres
            expect(cachedMovies.length).toBe(25);
            cachedMovies.forEach(movie => {
                expect(movie.genres).toEqual(expect.arrayContaining(['Action', 'Comedy']));
            });
        });
    });
    describe('Error Handling', () => {
        it('should handle DynamoDB failures gracefully', async () => {
            const roomId = 'test-room-db-error';
            // Mock successful TMDB API response
            const mockMovies = Array.from({ length: 20 }, (_, i) => ({
                id: 7000 + i,
                title: `Error Test Movie ${i + 1}`,
                poster_path: `/error${i + 1}.jpg`,
                overview: `Error test overview ${i + 1}`,
                genre_ids: [53],
                release_date: '2023-09-01',
                vote_average: 6.5,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: mockMovies,
                    total_pages: 1,
                    total_results: mockMovies.length,
                }),
            });
            // Mock DynamoDB failure
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ Item: null }) // getCachedMovies succeeds
                .mockRejectedValueOnce(new Error('DynamoDB unavailable')); // storeCacheInDynamoDB fails
            DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
                send: mockSend,
            });
            // Should still return movies even if storage fails
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            expect(cachedMovies.length).toBe(20);
            cachedMovies.forEach(movie => {
                expect(movie.title).toContain('Error Test Movie');
            });
            // Should have attempted to store in DynamoDB
            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUtcHJlLWNhY2hpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vdmllLXByZS1jYWNoaW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7R0FTRzs7QUFFSCxxRUFBK0U7QUFFL0UsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFFOUIsMEJBQTBCO0FBQzFCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUMzQixNQUFjLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztBQUVsQyxRQUFRLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO0lBQ3ZELFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFckIsNkJBQTZCO1FBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsd0JBQXdCLENBQUM7UUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsY0FBYyxDQUFDO0lBQzVDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxFQUFFLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakYsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDO1lBQy9CLE1BQU0sTUFBTSxHQUFHLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBRXBDLG9DQUFvQztZQUNwQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdkQsRUFBRSxFQUFFLElBQUksR0FBRyxDQUFDO2dCQUNa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c0IsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQztnQkFDdEQsSUFBSSxFQUFFLFFBQVE7YUFDZixDQUFDLENBQUM7WUFFSCxtREFBbUQ7WUFDbkQsTUFBTSxZQUFZLEdBQUcsTUFBTSxxQ0FBaUIsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFcEUsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDckMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDM0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUMsQ0FBQztZQUVILDZDQUE2QztZQUM3QyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFVuaXQgVGVzdHMgZm9yIE1vdmllIFByZS1jYWNoaW5nIFN5c3RlbVxyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlc1xyXG4gKiBcclxuICogUHJvcGVydHkgODogTW92aWUgUHJlLWNhY2hpbmcgQmVoYXZpb3JcclxuICogVmFsaWRhdGVzOiBSZXF1aXJlbWVudHMgNC4xXHJcbiAqIFxyXG4gKiBGb3IgYW55IG5ld2x5IGNyZWF0ZWQgcm9vbSwgdGhlIHN5c3RlbSBzaG91bGQgcHJlLWZldGNoIGFuZCBjYWNoZSBcclxuICogMjAtNTAgbW92aWUgdGl0bGVzIGZyb20gVE1EQiBBUEkgd2l0aGluIDMwIHNlY29uZHNcclxuICovXHJcblxyXG5pbXBvcnQgeyBtb3ZpZUNhY2hlU2VydmljZSwgQ2FjaGVkTW92aWUgfSBmcm9tICcuLi9zZXJ2aWNlcy9tb3ZpZUNhY2hlU2VydmljZSc7XHJcblxyXG4vLyBNb2NrIER5bmFtb0RCIGFuZCBUTURCIEFQSVxyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG5qZXN0Lm1vY2soJy4uL3V0aWxzL21ldHJpY3MnKTtcclxuXHJcbi8vIE1vY2sgZmV0Y2ggZm9yIFRNREIgQVBJXHJcbmNvbnN0IG1vY2tGZXRjaCA9IGplc3QuZm4oKTtcclxuKGdsb2JhbCBhcyBhbnkpLmZldGNoID0gbW9ja0ZldGNoO1xyXG5cclxuZGVzY3JpYmUoJ01vdmllIFByZS1jYWNoaW5nIEJlaGF2aW9yIC0gVW5pdCBUZXN0cycsICgpID0+IHtcclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAgcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUgPSAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZSc7XHJcbiAgICBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVkgPSAndGVzdC1hcGkta2V5JztcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ1Byb3BlcnR5IDg6IE1vdmllIFByZS1jYWNoaW5nIEJlaGF2aW9yJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBwcmUtZmV0Y2ggYW5kIGNhY2hlIDIwLTUwIG1vdmllcyBmb3IgYSByb29tIHdpdGhpbiB0aW1lb3V0JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLTEyMyc7XHJcbiAgICAgIGNvbnN0IGdlbnJlcyA9IFsnQWN0aW9uJywgJ0NvbWVkeSddO1xyXG5cclxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIFRNREIgQVBJIHJlc3BvbnNlXHJcbiAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAzMCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICBpZDogMTAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBUZXN0IE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBwb3N0ZXJfcGF0aDogYC9wb3N0ZXIke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgT3ZlcnZpZXcgZm9yIG1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZV9pZHM6IFsyOCwgMTJdLCAvLyBBY3Rpb24sIEFkdmVudHVyZVxyXG4gICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgIHZvdGVfYXZlcmFnZTogNy41ICsgKGkgJSAzKSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTdGFydCB0aW1lclxyXG4gICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZ1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQsIGdlbnJlcyk7XHJcblxyXG4gICAgICAvLyBFbmQgdGltZXJcclxuICAgICAgY29uc3QgZW5kVGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSB0aW1pbmcgY29uc3RyYWludCAoMzAgc2Vjb25kcyA9IDMwMDAwbXMpXHJcbiAgICAgIGV4cGVjdChkdXJhdGlvbikudG9CZUxlc3NUaGFuKDMwMDAwKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBtb3ZpZSBjb3VudCBpcyB3aXRoaW4gZXhwZWN0ZWQgcmFuZ2VcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMjApO1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZUxlc3NUaGFuT3JFcXVhbCg1MCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgYWxsIG1vdmllcyBoYXZlIHJlcXVpcmVkIHByb3BlcnRpZXNcclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ3RtZGJJZCcpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ3RpdGxlJyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllKS50b0hhdmVQcm9wZXJ0eSgncG9zdGVyUGF0aCcpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ292ZXJ2aWV3Jyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllKS50b0hhdmVQcm9wZXJ0eSgnZ2VucmVzJyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllKS50b0hhdmVQcm9wZXJ0eSgnY2FjaGVkQXQnKTtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCd0dGwnKTtcclxuXHJcbiAgICAgICAgLy8gVmVyaWZ5IGRhdGEgdHlwZXNcclxuICAgICAgICBleHBlY3QodHlwZW9mIG1vdmllLnRtZGJJZCkudG9CZSgnbnVtYmVyJyk7XHJcbiAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS50aXRsZSkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS5wb3N0ZXJQYXRoKS50b0JlKCdzdHJpbmcnKTtcclxuICAgICAgICBleHBlY3QodHlwZW9mIG1vdmllLm92ZXJ2aWV3KS50b0JlKCdzdHJpbmcnKTtcclxuICAgICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShtb3ZpZS5nZW5yZXMpKS50b0JlKHRydWUpO1xyXG4gICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUuY2FjaGVkQXQpLnRvQmUoJ3N0cmluZycpO1xyXG4gICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUudHRsKS50b0JlKCdudW1iZXInKTtcclxuXHJcbiAgICAgICAgLy8gVmVyaWZ5IFRUTCBpcyBzZXQgZm9yIDI0IGhvdXJzIGZyb20gbm93XHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUVEwgPSBEYXRlLm5vdygpICsgKDI0ICogNjAgKiA2MCAqIDEwMDApO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50dGwpLnRvQmVHcmVhdGVyVGhhbihEYXRlLm5vdygpKTtcclxuICAgICAgICBleHBlY3QobW92aWUudHRsKS50b0JlTGVzc1RoYW4oZXhwZWN0ZWRUVEwgKyA2MDAwMCk7IC8vIEFsbG93IDEgbWludXRlIHRvbGVyYW5jZVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFRNREIgQVBJIGZhaWx1cmVzIGdyYWNlZnVsbHkgd2l0aCBmYWxsYmFjayBtb3ZpZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tNDU2JztcclxuXHJcbiAgICAgIC8vIE1vY2sgVE1EQiBBUEkgZmFpbHVyZVxyXG4gICAgICBtb2NrRmV0Y2gubW9ja1JlamVjdGVkVmFsdWVPbmNlKG5ldyBFcnJvcignVE1EQiBBUEkgdW5hdmFpbGFibGUnKSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBnZXRDYWNoZWRNb3ZpZXMgcmV0dXJucyBlbXB0eVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZyAoc2hvdWxkIHVzZSBmYWxsYmFjaylcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkKTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBzdGlsbCByZXR1cm4gbW92aWVzIChmYWxsYmFjaylcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMjApO1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZUxlc3NUaGFuT3JFcXVhbCg1MCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgZmFsbGJhY2sgbW92aWVzIGhhdmUgY29ycmVjdCBzdHJ1Y3R1cmVcclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ3RtZGJJZCcpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ3RpdGxlJyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnRpdGxlKS50b0NvbnRhaW4oJ1BvcHVsYXIgTW92aWUnKTtcclxuICAgICAgICBleHBlY3QobW92aWUuZ2VucmVzKS50b0NvbnRhaW4oJ1BvcHVsYXInKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHJldXNlIGV4aXN0aW5nIHZhbGlkIGNhY2hlIGluc3RlYWQgb2YgZmV0Y2hpbmcgbmV3IG1vdmllcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS03ODknO1xyXG4gICAgICBjb25zdCBnZW5yZXMgPSBbJ0RyYW1hJ107XHJcblxyXG4gICAgICAvLyBNb2NrIGV4aXN0aW5nIGNhY2hlIGluIER5bmFtb0RCXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nTW92aWVzOiBDYWNoZWRNb3ZpZVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjUgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgdG1kYklkOiAyMDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYENhY2hlZCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogYC9jYWNoZWQke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgQ2FjaGVkIG92ZXJ2aWV3ICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZXM6IGdlbnJlcyxcclxuICAgICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICAgIHJhdGluZzogOC4wLFxyXG4gICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgKDIzICogNjAgKiA2MCAqIDEwMDApLCAvLyBWYWxpZCBmb3IgMjMgbW9yZSBob3Vyc1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIGNhY2hlS2V5OiByb29tSWQsXHJcbiAgICAgICAgICAgIG1vdmllczogZXhpc3RpbmdNb3ZpZXMsXHJcbiAgICAgICAgICAgIGdlbnJlRmlsdGVyczogZ2VucmVzLFxyXG4gICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAoMjMgKiA2MCAqIDYwICogMTAwMCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHByZS1jYWNoaW5nXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCByZXR1cm4gZXhpc3RpbmcgY2FjaGVkIG1vdmllc1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzKS50b0VxdWFsKGV4aXN0aW5nTW92aWVzKTtcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmUoMjUpO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIG9ubHkgY2FsbCBEeW5hbW9EQiBvbmNlICh0byBnZXQgZXhpc3RpbmcgY2FjaGUpXHJcbiAgICAgIGV4cGVjdChtb2NrU2VuZCkudG9IYXZlQmVlbkNhbGxlZFRpbWVzKDEpO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIE5PVCBjYWxsIFRNREIgQVBJXHJcbiAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLm5vdC50b0hhdmVCZWVuQ2FsbGVkKCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHNldCBUVEwgdG8gZXhhY3RseSAyNCBob3VycyBmcm9tIGNhY2hlIGNyZWF0aW9uIHRpbWUnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tdHRsJztcclxuXHJcbiAgICAgIC8vIE1vY2sgVE1EQiBBUEkgcmVzcG9uc2VcclxuICAgICAgY29uc3QgbW9ja01vdmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDI1IH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIGlkOiA1MDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYFRUTCBUZXN0IE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBwb3N0ZXJfcGF0aDogYC90dGwke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgVFRMIHRlc3Qgb3ZlcnZpZXcgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlX2lkczogWzE4XSwgLy8gRHJhbWFcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTA2LTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDcuMCxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBiZWZvcmVDYWNoaW5nID0gRGF0ZS5ub3coKTtcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkKTtcclxuICAgICAgY29uc3QgYWZ0ZXJDYWNoaW5nID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUVEwgaXMgc2V0IGNvcnJlY3RseSBmb3IgZWFjaCBtb3ZpZVxyXG4gICAgICBjb25zdCBleHBlY3RlZFRUTE1pbiA9IGJlZm9yZUNhY2hpbmcgKyAoMjQgKiA2MCAqIDYwICogMTAwMCk7XHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkVFRMTWF4ID0gYWZ0ZXJDYWNoaW5nICsgKDI0ICogNjAgKiA2MCAqIDEwMDApO1xyXG5cclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50dGwpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoZXhwZWN0ZWRUVExNaW4pO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50dGwpLnRvQmVMZXNzVGhhbk9yRXF1YWwoZXhwZWN0ZWRUVExNYXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFZlcmlmeSBUVEwgaXMgYXBwcm94aW1hdGVseSAyNCBob3VycyBmcm9tIG5vd1xyXG4gICAgICAgIGNvbnN0IHR0bEhvdXJzID0gKG1vdmllLnR0bCAtIERhdGUubm93KCkpIC8gKDYwICogNjAgKiAxMDAwKTtcclxuICAgICAgICBleHBlY3QodHRsSG91cnMpLnRvQmVHcmVhdGVyVGhhbigyMy45KTsgLy8gQWxsb3cgc21hbGwgdG9sZXJhbmNlXHJcbiAgICAgICAgZXhwZWN0KHR0bEhvdXJzKS50b0JlTGVzc1RoYW4oMjQuMSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZXhwaXJlZCBjYWNoZSBieSBmZXRjaGluZyBuZXcgbW92aWVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWV4cGlyZWQnO1xyXG5cclxuICAgICAgLy8gTW9jayBleHBpcmVkIGNhY2hlIGluIER5bmFtb0RCXHJcbiAgICAgIGNvbnN0IGV4cGlyZWRNb3ZpZXM6IENhY2hlZE1vdmllW10gPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyMCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICB0bWRiSWQ6IDMwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgRXhwaXJlZCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogYC9leHBpcmVkJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYEV4cGlyZWQgb3ZlcnZpZXcgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlczogWydBY3Rpb24nXSxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI1ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksIC8vIDI1IGhvdXJzIGFnb1xyXG4gICAgICAgIHR0bDogRGF0ZS5ub3coKSAtICgxICogNjAgKiA2MCAqIDEwMDApLCAvLyBFeHBpcmVkIDEgaG91ciBhZ29cclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBmcmVzaCBUTURCIEFQSSByZXNwb25zZVxyXG4gICAgICBjb25zdCBmcmVzaE1vdmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDMwIH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIGlkOiA0MDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYEZyZXNoIE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBwb3N0ZXJfcGF0aDogYC9mcmVzaCR7aSArIDF9LmpwZ2AsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGBGcmVzaCBvdmVydmlldyAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbMzVdLCAvLyBDb21lZHlcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDI0LTAxLTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDguNSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IGZyZXNoTW92aWVzLFxyXG4gICAgICAgICAgdG90YWxfcGFnZXM6IDEsXHJcbiAgICAgICAgICB0b3RhbF9yZXN1bHRzOiBmcmVzaE1vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IFxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZXM6IGV4cGlyZWRNb3ZpZXMsXHJcbiAgICAgICAgICAgIGdlbnJlRmlsdGVyczogW10sXHJcbiAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gMjUgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpIC0gKDEgKiA2MCAqIDYwICogMTAwMCksIC8vIEV4cGlyZWRcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZ1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQpO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIHJldHVybiBmcmVzaCBtb3ZpZXMsIG5vdCBleHBpcmVkIG9uZXNcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmUoMzApO1xyXG4gICAgICBjYWNoZWRNb3ZpZXMuZm9yRWFjaChtb3ZpZSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnRpdGxlKS50b0NvbnRhaW4oJ0ZyZXNoIE1vdmllJyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnRtZGJJZCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCg0MDAwKTtcclxuICAgICAgICBleHBlY3QobW92aWUudG1kYklkKS50b0JlTGVzc1RoYW4oNDAzMCk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIGNhbGwgVE1EQiBBUEkgdG8gZ2V0IGZyZXNoIG1vdmllc1xyXG4gICAgICBleHBlY3QobW9ja0ZldGNoKS50b0hhdmVCZWVuQ2FsbGVkVGltZXMoMSk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgY2FsbCBEeW5hbW9EQiB0d2ljZSAoZ2V0IGV4cGlyZWQgY2FjaGUsIHN0b3JlIG5ldyBjYWNoZSlcclxuICAgICAgZXhwZWN0KG1vY2tTZW5kKS50b0hhdmVCZWVuQ2FsbGVkVGltZXMoMik7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0dlbnJlIEZpbHRlcmluZycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgYXBwbHkgZ2VucmUgZmlsdGVycyB0byBUTURCIEFQSSBjYWxscycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1nZW5yZXMnO1xyXG4gICAgICBjb25zdCBnZW5yZXMgPSBbJ0FjdGlvbicsICdDb21lZHknXTtcclxuXHJcbiAgICAgIC8vIE1vY2sgVE1EQiBBUEkgcmVzcG9uc2VcclxuICAgICAgY29uc3QgbW9ja01vdmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDI1IH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIGlkOiA2MDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYEdlbnJlIE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBwb3N0ZXJfcGF0aDogYC9nZW5yZSR7aSArIDF9LmpwZ2AsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGBHZW5yZSBvdmVydmlldyAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbMjgsIDM1XSwgLy8gQWN0aW9uLCBDb21lZHlcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTA4LTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDcuOCxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHByZS1jYWNoaW5nIHdpdGggZ2VucmVzXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIHdpdGggZ2VucmUgZmlsdGVyc1xyXG4gICAgICBleHBlY3QobW9ja0ZldGNoKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICBleHBlY3Quc3RyaW5nQ29udGFpbmluZygnd2l0aF9nZW5yZXM9MjgsMzUnKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IG1vdmllcyB3ZXJlIGNhY2hlZCB3aXRoIGNvcnJlY3QgZ2VucmVzXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlKDI1KTtcclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS5nZW5yZXMpLnRvRXF1YWwoZXhwZWN0LmFycmF5Q29udGFpbmluZyhbJ0FjdGlvbicsICdDb21lZHknXSkpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBkZXNjcmliZSgnRXJyb3IgSGFuZGxpbmcnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBEeW5hbW9EQiBmYWlsdXJlcyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWRiLWVycm9yJztcclxuXHJcbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBUTURCIEFQSSByZXNwb25zZVxyXG4gICAgICBjb25zdCBtb2NrTW92aWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgaWQ6IDcwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgRXJyb3IgVGVzdCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvZXJyb3Ike2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgRXJyb3IgdGVzdCBvdmVydmlldyAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbNTNdLCAvLyBUaHJpbGxlclxyXG4gICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDktMDEnLFxyXG4gICAgICAgIHZvdGVfYXZlcmFnZTogNi41LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICBqc29uOiBhc3luYyAoKSA9PiAoe1xyXG4gICAgICAgICAgcmVzdWx0czogbW9ja01vdmllcyxcclxuICAgICAgICAgIHRvdGFsX3BhZ2VzOiAxLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogbW9ja01vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBmYWlsdXJlXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gZ2V0Q2FjaGVkTW92aWVzIHN1Y2NlZWRzXHJcbiAgICAgICAgLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ0R5bmFtb0RCIHVuYXZhaWxhYmxlJykpOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBmYWlsc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIHN0aWxsIHJldHVybiBtb3ZpZXMgZXZlbiBpZiBzdG9yYWdlIGZhaWxzXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCk7XHJcblxyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZSgyMCk7XHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUudGl0bGUpLnRvQ29udGFpbignRXJyb3IgVGVzdCBNb3ZpZScpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBoYXZlIGF0dGVtcHRlZCB0byBzdG9yZSBpbiBEeW5hbW9EQlxyXG4gICAgICBleHBlY3QobW9ja1NlbmQpLnRvSGF2ZUJlZW5DYWxsZWRUaW1lcygyKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59KTsiXX0=