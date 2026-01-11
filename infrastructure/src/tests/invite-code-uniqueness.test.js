"use strict";
/**
 * Unit Tests for Invite Code Uniqueness
 * Feature: trinity-voting-fixes
 *
 * Property 6: Invite Code Uniqueness
 * Validates: Requirements 3.1
 *
 * For any set of generated invite codes, all codes should be unique,
 * exactly 6 characters long, and follow the specified format
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock DynamoDB before importing the service
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb', () => {
    const originalModule = jest.requireActual('@aws-sdk/lib-dynamodb');
    return {
        ...originalModule,
        GetCommand: jest.fn(),
        PutCommand: jest.fn(),
        UpdateCommand: jest.fn(),
        QueryCommand: jest.fn(),
        DynamoDBDocumentClient: {
            from: jest.fn(),
        },
    };
});
jest.mock('../utils/metrics');
const deepLinkService_1 = require("../services/deepLinkService");
describe('Invite Code Uniqueness - Unit Tests', () => {
    let mockSend;
    let deepLinkService;
    let mockGetCommand;
    let mockPutCommand;
    let mockUpdateCommand;
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock environment variables
        process.env.INVITE_LINKS_TABLE = 'test-invite-links-table';
        process.env.ROOMS_TABLE = 'test-rooms-table';
        // Create mock send function
        mockSend = jest.fn();
        // Get the mocked command constructors
        const { GetCommand, PutCommand, UpdateCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        mockGetCommand = GetCommand;
        mockPutCommand = PutCommand;
        mockUpdateCommand = UpdateCommand;
        // Mock DynamoDB client and document client
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        DynamoDBClient.mockImplementation(() => ({}));
        const mockDocClient = {
            send: mockSend,
        };
        DynamoDBDocumentClient.from = jest.fn().mockReturnValue(mockDocClient);
        // Create service instance with mocked client
        deepLinkService = new deepLinkService_1.DeepLinkService(mockDocClient);
    });
    describe('Property 6: Invite Code Uniqueness', () => {
        it('should generate unique invite codes for multiple rooms', async () => {
            const roomIds = ['room1', 'room2', 'room3', 'room4', 'room5'];
            const userId = 'test-user';
            const generatedCodes = new Set();
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                // Mock GetCommand for code existence check (always return not found)
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                // Mock PutCommand for storing invite links
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate invite links for all rooms
            const inviteLinks = await Promise.all(roomIds.map(roomId => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes are unique
            inviteLinks.forEach(invite => {
                expect(generatedCodes.has(invite.code)).toBe(false);
                generatedCodes.add(invite.code);
            });
            expect(generatedCodes.size).toBe(roomIds.length);
        });
        it('should generate codes that are exactly 6 characters long', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate multiple invite codes
            const inviteLinks = await Promise.all(Array.from({ length: 10 }, () => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes are exactly 6 characters
            inviteLinks.forEach(invite => {
                expect(invite.code).toHaveLength(6);
            });
        });
        it('should generate codes using only valid characters (A-Z, 0-9)', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            const validChars = /^[A-Z0-9]+$/;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate multiple invite codes
            const inviteLinks = await Promise.all(Array.from({ length: 20 }, () => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes use only valid characters
            inviteLinks.forEach(invite => {
                expect(invite.code).toMatch(validChars);
            });
        });
        it('should handle code collisions by retrying generation', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            let callCount = 0;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations with collision simulation
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    callCount++;
                    // Simulate collision for first 2 attempts, then success
                    if (callCount <= 2) {
                        return Promise.resolve({ Item: { code: 'EXISTING' } });
                    }
                    else {
                        return Promise.resolve({ Item: null });
                    }
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate invite link (should succeed after retries)
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            expect(inviteLink.code).toHaveLength(6);
            expect(callCount).toBeGreaterThan(2); // Should have retried
        });
        it('should create proper URL format for invite links', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            // Verify URL format
            expect(inviteLink.url).toBe(`https://trinity.app/room/${inviteLink.code}`);
            expect(inviteLink.url).toMatch(/^https:\/\/trinity\.app\/room\/[A-Z0-9]{6}$/);
        });
        it('should set proper expiry time for invite links', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            const customExpiryHours = 24;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const beforeGeneration = Date.now();
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId, {
                expiryHours: customExpiryHours,
            });
            const afterGeneration = Date.now();
            const expiryTime = new Date(inviteLink.expiresAt).getTime();
            const expectedMinExpiry = beforeGeneration + (customExpiryHours * 60 * 60 * 1000);
            const expectedMaxExpiry = afterGeneration + (customExpiryHours * 60 * 60 * 1000);
            expect(expiryTime).toBeGreaterThanOrEqual(expectedMinExpiry);
            expect(expiryTime).toBeLessThanOrEqual(expectedMaxExpiry);
        });
        it('should initialize invite links with correct default values', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            // Verify default values
            expect(inviteLink.roomId).toBe(roomId);
            expect(inviteLink.createdBy).toBe(userId);
            expect(inviteLink.isActive).toBe(true);
            expect(inviteLink.usageCount).toBe(0);
            expect(inviteLink.maxUsage).toBeUndefined();
            expect(typeof inviteLink.createdAt).toBe('string');
            expect(new Date(inviteLink.createdAt).getTime()).toBeGreaterThan(0);
        });
    });
    describe('Invite Code Validation', () => {
        it('should validate existing active invite codes', async () => {
            const inviteCode = 'ABC123';
            const roomId = 'test-room';
            // Mock command constructors to capture arguments
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                // Handle different command types
                if (command.constructor.name === 'GetCommand') {
                    const args = command.input || {};
                    const key = args.Key || {};
                    // Check for invite code lookup
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId,
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                    // Check for room lookup
                    if (key.PK === roomId && key.SK === 'ROOM') {
                        return Promise.resolve({
                            Item: {
                                roomId,
                                name: 'Test Room',
                                hostId: 'host-user',
                                status: 'ACTIVE',
                                memberCount: 5,
                                isPrivate: false,
                                createdAt: new Date().toISOString(),
                            }
                        });
                    }
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).not.toBeNull();
            expect(roomInfo?.roomId).toBe(roomId);
            expect(roomInfo?.name).toBe('Test Room');
        });
        it('should reject expired invite codes', async () => {
            const inviteCode = 'EXPIRED';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                }
                // Mock deactivation update
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
        it('should reject inactive invite codes', async () => {
            const inviteCode = 'INACTIVE';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: false,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
        it('should reject codes that have reached usage limit', async () => {
            const inviteCode = 'MAXUSED';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 5,
                                maxUsage: 5, // Reached limit
                            }
                        });
                    }
                }
                // Mock deactivation update
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
    });
    describe('Deep Link URL Parsing', () => {
        it('should extract invite codes from various URL formats', async () => {
            const testCases = [
                { url: 'https://trinity.app/room/ABC123', expected: 'ABC123' },
                { url: 'trinity.app/room/XYZ789', expected: 'XYZ789' },
                { url: '/room/DEF456', expected: 'DEF456' },
                { url: 'GHI789', expected: 'GHI789' },
            ];
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock successful validation for all codes
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    const code = key.PK;
                    if (key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                    if (key.SK === 'ROOM') {
                        return Promise.resolve({
                            Item: {
                                roomId: 'test-room',
                                name: 'Test Room',
                                hostId: 'host-user',
                                status: 'ACTIVE',
                                memberCount: 1,
                                isPrivate: false,
                                createdAt: new Date().toISOString(),
                            }
                        });
                    }
                }
                // Mock usage count increment
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            for (const testCase of testCases) {
                const action = await deepLinkService.handleDeepLink(testCase.url);
                expect(action.type).toBe('JOIN_ROOM');
                expect(action.roomId).toBe('test-room');
                expect(action.metadata?.inviteCode).toBe(testCase.expected);
            }
        });
        it('should reject invalid URL formats', async () => {
            const invalidUrls = [
                'https://example.com/room/ABC123',
                'trinity.app/invalid/ABC123',
                '/invalid/ABC123',
                'TOOLONG123',
                'SHORT',
                '',
            ];
            for (const url of invalidUrls) {
                const action = await deepLinkService.handleDeepLink(url);
                expect(action.type).toBe('ERROR');
                expect(action.errorMessage).toContain('Invalid invite link format');
            }
        });
    });
    describe('Invite Link Management', () => {
        it('should deactivate invite codes', async () => {
            const inviteCode = 'DEACTIVATE';
            // Mock command constructors
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockResolvedValue({});
            await deepLinkService.deactivateInviteCode(inviteCode);
            // Verify UpdateCommand was called
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                constructor: expect.objectContaining({
                    name: 'UpdateCommand'
                })
            }));
        });
        it('should get invite statistics', async () => {
            const inviteCode = 'STATS123';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({
                        Item: {
                            code: inviteCode,
                            usageCount: 3,
                            maxUsage: 10,
                            isActive: true,
                            expiresAt: '2024-12-31T23:59:59.999Z',
                            createdAt: '2024-01-01T00:00:00.000Z',
                        }
                    });
                }
                return Promise.resolve({ Item: null });
            });
            const stats = await deepLinkService.getInviteStats(inviteCode);
            expect(stats).not.toBeNull();
            expect(stats?.code).toBe(inviteCode);
            expect(stats?.usageCount).toBe(3);
            expect(stats?.maxUsage).toBe(10);
            expect(stats?.isActive).toBe(true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW52aXRlLWNvZGUtdW5pcXVlbmVzcy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW52aXRlLWNvZGUtdW5pcXVlbmVzcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7O0dBU0c7O0FBRUgsNkNBQTZDO0FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUN0QyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDbkUsT0FBTztRQUNMLEdBQUcsY0FBYztRQUNqQixVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUNyQixVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUNyQixhQUFhLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUN4QixZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUN2QixzQkFBc0IsRUFBRTtZQUN0QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtTQUNoQjtLQUNGLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUNILElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUU5QixpRUFBOEQ7QUFFOUQsUUFBUSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtJQUNuRCxJQUFJLFFBQW1CLENBQUM7SUFDeEIsSUFBSSxlQUFnQyxDQUFDO0lBQ3JDLElBQUksY0FBeUIsQ0FBQztJQUM5QixJQUFJLGNBQXlCLENBQUM7SUFDOUIsSUFBSSxpQkFBNEIsQ0FBQztJQUVqQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXJCLDZCQUE2QjtRQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixHQUFHLHlCQUF5QixDQUFD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LENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDekMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLEtBQUssR0FBRyxNQUFNLGVBQWUsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFL0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM3QixNQUFNLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVW5pdCBUZXN0cyBmb3IgSW52aXRlIENvZGUgVW5pcXVlbmVzc1xyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlc1xyXG4gKiBcclxuICogUHJvcGVydHkgNjogSW52aXRlIENvZGUgVW5pcXVlbmVzc1xyXG4gKiBWYWxpZGF0ZXM6IFJlcXVpcmVtZW50cyAzLjFcclxuICogXHJcbiAqIEZvciBhbnkgc2V0IG9mIGdlbmVyYXRlZCBpbnZpdGUgY29kZXMsIGFsbCBjb2RlcyBzaG91bGQgYmUgdW5pcXVlLCBcclxuICogZXhhY3RseSA2IGNoYXJhY3RlcnMgbG9uZywgYW5kIGZvbGxvdyB0aGUgc3BlY2lmaWVkIGZvcm1hdFxyXG4gKi9cclxuXHJcbi8vIE1vY2sgRHluYW1vREIgYmVmb3JlIGltcG9ydGluZyB0aGUgc2VydmljZVxyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicsICgpID0+IHtcclxuICBjb25zdCBvcmlnaW5hbE1vZHVsZSA9IGplc3QucmVxdWlyZUFjdHVhbCgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgcmV0dXJuIHtcclxuICAgIC4uLm9yaWdpbmFsTW9kdWxlLFxyXG4gICAgR2V0Q29tbWFuZDogamVzdC5mbigpLFxyXG4gICAgUHV0Q29tbWFuZDogamVzdC5mbigpLFxyXG4gICAgVXBkYXRlQ29tbWFuZDogamVzdC5mbigpLFxyXG4gICAgUXVlcnlDb21tYW5kOiBqZXN0LmZuKCksXHJcbiAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50OiB7XHJcbiAgICAgIGZyb206IGplc3QuZm4oKSxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbmplc3QubW9jaygnLi4vdXRpbHMvbWV0cmljcycpO1xyXG5cclxuaW1wb3J0IHsgRGVlcExpbmtTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZGVlcExpbmtTZXJ2aWNlJztcclxuXHJcbmRlc2NyaWJlKCdJbnZpdGUgQ29kZSBVbmlxdWVuZXNzIC0gVW5pdCBUZXN0cycsICgpID0+IHtcclxuICBsZXQgbW9ja1NlbmQ6IGplc3QuTW9jaztcclxuICBsZXQgZGVlcExpbmtTZXJ2aWNlOiBEZWVwTGlua1NlcnZpY2U7XHJcbiAgbGV0IG1vY2tHZXRDb21tYW5kOiBqZXN0Lk1vY2s7XHJcbiAgbGV0IG1vY2tQdXRDb21tYW5kOiBqZXN0Lk1vY2s7XHJcbiAgbGV0IG1vY2tVcGRhdGVDb21tYW5kOiBqZXN0Lk1vY2s7XHJcblxyXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xyXG4gICAgamVzdC5jbGVhckFsbE1vY2tzKCk7XHJcbiAgICBcclxuICAgIC8vIE1vY2sgZW52aXJvbm1lbnQgdmFyaWFibGVzXHJcbiAgICBwcm9jZXNzLmVudi5JTlZJVEVfTElOS1NfVEFCTEUgPSAndGVzdC1pbnZpdGUtbGlua3MtdGFibGUnO1xyXG4gICAgcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUgPSAndGVzdC1yb29tcy10YWJsZSc7XHJcblxyXG4gICAgLy8gQ3JlYXRlIG1vY2sgc2VuZCBmdW5jdGlvblxyXG4gICAgbW9ja1NlbmQgPSBqZXN0LmZuKCk7XHJcblxyXG4gICAgLy8gR2V0IHRoZSBtb2NrZWQgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgIGNvbnN0IHsgR2V0Q29tbWFuZCwgUHV0Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCwgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICBtb2NrR2V0Q29tbWFuZCA9IEdldENvbW1hbmQgYXMgamVzdC5Nb2NrO1xyXG4gICAgbW9ja1B1dENvbW1hbmQgPSBQdXRDb21tYW5kIGFzIGplc3QuTW9jaztcclxuICAgIG1vY2tVcGRhdGVDb21tYW5kID0gVXBkYXRlQ29tbWFuZCBhcyBqZXN0Lk1vY2s7XHJcblxyXG4gICAgLy8gTW9jayBEeW5hbW9EQiBjbGllbnQgYW5kIGRvY3VtZW50IGNsaWVudFxyXG4gICAgY29uc3QgeyBEeW5hbW9EQkNsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyk7XHJcbiAgICBcclxuICAgIER5bmFtb0RCQ2xpZW50Lm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiAoe30pKTtcclxuICAgIGNvbnN0IG1vY2tEb2NDbGllbnQgPSB7XHJcbiAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgfTtcclxuICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUobW9ja0RvY0NsaWVudCk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIHNlcnZpY2UgaW5zdGFuY2Ugd2l0aCBtb2NrZWQgY2xpZW50XHJcbiAgICBkZWVwTGlua1NlcnZpY2UgPSBuZXcgRGVlcExpbmtTZXJ2aWNlKG1vY2tEb2NDbGllbnQgYXMgYW55KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ1Byb3BlcnR5IDY6IEludml0ZSBDb2RlIFVuaXF1ZW5lc3MnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGdlbmVyYXRlIHVuaXF1ZSBpbnZpdGUgY29kZXMgZm9yIG11bHRpcGxlIHJvb21zJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWRzID0gWydyb29tMScsICdyb29tMicsICdyb29tMycsICdyb29tNCcsICdyb29tNSddO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuICAgICAgY29uc3QgZ2VuZXJhdGVkQ29kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrUHV0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1B1dENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICAvLyBNb2NrIEdldENvbW1hbmQgZm9yIGNvZGUgZXhpc3RlbmNlIGNoZWNrIChhbHdheXMgcmV0dXJuIG5vdCBmb3VuZClcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBNb2NrIFB1dENvbW1hbmQgZm9yIHN0b3JpbmcgaW52aXRlIGxpbmtzXHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1B1dENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR2VuZXJhdGUgaW52aXRlIGxpbmtzIGZvciBhbGwgcm9vbXNcclxuICAgICAgY29uc3QgaW52aXRlTGlua3MgPSBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgICByb29tSWRzLm1hcChyb29tSWQgPT4gZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIHVzZXJJZCkpXHJcbiAgICAgICk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgYWxsIGNvZGVzIGFyZSB1bmlxdWVcclxuICAgICAgaW52aXRlTGlua3MuZm9yRWFjaChpbnZpdGUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChnZW5lcmF0ZWRDb2Rlcy5oYXMoaW52aXRlLmNvZGUpKS50b0JlKGZhbHNlKTtcclxuICAgICAgICBnZW5lcmF0ZWRDb2Rlcy5hZGQoaW52aXRlLmNvZGUpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGV4cGVjdChnZW5lcmF0ZWRDb2Rlcy5zaXplKS50b0JlKHJvb21JZHMubGVuZ3RoKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgZ2VuZXJhdGUgY29kZXMgdGhhdCBhcmUgZXhhY3RseSA2IGNoYXJhY3RlcnMgbG9uZycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbSc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXInO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tQdXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnUHV0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdQdXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEdlbmVyYXRlIG11bHRpcGxlIGludml0ZSBjb2Rlc1xyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rcyA9IGF3YWl0IFByb21pc2UuYWxsKFxyXG4gICAgICAgIEFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sICgpID0+IFxyXG4gICAgICAgICAgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIHVzZXJJZClcclxuICAgICAgICApXHJcbiAgICAgICk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgYWxsIGNvZGVzIGFyZSBleGFjdGx5IDYgY2hhcmFjdGVyc1xyXG4gICAgICBpbnZpdGVMaW5rcy5mb3JFYWNoKGludml0ZSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KGludml0ZS5jb2RlKS50b0hhdmVMZW5ndGgoNik7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBnZW5lcmF0ZSBjb2RlcyB1c2luZyBvbmx5IHZhbGlkIGNoYXJhY3RlcnMgKEEtWiwgMC05KScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbSc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXInO1xyXG4gICAgICBjb25zdCB2YWxpZENoYXJzID0gL15bQS1aMC05XSskLztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrUHV0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1B1dENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnUHV0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBHZW5lcmF0ZSBtdWx0aXBsZSBpbnZpdGUgY29kZXNcclxuICAgICAgY29uc3QgaW52aXRlTGlua3MgPSBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyMCB9LCAoKSA9PiBcclxuICAgICAgICAgIGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQpXHJcbiAgICAgICAgKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCBjb2RlcyB1c2Ugb25seSB2YWxpZCBjaGFyYWN0ZXJzXHJcbiAgICAgIGludml0ZUxpbmtzLmZvckVhY2goaW52aXRlID0+IHtcclxuICAgICAgICBleHBlY3QoaW52aXRlLmNvZGUpLnRvTWF0Y2godmFsaWRDaGFycyk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29kZSBjb2xsaXNpb25zIGJ5IHJldHJ5aW5nIGdlbmVyYXRpb24nLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuICAgICAgbGV0IGNhbGxDb3VudCA9IDA7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnMgd2l0aCBjb2xsaXNpb24gc2ltdWxhdGlvblxyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIGNhbGxDb3VudCsrO1xyXG4gICAgICAgICAgLy8gU2ltdWxhdGUgY29sbGlzaW9uIGZvciBmaXJzdCAyIGF0dGVtcHRzLCB0aGVuIHN1Y2Nlc3NcclxuICAgICAgICAgIGlmIChjYWxsQ291bnQgPD0gMikge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogeyBjb2RlOiAnRVhJU1RJTkcnIH0gfSk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1B1dENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR2VuZXJhdGUgaW52aXRlIGxpbmsgKHNob3VsZCBzdWNjZWVkIGFmdGVyIHJldHJpZXMpXHJcbiAgICAgIGNvbnN0IGludml0ZUxpbmsgPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuZ2VuZXJhdGVJbnZpdGVMaW5rKHJvb21JZCwgdXNlcklkKTtcclxuXHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLmNvZGUpLnRvSGF2ZUxlbmd0aCg2KTtcclxuICAgICAgZXhwZWN0KGNhbGxDb3VudCkudG9CZUdyZWF0ZXJUaGFuKDIpOyAvLyBTaG91bGQgaGF2ZSByZXRyaWVkXHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBwcm9wZXIgVVJMIGZvcm1hdCBmb3IgaW52aXRlIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tJztcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlcic7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1B1dENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgaW52aXRlTGluayA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IFVSTCBmb3JtYXRcclxuICAgICAgZXhwZWN0KGludml0ZUxpbmsudXJsKS50b0JlKGBodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vJHtpbnZpdGVMaW5rLmNvZGV9YCk7XHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLnVybCkudG9NYXRjaCgvXmh0dHBzOlxcL1xcL3RyaW5pdHlcXC5hcHBcXC9yb29tXFwvW0EtWjAtOV17Nn0kLyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHNldCBwcm9wZXIgZXhwaXJ5IHRpbWUgZm9yIGludml0ZSBsaW5rcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbSc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXInO1xyXG4gICAgICBjb25zdCBjdXN0b21FeHBpcnlIb3VycyA9IDI0O1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tQdXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnUHV0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdQdXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IGJlZm9yZUdlbmVyYXRpb24gPSBEYXRlLm5vdygpO1xyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICAgIGV4cGlyeUhvdXJzOiBjdXN0b21FeHBpcnlIb3VycyxcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnN0IGFmdGVyR2VuZXJhdGlvbiA9IERhdGUubm93KCk7XHJcblxyXG4gICAgICBjb25zdCBleHBpcnlUaW1lID0gbmV3IERhdGUoaW52aXRlTGluay5leHBpcmVzQXQpLmdldFRpbWUoKTtcclxuICAgICAgY29uc3QgZXhwZWN0ZWRNaW5FeHBpcnkgPSBiZWZvcmVHZW5lcmF0aW9uICsgKGN1c3RvbUV4cGlyeUhvdXJzICogNjAgKiA2MCAqIDEwMDApO1xyXG4gICAgICBjb25zdCBleHBlY3RlZE1heEV4cGlyeSA9IGFmdGVyR2VuZXJhdGlvbiArIChjdXN0b21FeHBpcnlIb3VycyAqIDYwICogNjAgKiAxMDAwKTtcclxuXHJcbiAgICAgIGV4cGVjdChleHBpcnlUaW1lKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKGV4cGVjdGVkTWluRXhwaXJ5KTtcclxuICAgICAgZXhwZWN0KGV4cGlyeVRpbWUpLnRvQmVMZXNzVGhhbk9yRXF1YWwoZXhwZWN0ZWRNYXhFeHBpcnkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBpbml0aWFsaXplIGludml0ZSBsaW5rcyB3aXRoIGNvcnJlY3QgZGVmYXVsdCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrUHV0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1B1dENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnUHV0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIHVzZXJJZCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgZGVmYXVsdCB2YWx1ZXNcclxuICAgICAgZXhwZWN0KGludml0ZUxpbmsucm9vbUlkKS50b0JlKHJvb21JZCk7XHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLmNyZWF0ZWRCeSkudG9CZSh1c2VySWQpO1xyXG4gICAgICBleHBlY3QoaW52aXRlTGluay5pc0FjdGl2ZSkudG9CZSh0cnVlKTtcclxuICAgICAgZXhwZWN0KGludml0ZUxpbmsudXNhZ2VDb3VudCkudG9CZSgwKTtcclxuICAgICAgZXhwZWN0KGludml0ZUxpbmsubWF4VXNhZ2UpLnRvQmVVbmRlZmluZWQoKTtcclxuICAgICAgZXhwZWN0KHR5cGVvZiBpbnZpdGVMaW5rLmNyZWF0ZWRBdCkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgIGV4cGVjdChuZXcgRGF0ZShpbnZpdGVMaW5rLmNyZWF0ZWRBdCkuZ2V0VGltZSgpKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0ludml0ZSBDb2RlIFZhbGlkYXRpb24nLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIHZhbGlkYXRlIGV4aXN0aW5nIGFjdGl2ZSBpbnZpdGUgY29kZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnQUJDMTIzJztcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbSc7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzIHRvIGNhcHR1cmUgYXJndW1lbnRzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgLy8gSGFuZGxlIGRpZmZlcmVudCBjb21tYW5kIHR5cGVzXHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICBjb25zdCBhcmdzID0gY29tbWFuZC5pbnB1dCB8fCB7fTtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGFyZ3MuS2V5IHx8IHt9O1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBDaGVjayBmb3IgaW52aXRlIGNvZGUgbG9va3VwXHJcbiAgICAgICAgICBpZiAoa2V5LlBLID09PSBpbnZpdGVDb2RlICYmIGtleS5TSyA9PT0gJ0lOVklURScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgICAgY29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIHJvb20gbG9va3VwXHJcbiAgICAgICAgICBpZiAoa2V5LlBLID09PSByb29tSWQgJiYga2V5LlNLID09PSAnUk9PTScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgICAgICAgICAgbmFtZTogJ1Rlc3QgUm9vbScsXHJcbiAgICAgICAgICAgICAgICBob3N0SWQ6ICdob3N0LXVzZXInLFxyXG4gICAgICAgICAgICAgICAgc3RhdHVzOiAnQUNUSVZFJyxcclxuICAgICAgICAgICAgICAgIG1lbWJlckNvdW50OiA1LFxyXG4gICAgICAgICAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJvb21JbmZvID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLnZhbGlkYXRlSW52aXRlQ29kZShpbnZpdGVDb2RlKTtcclxuXHJcbiAgICAgIGV4cGVjdChyb29tSW5mbykubm90LnRvQmVOdWxsKCk7XHJcbiAgICAgIGV4cGVjdChyb29tSW5mbz8ucm9vbUlkKS50b0JlKHJvb21JZCk7XHJcbiAgICAgIGV4cGVjdChyb29tSW5mbz8ubmFtZSkudG9CZSgnVGVzdCBSb29tJyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHJlamVjdCBleHBpcmVkIGludml0ZSBjb2RlcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdFWFBJUkVEJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrVXBkYXRlQ29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1VwZGF0ZUNvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGNvbW1hbmQuaW5wdXQ/LktleSB8fCB7fTtcclxuICAgICAgICAgIGlmIChrZXkuUEsgPT09IGludml0ZUNvZGUgJiYga2V5LlNLID09PSAnSU5WSVRFJykge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tJyxcclxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSwgLy8gRXhwaXJlZFxyXG4gICAgICAgICAgICAgICAgdXNhZ2VDb3VudDogMCxcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBNb2NrIGRlYWN0aXZhdGlvbiB1cGRhdGVcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVXBkYXRlQ29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS52YWxpZGF0ZUludml0ZUNvZGUoaW52aXRlQ29kZSk7XHJcblxyXG4gICAgICBleHBlY3Qocm9vbUluZm8pLnRvQmVOdWxsKCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHJlamVjdCBpbmFjdGl2ZSBpbnZpdGUgY29kZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnSU5BQ1RJVkUnO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGNvbW1hbmQuaW5wdXQ/LktleSB8fCB7fTtcclxuICAgICAgICAgIGlmIChrZXkuUEsgPT09IGludml0ZUNvZGUgJiYga2V5LlNLID09PSAnSU5WSVRFJykge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tJyxcclxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSwgLy8gSW5hY3RpdmVcclxuICAgICAgICAgICAgICAgIGV4cGlyZXNBdDogbmV3IERhdGUoRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICB1c2FnZUNvdW50OiAwLFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJvb21JbmZvID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLnZhbGlkYXRlSW52aXRlQ29kZShpbnZpdGVDb2RlKTtcclxuXHJcbiAgICAgIGV4cGVjdChyb29tSW5mbykudG9CZU51bGwoKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgcmVqZWN0IGNvZGVzIHRoYXQgaGF2ZSByZWFjaGVkIHVzYWdlIGxpbWl0JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ01BWFVTRUQnO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tVcGRhdGVDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnVXBkYXRlQ29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgY29uc3Qga2V5ID0gY29tbWFuZC5pbnB1dD8uS2V5IHx8IHt9O1xyXG4gICAgICAgICAgaWYgKGtleS5QSyA9PT0gaW52aXRlQ29kZSAmJiBrZXkuU0sgPT09ICdJTlZJVEUnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgICAgICByb29tSWQ6ICd0ZXN0LXJvb20nLFxyXG4gICAgICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgdXNhZ2VDb3VudDogNSxcclxuICAgICAgICAgICAgICAgIG1heFVzYWdlOiA1LCAvLyBSZWFjaGVkIGxpbWl0XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gTW9jayBkZWFjdGl2YXRpb24gdXBkYXRlXHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VwZGF0ZUNvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgcm9vbUluZm8gPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UudmFsaWRhdGVJbnZpdGVDb2RlKGludml0ZUNvZGUpO1xyXG5cclxuICAgICAgZXhwZWN0KHJvb21JbmZvKS50b0JlTnVsbCgpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdEZWVwIExpbmsgVVJMIFBhcnNpbmcnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGV4dHJhY3QgaW52aXRlIGNvZGVzIGZyb20gdmFyaW91cyBVUkwgZm9ybWF0cycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgdGVzdENhc2VzID0gW1xyXG4gICAgICAgIHsgdXJsOiAnaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tL0FCQzEyMycsIGV4cGVjdGVkOiAnQUJDMTIzJyB9LFxyXG4gICAgICAgIHsgdXJsOiAndHJpbml0eS5hcHAvcm9vbS9YWVo3ODknLCBleHBlY3RlZDogJ1hZWjc4OScgfSxcclxuICAgICAgICB7IHVybDogJy9yb29tL0RFRjQ1NicsIGV4cGVjdGVkOiAnREVGNDU2JyB9LFxyXG4gICAgICAgIHsgdXJsOiAnR0hJNzg5JywgZXhwZWN0ZWQ6ICdHSEk3ODknIH0sXHJcbiAgICAgIF07XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1VwZGF0ZUNvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdVcGRhdGVDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgdmFsaWRhdGlvbiBmb3IgYWxsIGNvZGVzXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgY29uc3Qga2V5ID0gY29tbWFuZC5pbnB1dD8uS2V5IHx8IHt9O1xyXG4gICAgICAgICAgY29uc3QgY29kZSA9IGtleS5QSztcclxuICAgICAgICAgIGlmIChrZXkuU0sgPT09ICdJTlZJVEUnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICAgIGNvZGUsXHJcbiAgICAgICAgICAgICAgICByb29tSWQ6ICd0ZXN0LXJvb20nLFxyXG4gICAgICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgdXNhZ2VDb3VudDogMCxcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGtleS5TSyA9PT0gJ1JPT00nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbScsXHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnVGVzdCBSb29tJyxcclxuICAgICAgICAgICAgICAgIGhvc3RJZDogJ2hvc3QtdXNlcicsXHJcbiAgICAgICAgICAgICAgICBzdGF0dXM6ICdBQ1RJVkUnLFxyXG4gICAgICAgICAgICAgICAgbWVtYmVyQ291bnQ6IDEsXHJcbiAgICAgICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gTW9jayB1c2FnZSBjb3VudCBpbmNyZW1lbnRcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnVXBkYXRlQ29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IHRlc3RDYXNlIG9mIHRlc3RDYXNlcykge1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbiA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5oYW5kbGVEZWVwTGluayh0ZXN0Q2FzZS51cmwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGV4cGVjdChhY3Rpb24udHlwZSkudG9CZSgnSk9JTl9ST09NJyk7XHJcbiAgICAgICAgZXhwZWN0KGFjdGlvbi5yb29tSWQpLnRvQmUoJ3Rlc3Qtcm9vbScpO1xyXG4gICAgICAgIGV4cGVjdChhY3Rpb24ubWV0YWRhdGE/Lmludml0ZUNvZGUpLnRvQmUodGVzdENhc2UuZXhwZWN0ZWQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHJlamVjdCBpbnZhbGlkIFVSTCBmb3JtYXRzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZhbGlkVXJscyA9IFtcclxuICAgICAgICAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yb29tL0FCQzEyMycsXHJcbiAgICAgICAgJ3RyaW5pdHkuYXBwL2ludmFsaWQvQUJDMTIzJyxcclxuICAgICAgICAnL2ludmFsaWQvQUJDMTIzJyxcclxuICAgICAgICAnVE9PTE9ORzEyMycsXHJcbiAgICAgICAgJ1NIT1JUJyxcclxuICAgICAgICAnJyxcclxuICAgICAgXTtcclxuXHJcbiAgICAgIGZvciAoY29uc3QgdXJsIG9mIGludmFsaWRVcmxzKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aW9uID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmhhbmRsZURlZXBMaW5rKHVybCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZXhwZWN0KGFjdGlvbi50eXBlKS50b0JlKCdFUlJPUicpO1xyXG4gICAgICAgIGV4cGVjdChhY3Rpb24uZXJyb3JNZXNzYWdlKS50b0NvbnRhaW4oJ0ludmFsaWQgaW52aXRlIGxpbmsgZm9ybWF0Jyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBkZXNjcmliZSgnSW52aXRlIExpbmsgTWFuYWdlbWVudCcsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgZGVhY3RpdmF0ZSBpbnZpdGUgY29kZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnREVBQ1RJVkFURSc7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tVcGRhdGVDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnVXBkYXRlQ29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tSZXNvbHZlZFZhbHVlKHt9KTtcclxuXHJcbiAgICAgIGF3YWl0IGRlZXBMaW5rU2VydmljZS5kZWFjdGl2YXRlSW52aXRlQ29kZShpbnZpdGVDb2RlKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBVcGRhdGVDb21tYW5kIHdhcyBjYWxsZWRcclxuICAgICAgZXhwZWN0KG1vY2tTZW5kKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XHJcbiAgICAgICAgICBjb25zdHJ1Y3RvcjogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgICBuYW1lOiAnVXBkYXRlQ29tbWFuZCdcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgZ2V0IGludml0ZSBzdGF0aXN0aWNzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ1NUQVRTMTIzJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgICAgdXNhZ2VDb3VudDogMyxcclxuICAgICAgICAgICAgICBtYXhVc2FnZTogMTAsXHJcbiAgICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgICAgZXhwaXJlc0F0OiAnMjAyNC0xMi0zMVQyMzo1OTo1OS45OTlaJyxcclxuICAgICAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuZ2V0SW52aXRlU3RhdHMoaW52aXRlQ29kZSk7XHJcblxyXG4gICAgICBleHBlY3Qoc3RhdHMpLm5vdC50b0JlTnVsbCgpO1xyXG4gICAgICBleHBlY3Qoc3RhdHM/LmNvZGUpLnRvQmUoaW52aXRlQ29kZSk7XHJcbiAgICAgIGV4cGVjdChzdGF0cz8udXNhZ2VDb3VudCkudG9CZSgzKTtcclxuICAgICAgZXhwZWN0KHN0YXRzPy5tYXhVc2FnZSkudG9CZSgxMCk7XHJcbiAgICAgIGV4cGVjdChzdGF0cz8uaXNBY3RpdmUpLnRvQmUodHJ1ZSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxufSk7Il19