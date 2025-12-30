/**
 * Property Test: Circuit Breaker Error Handling
 * 
 * Validates Requirements 2.5, 3.5, 6.3:
 * - Movie details use Circuit Breaker protected API
 * - Comprehensive error handling for GraphQL errors
 * - Fallback behavior when external services are unavailable
 * 
 * This property test ensures that the Circuit Breaker pattern works correctly
 * and provides graceful degradation when external services fail.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mediaService } from '../services/mediaService';
import { appSyncService } from '../services/appSyncService';

// Mock the appSyncService
jest.mock('../services/appSyncService', () => ({
  appSyncService: {
    getMovieDetails: jest.fn(),
  },
}));

const mockAppSyncService = appSyncService as jest.Mocked<typeof appSyncService>;

// Property-based test generators
const generateMovieId = () => Math.floor(Math.random() * 1000000);

const generateSuccessfulMovieResponse = (movieId: string) => ({
  getMovieDetails: {
    id: movieId,
    title: `Movie ${Math.random().toString(36).substr(2, 8)}`,
    overview: `This is a test movie overview ${Math.random().toString(36).substr(2, 20)}`,
    poster_path: `/poster${Math.random().toString(36).substr(2, 8)}.jpg`,
    backdrop_path: `/backdrop${Math.random().toString(36).substr(2, 8)}.jpg`,
    vote_average: Math.random() * 10,
    release_date: `${2000 + Math.floor(Math.random() * 24)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
    genres: [
      { id: '28', name: 'Action' },
      { id: '12', name: 'Adventure' },
    ],
    runtime: Math.floor(Math.random() * 120) + 90,
  },
});

const generateCircuitBreakerError = () => new Error('Circuit breaker is OPEN - too many failures');
const generateServiceUnavailableError = () => new Error('Service temporarily unavailable');
const generateTimeoutError = () => new Error('Request timeout');
const generateNetworkError = () => new Error('Network error: ECONNREFUSED');
const generateGraphQLError = () => new Error('GraphQL Error: Field not found');

describe('Property Test: Circuit Breaker Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Successful movie details retrieval via Circuit Breaker
   * For any valid movie ID, successful responses should be handled correctly
   */
  it('should handle successful movie details retrieval via Circuit Breaker', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 10; i++) {
      const movieId = generateMovieId();
      const expectedResponse = generateSuccessfulMovieResponse(movieId.toString());

      mockAppSyncService.getMovieDetails.mockResolvedValueOnce(expectedResponse);

      const result = await mediaService.getMovieDetails(movieId);

      // Verify successful response structure
      expect(result).toBeDefined();
      expect(result?.id).toBe(`movie-${movieId}`);
      expect(result?.tmdbId).toBe(movieId);
      expect(result?.title).toBe(expectedResponse.getMovieDetails.title);
      expect(result?.overview).toBe(expectedResponse.getMovieDetails.overview);
      expect(result?.mediaType).toBe('movie');
      expect(result?.posterPath).toContain('w500');
      expect(result?.backdropPath).toContain('w780');

      // Verify service was called with correct parameters
      expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(movieId.toString());
    }
  });

  /**
   * Property 2: Circuit Breaker OPEN state handling
   * When Circuit Breaker is open, should return fallback data
   */
  it('should return fallback data when Circuit Breaker is OPEN', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 8; i++) {
      const movieId = generateMovieId();
      const circuitBreakerError = generateCircuitBreakerError();

      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(circuitBreakerError);

      const result = await mediaService.getMovieDetails(movieId);

      // Verify fallback response structure
      expect(result).toBeDefined();
      expect(result?.id).toBe(`movie-${movieId}`);
      expect(result?.tmdbId).toBe(movieId);
      expect(result?.title).toBe('Película no disponible');
      expect(result?.overview).toContain('temporalmente');
      expect(result?.mediaType).toBe('movie');
      expect(result?.posterPath).toBeNull();
      expect(result?.backdropPath).toBeNull();
      expect(result?.genres).toEqual(['No disponible']);
      expect(result?.tagline).toBe('Servicio temporalmente no disponible');

      // Verify service was called
      expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(movieId.toString());
    }
  });

  /**
   * Property 3: Service unavailable error handling
   * When external service is unavailable, should return fallback data
   */
  it('should return fallback data when external service is unavailable', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 8; i++) {
      const movieId = generateMovieId();
      const serviceError = generateServiceUnavailableError();

      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(serviceError);

      const result = await mediaService.getMovieDetails(movieId);

      // Verify fallback response structure
      expect(result).toBeDefined();
      expect(result?.title).toBe('Película no disponible');
      expect(result?.overview).toContain('problemas de conectividad');
      expect(result?.rating).toBe(0);
      expect(result?.voteCount).toBe(0);

      // Verify service was called
      expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(movieId.toString());
    }
  });

  /**
   * Property 4: Network error resilience
   * Various network errors should be handled gracefully
   */
  it('should handle various network errors gracefully', async () => {
    const errorGenerators = [
      generateTimeoutError,
      generateNetworkError,
      generateGraphQLError,
    ];

    for (const errorGenerator of errorGenerators) {
      for (let i = 0; i < 5; i++) {
        const movieId = generateMovieId();
        const networkError = errorGenerator();

        mockAppSyncService.getMovieDetails.mockRejectedValueOnce(networkError);

        const result = await mediaService.getMovieDetails(movieId);

        // For non-circuit breaker errors, should return null
        expect(result).toBeNull();

        // Verify service was called
        expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(movieId.toString());
      }
    }
  });

  /**
   * Property 5: TV details fallback behavior
   * TV details should also handle Circuit Breaker errors correctly
   */
  it('should handle TV details with Circuit Breaker fallback', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 8; i++) {
      const tvId = generateMovieId();
      const circuitBreakerError = generateCircuitBreakerError();

      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(circuitBreakerError);

      const result = await mediaService.getTVDetails(tvId);

      // Verify TV fallback response structure
      expect(result).toBeDefined();
      expect(result?.id).toBe(`tv-${tvId}`);
      expect(result?.tmdbId).toBe(tvId);
      expect(result?.title).toBe('Serie no disponible');
      expect(result?.mediaType).toBe('tv');
      expect(result?.numberOfSeasons).toBe(0);
      expect(result?.numberOfEpisodes).toBe(0);
      expect(result?.creator).toBeNull();

      // Verify service was called
      expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(tvId.toString());
    }
  });

  /**
   * Property 6: Fallback data consistency
   * Fallback data should always have consistent structure
   */
  it('should maintain consistent fallback data structure', async () => {
    const errorTypes = [
      generateCircuitBreakerError,
      generateServiceUnavailableError,
    ];

    for (const errorType of errorTypes) {
      for (let i = 0; i < 6; i++) {
        const movieId = generateMovieId();
        const error = errorType();

        mockAppSyncService.getMovieDetails.mockRejectedValueOnce(error);

        const result = await mediaService.getMovieDetails(movieId);

        // Verify consistent fallback structure
        expect(result).toBeDefined();
        expect(typeof result?.id).toBe('string');
        expect(typeof result?.tmdbId).toBe('number');
        expect(typeof result?.title).toBe('string');
        expect(typeof result?.overview).toBe('string');
        expect(typeof result?.mediaType).toBe('string');
        expect(typeof result?.rating).toBe('number');
        expect(typeof result?.voteCount).toBe('number');
        expect(Array.isArray(result?.genres)).toBe(true);
        expect(result?.posterPath).toBeNull();
        expect(result?.backdropPath).toBeNull();
        expect(result?.trailerKey).toBeNull();
        expect(Array.isArray(result?.watchProviders)).toBe(true);
        expect(Array.isArray(result?.cast)).toBe(true);

        // Verify fallback-specific values
        expect(result?.title).toContain('no disponible');
        expect(result?.overview).toContain('temporalmente');
        expect(result?.genres).toContain('No disponible');
      }
    }
  });

  /**
   * Property 7: Error logging and monitoring
   * All errors should be properly logged for monitoring
   */
  it('should log errors appropriately for monitoring', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const errorScenarios = [
      { error: generateCircuitBreakerError(), expectWarn: true },
      { error: generateServiceUnavailableError(), expectWarn: true },
      { error: generateNetworkError(), expectWarn: false },
      { error: generateGraphQLError(), expectWarn: false },
    ];

    for (const scenario of errorScenarios) {
      const movieId = generateMovieId();
      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(scenario.error);

      await mediaService.getMovieDetails(movieId);

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalled();

      // Verify warning for circuit breaker scenarios
      if (scenario.expectWarn) {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    }

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  /**
   * Property 8: Response time consistency
   * Fallback responses should be fast and consistent
   */
  it('should provide fast fallback responses', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 10; i++) {
      const movieId = generateMovieId();
      const circuitBreakerError = generateCircuitBreakerError();

      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(circuitBreakerError);

      const startTime = Date.now();
      const result = await mediaService.getMovieDetails(movieId);
      const endTime = Date.now();

      // Verify fallback is fast (should be nearly instant)
      expect(endTime - startTime).toBeLessThan(50);

      // Verify fallback data was returned
      expect(result).toBeDefined();
      expect(result?.title).toBe('Película no disponible');
    }
  });

  /**
   * Property 9: Parameter validation consistency
   * Invalid parameters should be handled consistently
   */
  it('should handle invalid parameters consistently', async () => {
    const invalidIds = [0, -1, NaN, Infinity];

    for (const invalidId of invalidIds) {
      // Mock to simulate parameter validation error
      mockAppSyncService.getMovieDetails.mockRejectedValueOnce(
        new Error('Invalid movie ID')
      );

      const result = await mediaService.getMovieDetails(invalidId);

      // Should return null for invalid parameters
      expect(result).toBeNull();

      // Verify service was called (parameter validation happens in service)
      expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledWith(invalidId.toString());
    }
  });

  /**
   * Property 10: Concurrent request handling
   * Multiple concurrent requests should be handled correctly
   */
  it('should handle concurrent requests with Circuit Breaker correctly', async () => {
    const movieIds = Array.from({ length: 5 }, () => generateMovieId());
    
    // Mix of successful and failed responses
    movieIds.forEach((id, index) => {
      if (index % 2 === 0) {
        mockAppSyncService.getMovieDetails.mockResolvedValueOnce(
          generateSuccessfulMovieResponse(id.toString())
        );
      } else {
        mockAppSyncService.getMovieDetails.mockRejectedValueOnce(
          generateCircuitBreakerError()
        );
      }
    });

    // Execute concurrent requests
    const promises = movieIds.map(id => mediaService.getMovieDetails(id));
    const results = await Promise.all(promises);

    // Verify all requests completed
    expect(results).toHaveLength(5);

    // Verify mixed results (some successful, some fallback)
    results.forEach((result, index) => {
      expect(result).toBeDefined();
      if (index % 2 === 0) {
        // Successful responses
        expect(result?.title).not.toBe('Película no disponible');
      } else {
        // Fallback responses
        expect(result?.title).toBe('Película no disponible');
      }
    });

    // Verify all service calls were made
    expect(mockAppSyncService.getMovieDetails).toHaveBeenCalledTimes(5);
  });
});