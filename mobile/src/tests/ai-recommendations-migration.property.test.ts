/**
 * Property Test: AI Recommendations Migration
 * 
 * Validates Requirements 7.4:
 * - AI recommendations use new AppSync GraphQL backend
 * - Fallback behavior when AI service is unavailable
 * - Response format consistency and error handling
 * - Circuit Breaker integration for AI service
 * 
 * This property test ensures that AI recommendations work correctly
 * through the new GraphQL backend and provide graceful fallbacks.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { aiService, TriniResponse } from '../services/aiService';
import { appSyncService } from '../services/appSyncService';

// Mock the appSyncService
jest.mock('../services/appSyncService', () => ({
  appSyncService: {
    getAIRecommendations: jest.fn(),
  },
}));

const mockAppSyncService = appSyncService as jest.Mocked<typeof appSyncService>;

// Property-based test generators
const generateUserText = () => {
  const emotions = ['triste', 'feliz', 'aburrido', 'estresado', 'emocionado', 'cansado'];
  const preferences = ['acción', 'comedia', 'drama', 'terror', 'romance', 'ciencia ficción'];
  const contexts = ['solo en casa', 'con amigos', 'en pareja', 'familia', 'relajado', 'fin de semana'];
  
  const templates = [
    () => `Me siento ${emotions[Math.floor(Math.random() * emotions.length)]} hoy`,
    () => `Quiero ver algo de ${preferences[Math.floor(Math.random() * preferences.length)]}`,
    () => `Estoy ${contexts[Math.floor(Math.random() * contexts.length)]} y no sé qué ver`,
    () => `Necesito algo ${emotions[Math.floor(Math.random() * emotions.length)]} para ${contexts[Math.floor(Math.random() * contexts.length)]}`,
    () => Math.random().toString(36).substr(2, 20), // Random text
  ];
  
  return templates[Math.floor(Math.random() * templates.length)]();
};

const generateSuccessfulAIResponse = () => ({
  getAIRecommendations: {
    chatResponse: `¡Perfecto! Basándome en lo que me dices, creo que te gustaría algo ${Math.random() > 0.5 ? 'emocionante' : 'relajante'}. Aquí tienes mis recomendaciones.`,
    recommendedGenres: generateRandomGenres(),
    recommendedMovies: generateRandomMovies(),
  },
});

const generateRandomGenres = () => {
  const allGenres = ['acción', 'comedia', 'drama', 'terror', 'romance', 'ciencia ficción', 'aventura', 'thriller', 'animación'];
  const count = Math.floor(Math.random() * 4) + 1; // 1-4 genres
  const shuffled = allGenres.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const generateRandomMovies = () => {
  const count = Math.floor(Math.random() * 3) + 1; // 1-3 movies
  return Array.from({ length: count }, (_, i) => ({
    id: Math.floor(Math.random() * 1000000),
    title: `Movie ${Math.random().toString(36).substr(2, 8)}`,
    overview: `This is a test movie overview ${Math.random().toString(36).substr(2, 20)}`,
    poster_path: `/poster${Math.random().toString(36).substr(2, 8)}.jpg`,
    vote_average: Math.round((Math.random() * 5 + 5) * 10) / 10, // 5.0-10.0
    release_date: `${2000 + Math.floor(Math.random() * 24)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
  }));
};

const generateCircuitBreakerError = () => new Error('Circuit breaker is OPEN - AI service unavailable');
const generateServiceUnavailableError = () => new Error('Service temporarily unavailable');
const generateNetworkError = () => new Error('Network error: ECONNREFUSED');
const generateGraphQLError = () => new Error('GraphQL Error: AI service validation failed');

describe('Property Test: AI Recommendations Migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Successful AI recommendations via AppSync
   * For any valid user input, successful AI responses should be handled correctly
   */
  it('should handle successful AI recommendations via AppSync GraphQL', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 12; i++) {
      const userText = generateUserText();
      const expectedResponse = generateSuccessfulAIResponse();

      mockAppSyncService.getAIRecommendations.mockResolvedValueOnce(expectedResponse);

      const result = await aiService.getChatRecommendations(userText);

      // Verify successful response structure
      expect(result).toBeDefined();
      expect(typeof result.chatResponse).toBe('string');
      expect(result.chatResponse.length).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      expect(result.recommendedGenres.length).toBeGreaterThan(0);
      
      if (result.recommendedMovies) {
        expect(Array.isArray(result.recommendedMovies)).toBe(true);
        result.recommendedMovies.forEach(movie => {
          expect(typeof movie.id).toBe('number');
          expect(typeof movie.title).toBe('string');
          expect(typeof movie.overview).toBe('string');
          expect(typeof movie.vote_average).toBe('number');
          expect(movie.vote_average).toBeGreaterThanOrEqual(0);
          expect(movie.vote_average).toBeLessThanOrEqual(10);
        });
      }

      // Verify service was called with correct parameters
      expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
    }
  });

  /**
   * Property 2: Circuit Breaker fallback behavior
   * When Circuit Breaker is open, should return enhanced fallback
   */
  it('should return enhanced fallback when Circuit Breaker is OPEN', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 8; i++) {
      const userText = generateUserText();
      const circuitBreakerError = generateCircuitBreakerError();

      mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(circuitBreakerError);

      const result = await aiService.getChatRecommendations(userText);

      // Verify enhanced fallback response
      expect(result).toBeDefined();
      expect(result.chatResponse).toContain('conexión con el servidor');
      expect(result.chatResponse).toContain('temporalmente interrumpida');
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      expect(result.recommendedGenres).toEqual(['comedia', 'drama', 'acción', 'aventura']);
      
      // Should include fallback movies
      expect(Array.isArray(result.recommendedMovies)).toBe(true);
      expect(result.recommendedMovies?.length).toBe(2);
      expect(result.recommendedMovies?.[0].title).toBe('El Club de la Pelea');
      expect(result.recommendedMovies?.[1].title).toBe('Forrest Gump');

      // Verify service was called
      expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
    }
  });

  /**
   * Property 3: Service unavailable fallback behavior
   * When AI service is unavailable, should return contextual fallback
   */
  it('should return contextual fallback when AI service is unavailable', async () => {
    const emotionalInputs = [
      'Me siento triste',
      'Estoy muy feliz',
      'Me aburro mucho',
      'Estoy estresado del trabajo',
      'Quiero ver algo de terror',
      'Necesito reír un poco',
    ];

    for (const userText of emotionalInputs) {
      const serviceError = generateServiceUnavailableError();
      mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(serviceError);

      const result = await aiService.getChatRecommendations(userText);

      // Verify contextual fallback response
      expect(result).toBeDefined();
      expect(typeof result.chatResponse).toBe('string');
      expect(result.chatResponse.length).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      expect(result.recommendedGenres.length).toBeGreaterThan(0);

      // Verify response is contextual to input
      if (userText.includes('triste')) {
        expect(result.recommendedGenres).toContain('drama');
      } else if (userText.includes('feliz')) {
        expect(result.recommendedGenres).toContain('comedia');
      } else if (userText.includes('terror')) {
        expect(result.recommendedGenres).toContain('terror');
      }

      // Verify service was called
      expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
    }
  });

  /**
   * Property 4: Network error handling
   * Network errors should be handled gracefully with fallback
   */
  it('should handle network errors gracefully with fallback', async () => {
    const networkErrors = [
      generateNetworkError(),
      generateGraphQLError(),
      new Error('Request timeout'),
    ];

    for (const networkError of networkErrors) {
      for (let i = 0; i < 3; i++) {
        const userText = generateUserText();
        mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(networkError);

        const result = await aiService.getChatRecommendations(userText);

        // Verify fallback response is provided
        expect(result).toBeDefined();
        expect(typeof result.chatResponse).toBe('string');
        expect(Array.isArray(result.recommendedGenres)).toBe(true);
        expect(result.recommendedGenres.length).toBeGreaterThan(0);

        // Verify service was called
        expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
      }
    }
  });

  /**
   * Property 5: Response format consistency
   * All responses should maintain consistent format regardless of source
   */
  it('should maintain consistent response format across all scenarios', async () => {
    const scenarios = [
      { name: 'successful', setup: () => mockAppSyncService.getAIRecommendations.mockResolvedValueOnce(generateSuccessfulAIResponse()) },
      { name: 'circuit-breaker', setup: () => mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateCircuitBreakerError()) },
      { name: 'service-unavailable', setup: () => mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateServiceUnavailableError()) },
      { name: 'network-error', setup: () => mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateNetworkError()) },
    ];

    for (const scenario of scenarios) {
      for (let i = 0; i < 5; i++) {
        const userText = generateUserText();
        scenario.setup();

        const result = await aiService.getChatRecommendations(userText);

        // Verify consistent response structure
        expect(result).toBeDefined();
        expect(typeof result.chatResponse).toBe('string');
        expect(result.chatResponse.length).toBeGreaterThan(0);
        expect(Array.isArray(result.recommendedGenres)).toBe(true);
        expect(result.recommendedGenres.length).toBeGreaterThan(0);

        // Verify genres are strings
        result.recommendedGenres.forEach(genre => {
          expect(typeof genre).toBe('string');
          expect(genre.length).toBeGreaterThan(0);
        });

        // Verify movies format if present
        if (result.recommendedMovies) {
          expect(Array.isArray(result.recommendedMovies)).toBe(true);
          result.recommendedMovies.forEach(movie => {
            expect(typeof movie.id).toBe('number');
            expect(typeof movie.title).toBe('string');
            expect(typeof movie.overview).toBe('string');
            expect(typeof movie.poster_path).toBe('string');
            expect(typeof movie.vote_average).toBe('number');
            expect(typeof movie.release_date).toBe('string');
          });
        }

        // Verify service was called
        expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
      }
    }
  });

  /**
   * Property 6: Emotional context recognition in fallback
   * Fallback responses should recognize emotional context from user input
   */
  it('should recognize emotional context in fallback responses', async () => {
    const emotionalContexts = [
      { input: 'Me siento muy triste y deprimido', expectedGenres: ['drama', 'comedia', 'animación'] },
      { input: 'Estoy súper feliz y quiero celebrar', expectedGenres: ['comedia', 'aventura', 'musical'] },
      { input: 'Estoy aburrido sin nada que hacer', expectedGenres: ['acción', 'thriller', 'aventura'] },
      { input: 'Me siento estresado del trabajo', expectedGenres: ['comedia', 'animación', 'aventura'] },
      { input: 'Quiero algo de terror que me asuste', expectedGenres: ['terror', 'thriller', 'misterio'] },
      { input: 'Busco algo romántico para ver en pareja', expectedGenres: ['romance', 'comedia romántica', 'drama'] },
    ];

    for (const context of emotionalContexts) {
      mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateServiceUnavailableError());

      const result = await aiService.getChatRecommendations(context.input);

      // Verify emotional context is recognized
      expect(result).toBeDefined();
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      
      // Check if at least one expected genre is present
      const hasExpectedGenre = context.expectedGenres.some(expectedGenre =>
        result.recommendedGenres.some(actualGenre =>
          actualGenre.toLowerCase().includes(expectedGenre.toLowerCase()) ||
          expectedGenre.toLowerCase().includes(actualGenre.toLowerCase())
        )
      );
      
      expect(hasExpectedGenre).toBe(true);

      // Verify service was called
      expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(context.input);
    }
  });

  /**
   * Property 7: Response time consistency
   * All responses should be reasonably fast, especially fallbacks
   */
  it('should provide fast responses across all scenarios', async () => {
    const scenarios = [
      () => mockAppSyncService.getAIRecommendations.mockResolvedValueOnce(generateSuccessfulAIResponse()),
      () => mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateCircuitBreakerError()),
      () => mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateServiceUnavailableError()),
    ];

    for (const scenario of scenarios) {
      for (let i = 0; i < 5; i++) {
        const userText = generateUserText();
        scenario();

        const startTime = Date.now();
        const result = await aiService.getChatRecommendations(userText);
        const endTime = Date.now();

        // Verify response time is reasonable (should be fast, especially for fallbacks)
        expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second

        // Verify response was provided
        expect(result).toBeDefined();
        expect(result.chatResponse).toBeDefined();

        // Verify service was called
        expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(userText);
      }
    }
  });

  /**
   * Property 8: Input validation and sanitization
   * Various input types should be handled safely
   */
  it('should handle various input types safely', async () => {
    const edgeCaseInputs = [
      '', // Empty string
      '   ', // Whitespace only
      'a'.repeat(1000), // Very long string
      '🎬🍿😊😢💀👻', // Emojis only
      '123456789', // Numbers only
      'MAYÚSCULAS Y minúsculas MeZcLaDaS', // Mixed case
      'Texto con símbolos !@#$%^&*()', // Special characters
    ];

    for (const input of edgeCaseInputs) {
      mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateServiceUnavailableError());

      const result = await aiService.getChatRecommendations(input);

      // Verify safe handling of edge cases
      expect(result).toBeDefined();
      expect(typeof result.chatResponse).toBe('string');
      expect(result.chatResponse.length).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      expect(result.recommendedGenres.length).toBeGreaterThan(0);

      // Verify service was called with original input
      expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledWith(input);
    }
  });

  /**
   * Property 9: Concurrent request handling
   * Multiple concurrent AI requests should be handled correctly
   */
  it('should handle concurrent AI requests correctly', async () => {
    const userTexts = Array.from({ length: 5 }, () => generateUserText());
    
    // Mix of successful and failed responses
    userTexts.forEach((_, index) => {
      if (index % 2 === 0) {
        mockAppSyncService.getAIRecommendations.mockResolvedValueOnce(generateSuccessfulAIResponse());
      } else {
        mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(generateCircuitBreakerError());
      }
    });

    // Execute concurrent requests
    const promises = userTexts.map(text => aiService.getChatRecommendations(text));
    const results = await Promise.all(promises);

    // Verify all requests completed
    expect(results).toHaveLength(5);

    // Verify all responses are valid
    results.forEach((result, index) => {
      expect(result).toBeDefined();
      expect(typeof result.chatResponse).toBe('string');
      expect(Array.isArray(result.recommendedGenres)).toBe(true);
      
      if (index % 2 === 0) {
        // Successful responses should have varied content
        expect(result.chatResponse).not.toContain('conexión con el servidor');
      } else {
        // Fallback responses should indicate service issues
        expect(result.chatResponse).toContain('conexión con el servidor');
      }
    });

    // Verify all service calls were made
    expect(mockAppSyncService.getAIRecommendations).toHaveBeenCalledTimes(5);
  });

  /**
   * Property 10: Error logging and monitoring
   * All errors should be properly logged for monitoring
   */
  it('should log errors appropriately for monitoring', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    const errorScenarios = [
      { error: generateCircuitBreakerError(), expectWarn: true },
      { error: generateServiceUnavailableError(), expectWarn: true },
      { error: generateNetworkError(), expectError: true },
      { error: generateGraphQLError(), expectError: true },
    ];

    for (const scenario of errorScenarios) {
      const userText = generateUserText();
      mockAppSyncService.getAIRecommendations.mockRejectedValueOnce(scenario.error);

      const result = await aiService.getChatRecommendations(userText);

      // Verify response was provided despite error
      expect(result).toBeDefined();

      // Verify appropriate logging occurred
      if (scenario.expectError) {
        expect(consoleSpy).toHaveBeenCalled();
      }
      if (scenario.expectWarn) {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    }

    // Also test successful case logging
    mockAppSyncService.getAIRecommendations.mockResolvedValueOnce(generateSuccessfulAIResponse());
    await aiService.getChatRecommendations('test input');
    expect(consoleLogSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});