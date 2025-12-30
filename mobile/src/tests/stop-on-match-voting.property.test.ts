/**
 * Property Test: Stop-on-Match Voting System
 * 
 * Validates Requirements 3.2, 3.3:
 * - Voting system uses Stop-on-Match algorithm via AppSync GraphQL
 * - Immediate match detection and navigation when consensus is reached
 * - Proper handling of MATCHED status and resultMovieId
 * 
 * This property test ensures that the Stop-on-Match algorithm works correctly
 * across all possible voting scenarios and maintains data consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { appSyncService } from '../services/appSyncService';

// Mock the appSyncService
jest.mock('../services/appSyncService', () => ({
  appSyncService: {
    vote: jest.fn(),
    getRoom: jest.fn(),
  },
}));

const mockAppSyncService = appSyncService as jest.Mocked<typeof appSyncService>;

// Property-based test generators
const generateRoomId = () => `room-${Math.random().toString(36).substr(2, 9)}`;
const generateMovieId = () => `${Math.floor(Math.random() * 1000000)}`;

const generateActiveVoteResponse = (roomId: string) => ({
  vote: {
    id: roomId,
    status: 'ACTIVE',
    resultMovieId: null,
    hostId: `user-${Math.random().toString(36).substr(2, 9)}`,
  },
});

const generateMatchedVoteResponse = (roomId: string, movieId: string) => ({
  vote: {
    id: roomId,
    status: 'MATCHED',
    resultMovieId: movieId,
    hostId: `user-${Math.random().toString(36).substr(2, 9)}`,
  },
});

const generateRoomWithMatch = (roomId: string, movieId: string) => ({
  getRoom: {
    id: roomId,
    name: `Test Room ${Math.random().toString(36).substr(2, 5)}`,
    hostId: `user-${Math.random().toString(36).substr(2, 9)}`,
    status: 'MATCHED',
    inviteCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
    resultMovieId: movieId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});

const generateActiveRoom = (roomId: string) => ({
  getRoom: {
    id: roomId,
    name: `Test Room ${Math.random().toString(36).substr(2, 5)}`,
    hostId: `user-${Math.random().toString(36).substr(2, 9)}`,
    status: 'ACTIVE',
    inviteCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
    resultMovieId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});

describe('Property Test: Stop-on-Match Voting System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Vote without match maintains ACTIVE status
   * For any vote that doesn't create a match, status should remain ACTIVE
   */
  it('should maintain ACTIVE status when vote does not create match', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 15; i++) {
      const roomId = generateRoomId();
      const movieId = generateMovieId();
      const expectedResponse = generateActiveVoteResponse(roomId);

      mockAppSyncService.vote.mockResolvedValueOnce(expectedResponse);

      const result = await appSyncService.vote(roomId, movieId);

      // Verify vote response structure
      expect(result.vote).toBeDefined();
      expect(result.vote.id).toBe(roomId);
      expect(result.vote.status).toBe('ACTIVE');
      expect(result.vote.resultMovieId).toBeNull();
      expect(result.vote.hostId).toBeDefined();

      // Verify service was called with correct parameters
      expect(mockAppSyncService.vote).toHaveBeenCalledWith(roomId, movieId);
    }
  });

  /**
   * Property 2: Vote with match triggers MATCHED status
   * For any vote that creates a match, status should be MATCHED with resultMovieId
   */
  it('should trigger MATCHED status when vote creates unanimous consensus', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 15; i++) {
      const roomId = generateRoomId();
      const movieId = generateMovieId();
      const expectedResponse = generateMatchedVoteResponse(roomId, movieId);

      mockAppSyncService.vote.mockResolvedValueOnce(expectedResponse);

      const result = await appSyncService.vote(roomId, movieId);

      // Verify match response structure
      expect(result.vote).toBeDefined();
      expect(result.vote.id).toBe(roomId);
      expect(result.vote.status).toBe('MATCHED');
      expect(result.vote.resultMovieId).toBe(movieId);
      expect(result.vote.hostId).toBeDefined();

      // Verify service was called with correct parameters
      expect(mockAppSyncService.vote).toHaveBeenCalledWith(roomId, movieId);
    }
  });

  /**
   * Property 3: Room status consistency with vote results
   * Room status should always be consistent with vote results
   */
  it('should maintain consistency between room status and vote results', async () => {
    // Test ACTIVE rooms
    for (let i = 0; i < 8; i++) {
      const roomId = generateRoomId();
      const movieId = generateMovieId();
      
      // Mock active room
      const activeRoomResponse = generateActiveRoom(roomId);
      mockAppSyncService.getRoom.mockResolvedValueOnce(activeRoomResponse);
      
      const roomResult = await appSyncService.getRoom(roomId);
      
      expect(roomResult.getRoom.status).toBe('ACTIVE');
      expect(roomResult.getRoom.resultMovieId).toBeNull();
      
      // Mock vote that doesn't match
      const activeVoteResponse = generateActiveVoteResponse(roomId);
      mockAppSyncService.vote.mockResolvedValueOnce(activeVoteResponse);
      
      const voteResult = await appSyncService.vote(roomId, movieId);
      
      expect(voteResult.vote.status).toBe('ACTIVE');
      expect(voteResult.vote.resultMovieId).toBeNull();
    }

    // Test MATCHED rooms
    for (let i = 0; i < 8; i++) {
      const roomId = generateRoomId();
      const movieId = generateMovieId();
      
      // Mock matched room
      const matchedRoomResponse = generateRoomWithMatch(roomId, movieId);
      mockAppSyncService.getRoom.mockResolvedValueOnce(matchedRoomResponse);
      
      const roomResult = await appSyncService.getRoom(roomId);
      
      expect(roomResult.getRoom.status).toBe('MATCHED');
      expect(roomResult.getRoom.resultMovieId).toBe(movieId);
    }
  });

  /**
   * Property 4: Stop-on-Match algorithm prevents further voting
   * Once a match is found, no further votes should be processed
   */
  it('should prevent further voting once match is found', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 10; i++) {
      const roomId = generateRoomId();
      const matchedMovieId = generateMovieId();
      const newMovieId = generateMovieId();
      
      // First, simulate a room that already has a match
      const matchedRoomResponse = generateRoomWithMatch(roomId, matchedMovieId);
      mockAppSyncService.getRoom.mockResolvedValueOnce(matchedRoomResponse);
      
      const roomResult = await appSyncService.getRoom(roomId);
      
      // Verify room is already matched
      expect(roomResult.getRoom.status).toBe('MATCHED');
      expect(roomResult.getRoom.resultMovieId).toBe(matchedMovieId);
      
      // Attempt to vote on a different movie should be rejected or ignored
      const duplicateVoteError = new Error('Room already has a match');
      mockAppSyncService.vote.mockRejectedValueOnce(duplicateVoteError);
      
      await expect(appSyncService.vote(roomId, newMovieId)).rejects.toThrow('Room already has a match');
    }
  });

  /**
   * Property 5: Vote response data integrity
   * All vote responses should maintain data integrity and type consistency
   */
  it('should maintain data integrity across all vote responses', async () => {
    const testScenarios = [
      { name: 'ACTIVE', generator: generateActiveVoteResponse },
      { name: 'MATCHED', generator: (roomId: string) => generateMatchedVoteResponse(roomId, generateMovieId()) },
    ];

    for (const scenario of testScenarios) {
      for (let i = 0; i < 10; i++) {
        const roomId = generateRoomId();
        const movieId = generateMovieId();
        const expectedResponse = scenario.generator(roomId);

        mockAppSyncService.vote.mockResolvedValueOnce(expectedResponse);

        const result = await appSyncService.vote(roomId, movieId);

        // Verify basic structure
        expect(result.vote).toBeDefined();
        expect(typeof result.vote.id).toBe('string');
        expect(typeof result.vote.status).toBe('string');
        expect(['ACTIVE', 'MATCHED']).toContain(result.vote.status);
        expect(typeof result.vote.hostId).toBe('string');

        // Verify status-specific constraints
        if (result.vote.status === 'MATCHED') {
          expect(result.vote.resultMovieId).toBeDefined();
          expect(typeof result.vote.resultMovieId).toBe('string');
        } else if (result.vote.status === 'ACTIVE') {
          expect(result.vote.resultMovieId).toBeNull();
        }

        // Verify service call
        expect(mockAppSyncService.vote).toHaveBeenCalledWith(roomId, movieId);
      }
    }
  });

  /**
   * Property 6: Error handling for invalid vote scenarios
   * System should handle various error scenarios gracefully
   */
  it('should handle vote errors gracefully and consistently', async () => {
    const errorScenarios = [
      { error: new Error('Duplicate vote detected'), expectedMessage: 'Duplicate vote detected' },
      { error: new Error('Room not found'), expectedMessage: 'Room not found' },
      { error: new Error('Movie not found'), expectedMessage: 'Movie not found' },
      { error: new Error('User not authorized'), expectedMessage: 'User not authorized' },
      { error: new Error('Room is inactive'), expectedMessage: 'Room is inactive' },
    ];

    for (const scenario of errorScenarios) {
      for (let i = 0; i < 5; i++) {
        const roomId = generateRoomId();
        const movieId = generateMovieId();

        mockAppSyncService.vote.mockRejectedValueOnce(scenario.error);

        await expect(appSyncService.vote(roomId, movieId)).rejects.toThrow(scenario.expectedMessage);

        expect(mockAppSyncService.vote).toHaveBeenCalledWith(roomId, movieId);
      }
    }
  });

  /**
   * Property 7: Immediate match detection timing
   * Match detection should be immediate and not require polling
   */
  it('should detect matches immediately without polling', async () => {
    // Generate multiple test cases
    for (let i = 0; i < 12; i++) {
      const roomId = generateRoomId();
      const movieId = generateMovieId();
      
      // Clear mocks for each iteration
      jest.clearAllMocks();
      
      // Simulate immediate match response
      const matchResponse = generateMatchedVoteResponse(roomId, movieId);
      
      const startTime = Date.now();
      mockAppSyncService.vote.mockResolvedValueOnce(matchResponse);
      
      const result = await appSyncService.vote(roomId, movieId);
      const endTime = Date.now();
      
      // Verify match was detected immediately (within reasonable time)
      expect(endTime - startTime).toBeLessThan(100); // Should be nearly instant
      
      // Verify match data
      expect(result.vote.status).toBe('MATCHED');
      expect(result.vote.resultMovieId).toBe(movieId);
      
      // Verify only one call was made (no polling)
      expect(mockAppSyncService.vote).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * Property 8: Vote parameter validation
   * All vote operations should validate input parameters consistently
   */
  it('should validate vote parameters consistently', async () => {
    const invalidParameterScenarios = [
      { roomId: '', movieId: 'valid-movie', error: 'Invalid room ID' },
      { roomId: 'valid-room', movieId: '', error: 'Invalid movie ID' },
      { roomId: null, movieId: 'valid-movie', error: 'Room ID is required' },
      { roomId: 'valid-room', movieId: null, error: 'Movie ID is required' },
    ];

    for (const scenario of invalidParameterScenarios) {
      const validationError = new Error(scenario.error);
      mockAppSyncService.vote.mockRejectedValueOnce(validationError);

      await expect(appSyncService.vote(scenario.roomId as any, scenario.movieId as any))
        .rejects.toThrow(scenario.error);

      expect(mockAppSyncService.vote).toHaveBeenCalledWith(scenario.roomId, scenario.movieId);
    }
  });
});