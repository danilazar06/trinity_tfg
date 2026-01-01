/**
 * Unit tests for GraphQL Schema Field Existence
 * Tests that getUserRooms field exists in schema and Room type is properly defined
 * Requirements: 1.1, 1.4, 1.5
 */

const fs = require('fs');
const path = require('path');

describe('GraphQL Schema Field Existence', () => {
  let schemaContent;

  beforeAll(() => {
    // Read the GraphQL schema file
    const schemaPath = path.join(__dirname, '..', 'schema.graphql');
    schemaContent = fs.readFileSync(schemaPath, 'utf8');
  });

  describe('Query Type Fields', () => {
    test('should include getUserRooms field in Query type', () => {
      // Test that getUserRooms field exists in the schema
      expect(schemaContent).toContain('getUserRooms: [Room]');
    });

    test('should include getMyHistory field in Query type', () => {
      // Test that getMyHistory field also exists (for backward compatibility)
      expect(schemaContent).toContain('getMyHistory: [Room]');
    });

    test('should include getRoom field in Query type', () => {
      // Test that getRoom field exists
      expect(schemaContent).toContain('getRoom(roomId: ID!): Room');
    });
  });

  describe('Room Type Definition', () => {
    test('should define Room type with all required fields', () => {
      // Test that Room type is properly defined
      expect(schemaContent).toContain('type Room {');
      
      // Test required fields
      expect(schemaContent).toContain('id: ID!');
      expect(schemaContent).toContain('name: String!');
      expect(schemaContent).toContain('status: String!');
      expect(schemaContent).toContain('hostId: String!');
      expect(schemaContent).toContain('isActive: Boolean!');
      expect(schemaContent).toContain('isPrivate: Boolean!');
      expect(schemaContent).toContain('memberCount: Int!');
      expect(schemaContent).toContain('createdAt: AWSDateTime!');
    });

    test('should define Room type with optional fields', () => {
      // Test optional fields
      expect(schemaContent).toContain('description: String');
      expect(schemaContent).toContain('resultMovieId: String');
      expect(schemaContent).toContain('inviteCode: String');
      expect(schemaContent).toContain('maxMembers: Int');
      expect(schemaContent).toContain('updatedAt: AWSDateTime');
    });
  });

  describe('Schema Structure Validation', () => {
    test('should have valid GraphQL schema structure', () => {
      // Test that schema has the main sections
      expect(schemaContent).toContain('type Query {');
      expect(schemaContent).toContain('type Mutation {');
      expect(schemaContent).toContain('type Subscription {');
      expect(schemaContent).toContain('schema {');
    });

    test('should include proper DataSource comments for getUserRooms', () => {
      // Test that getUserRooms has proper DataSource comment
      expect(schemaContent).toContain('getUserRooms: [Room]                        # DataSource: RoomHandler');
    });
  });

  describe('Schema Syntax Validation', () => {
    test('should not have syntax errors in schema definition', () => {
      // Basic syntax checks
      const openBraces = (schemaContent.match(/{/g) || []).length;
      const closeBraces = (schemaContent.match(/}/g) || []).length;
      
      expect(openBraces).toBe(closeBraces);
    });

    test('should have proper field definitions with correct syntax', () => {
      // Test that field definitions follow GraphQL syntax
      const fieldPattern = /\w+(\([^)]*\))?\s*:\s*\[?\w+!?\]?/g;
      const matches = schemaContent.match(fieldPattern);
      
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});