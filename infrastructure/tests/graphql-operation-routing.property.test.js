/**
 * Property Test 6: GraphQL Operation Routing
 * 
 * Validates: Requirements 3.5
 * 
 * This test ensures that GraphQL operations are correctly routed to their
 * corresponding resolvers and that the schema definitions match the actual
 * resolver implementations.
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

// Mock AWS SDK
const mockDynamoClient = {
  send: jest.fn()
};

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDynamoClient)
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDynamoClient)
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  QueryCommand: jest.fn()
}));

// Mock UUID
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234')
}));

// Set environment variables
process.env.ROOMS_TABLE = 'test-rooms-table';
process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';

const { handler } = require('../lib/handlers/room');

describe('Property Test 6: GraphQL Operation Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDynamoClient.send.mockReset();
  });

  /**
   * Property: All GraphQL query operations defined in schema have corresponding handlers
   */
  test('Property: Schema query operations have handlers', async () => {
    // Read the GraphQL schema
    const schemaPath = path.join(__dirname, '..', 'schema.graphql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract query operations from schema
    const queryMatch = schemaContent.match(/type Query\s*{([^}]+)}/s);
    expect(queryMatch).toBeTruthy();
    
    const queryContent = queryMatch[1];
    const queryOperations = queryContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const match = line.match(/^(\w+)\s*[\(:].*$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    
    // Test each query operation that should be handled by room handler
    const roomQueries = queryOperations.filter(op => 
      op.includes('Room') || op.includes('room') || op === 'getMyHistory' || op === 'getUserRooms'
    );
    
    console.log('Room-related query operations:', roomQueries);
    
    for (const operation of roomQueries) {
      const event = {
        info: { fieldName: operation },
        identity: { sub: 'test-user' },
        arguments: {}
      };
      
      // Mock successful DynamoDB responses
      mockDynamoClient.send.mockResolvedValue({
        Items: [],
        Item: null
      });
      
      try {
        await handler(event);
        // If we get here, the operation is handled (even if it returns empty results)
        expect(true).toBe(true);
      } catch (error) {
        // Check if it's an "unsupported operation" error
        if (error.message.includes('Operación no soportada')) {
          throw new Error(`Query operation '${operation}' from schema is not handled by resolver`);
        }
        // Other errors are acceptable (like validation errors, missing data, etc.)
      }
    }
  });

  /**
   * Property: All mutation operations defined in schema have corresponding handlers
   */
  test('Property: Schema mutation operations have handlers', async () => {
    // Read the GraphQL schema
    const schemaPath = path.join(__dirname, '..', 'schema.graphql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract mutation operations from schema
    const mutationMatch = schemaContent.match(/type Mutation\s*{([^}]+)}/s);
    expect(mutationMatch).toBeTruthy();
    
    const mutationContent = mutationMatch[1];
    const mutationOperations = mutationContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const match = line.match(/^(\w+)\s*[\(:].*$/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .filter(op => !op.startsWith('publish')); // Skip publish mutations (handled by AppSync)
    
    // Test each mutation operation that should be handled by room handler
    const roomMutations = mutationOperations.filter(op => 
      op.includes('Room') || op.includes('room')
    );
    
    console.log('Room-related mutation operations:', roomMutations);
    
    for (const operation of roomMutations) {
      const event = {
        info: { fieldName: operation },
        identity: { sub: 'test-user' },
        arguments: {
          input: { name: 'Test Room' },
          name: 'Test Room',
          roomId: 'test-room'
        }
      };
      
      // Mock successful DynamoDB responses
      mockDynamoClient.send.mockResolvedValue({
        Items: [],
        Item: { roomId: 'test-room', status: 'WAITING' }
      });
      
      try {
        await handler(event);
        // If we get here, the operation is handled
        expect(true).toBe(true);
      } catch (error) {
        // Check if it's an "unsupported operation" error
        if (error.message.includes('Operación no soportada')) {
          throw new Error(`Mutation operation '${operation}' from schema is not handled by resolver`);
        }
        // Other errors are acceptable (like validation errors, missing data, etc.)
      }
    }
  });

  /**
   * Property: Handler supports all expected room operations
   */
  test('Property: Handler supports expected room operations', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom(
        'createRoom',
        'createRoomDebug', 
        'createRoomSimple',
        'joinRoom',
        'getMyHistory',
        'getUserRooms',
        'getRoom'
      ),
      fc.string({ minLength: 1, maxLength: 50 }),
      async (operation, userId) => {
        const event = {
          info: { fieldName: operation },
          identity: { sub: userId },
          arguments: {
            input: { name: 'Test Room' },
            name: 'Test Room',
            roomId: 'test-room-id'
          }
        };
        
        // Mock DynamoDB responses
        mockDynamoClient.send.mockResolvedValue({
          Items: [],
          Item: { 
            roomId: 'test-room-id', 
            status: 'WAITING',
            name: 'Test Room',
            hostId: userId
          }
        });
        
        try {
          const result = await handler(event);
          // Should not throw "unsupported operation" error
          expect(result).toBeDefined();
        } catch (error) {
          // Should not be an unsupported operation error
          expect(error.message).not.toContain('Operación no soportada');
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Invalid operations are properly rejected
   */
  test('Property: Invalid operations are rejected', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
        !['createRoom', 'createRoomDebug', 'createRoomSimple', 'joinRoom', 
          'getMyHistory', 'getUserRooms', 'getRoom'].includes(s)
      ),
      fc.string({ minLength: 1, maxLength: 50 }),
      async (invalidOperation, userId) => {
        const event = {
          info: { fieldName: invalidOperation },
          identity: { sub: userId },
          arguments: {}
        };
        
        try {
          await handler(event);
          throw new Error(`Invalid operation '${invalidOperation}' should have been rejected`);
        } catch (error) {
          expect(error.message).toContain('Operación no soportada');
        }
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: getUserRooms and getMyHistory are equivalent
   */
  test('Property: getUserRooms and getMyHistory return equivalent results', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }),
      async (userId) => {
        const mockRooms = [
          { roomId: 'room-1', userId },
          { roomId: 'room-2', userId }
        ];
        
        const mockRoomDetails = {
          'room-1': { roomId: 'room-1', name: 'Room 1', status: 'WAITING' },
          'room-2': { roomId: 'room-2', name: 'Room 2', status: 'ACTIVE' }
        };
        
        // Mock DynamoDB responses
        mockDynamoClient.send.mockImplementation((command) => {
          if (command.constructor.name === 'QueryCommand') {
            return Promise.resolve({ Items: mockRooms });
          } else if (command.constructor.name === 'GetCommand') {
            const roomId = command.input.Key.roomId;
            return Promise.resolve({ Item: mockRoomDetails[roomId] });
          }
          return Promise.resolve({ Items: [], Item: null });
        });
        
        // Test getUserRooms
        const getUserRoomsEvent = {
          info: { fieldName: 'getUserRooms' },
          identity: { sub: userId },
          arguments: {}
        };
        
        // Test getMyHistory
        const getMyHistoryEvent = {
          info: { fieldName: 'getMyHistory' },
          identity: { sub: userId },
          arguments: {}
        };
        
        const getUserRoomsResult = await handler(getUserRoomsEvent);
        const getMyHistoryResult = await handler(getMyHistoryEvent);
        
        // Results should be equivalent
        expect(getUserRoomsResult).toEqual(getMyHistoryResult);
      }
    ), { numRuns: 5 });
  });

  /**
   * Property: Schema field types match handler return types
   */
  test('Property: Handler returns match schema field types', async () => {
    // Mock successful room creation
    mockDynamoClient.send.mockResolvedValue({
      Items: [],
      Item: null
    });
    
    const event = {
      info: { fieldName: 'createRoom' },
      identity: { sub: 'test-user' },
      arguments: {
        input: {
          name: 'Test Room',
          description: 'Test Description',
          isPrivate: false,
          maxMembers: 10
        }
      }
    };
    
    const result = await handler(event);
    
    // Verify the result matches the Room type from schema
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('hostId');
    expect(result).toHaveProperty('isActive');
    expect(result).toHaveProperty('isPrivate');
    expect(result).toHaveProperty('memberCount');
    expect(result).toHaveProperty('createdAt');
    
    // Verify types
    expect(typeof result.id).toBe('string');
    expect(typeof result.name).toBe('string');
    expect(typeof result.status).toBe('string');
    expect(typeof result.hostId).toBe('string');
    expect(typeof result.isActive).toBe('boolean');
    expect(typeof result.isPrivate).toBe('boolean');
    expect(typeof result.memberCount).toBe('number');
    expect(typeof result.createdAt).toBe('string');
  });
});