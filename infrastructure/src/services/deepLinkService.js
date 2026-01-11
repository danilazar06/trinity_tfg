"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepLinkService = exports.DeepLinkService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const metrics_1 = require("../utils/metrics");
/**
 * Deep Link Service
 * Handles invite code generation, validation, and deep link routing
 */
class DeepLinkService {
    constructor(docClient) {
        this.INVITE_CODE_LENGTH = 6;
        this.DEFAULT_EXPIRY_HOURS = 168; // 7 days
        this.MAX_GENERATION_ATTEMPTS = 10;
        this.BASE_URL = 'https://trinity.app';
        if (docClient) {
            this.docClient = docClient;
        }
        else {
            const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
            this.docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
        }
    }
    /**
     * Generate a unique invite link for a room
     */
    async generateInviteLink(roomId, createdBy, options) {
        const timer = new metrics_1.PerformanceTimer('GenerateInviteLink');
        console.log(`🔗 Generating invite link for room ${roomId} by user ${createdBy}`);
        try {
            // Generate unique invite code
            const inviteCode = await this.generateUniqueInviteCode();
            // Calculate expiry time
            const expiryHours = options?.expiryHours || this.DEFAULT_EXPIRY_HOURS;
            const expiresAt = new Date(Date.now() + (expiryHours * 60 * 60 * 1000)).toISOString();
            // Create invite link object
            const inviteLink = {
                code: inviteCode,
                url: `${this.BASE_URL}/room/${inviteCode}`,
                roomId,
                createdBy,
                createdAt: new Date().toISOString(),
                expiresAt,
                isActive: true,
                usageCount: 0,
                maxUsage: options?.maxUsage,
            };
            // Store in DynamoDB
            await this.docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Item: {
                    PK: inviteCode,
                    SK: 'INVITE',
                    ...inviteLink,
                },
                ConditionExpression: 'attribute_not_exists(PK)', // Ensure uniqueness
            }));
            // Also create a reverse lookup by roomId for management
            await this.docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Item: {
                    PK: roomId,
                    SK: `INVITE#${inviteCode}`,
                    inviteCode,
                    createdAt: inviteLink.createdAt,
                    expiresAt: inviteLink.expiresAt,
                    isActive: true,
                },
            }));
            // Log business metric
            (0, metrics_1.logBusinessMetric)('INVITE_LINK_CREATED', roomId, createdBy, {
                inviteCode,
                expiryHours,
                maxUsage: options?.maxUsage,
            });
            console.log(`✅ Invite link generated: ${inviteLink.url} (expires: ${expiresAt})`);
            timer.finish(true, undefined, { inviteCode, roomId });
            return inviteLink;
        }
        catch (error) {
            (0, metrics_1.logError)('GenerateInviteLink', error, { roomId, createdBy });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Validate an invite code and return room information
     */
    async validateInviteCode(code) {
        const timer = new metrics_1.PerformanceTimer('ValidateInviteCode');
        console.log(`🔍 Validating invite code: ${code}`);
        try {
            // Get invite link from DynamoDB
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Key: { PK: code, SK: 'INVITE' },
            }));
            if (!response.Item) {
                console.log(`❌ Invite code not found: ${code}`);
                timer.finish(true, undefined, { result: 'not_found' });
                return null;
            }
            const inviteLink = response.Item;
            // Check if invite is active
            if (!inviteLink.isActive) {
                console.log(`❌ Invite code is inactive: ${code}`);
                timer.finish(true, undefined, { result: 'inactive' });
                return null;
            }
            // Check if invite has expired
            const now = new Date();
            const expiryDate = new Date(inviteLink.expiresAt);
            if (now > expiryDate) {
                console.log(`❌ Invite code has expired: ${code} (expired: ${inviteLink.expiresAt})`);
                // Mark as inactive
                await this.deactivateInviteCode(code);
                timer.finish(true, undefined, { result: 'expired' });
                return null;
            }
            // Check usage limits
            if (inviteLink.maxUsage && inviteLink.usageCount >= inviteLink.maxUsage) {
                console.log(`❌ Invite code usage limit reached: ${code} (${inviteLink.usageCount}/${inviteLink.maxUsage})`);
                // Mark as inactive
                await this.deactivateInviteCode(code);
                timer.finish(true, undefined, { result: 'usage_limit_reached' });
                return null;
            }
            // Get room information
            const roomInfo = await this.getRoomInfo(inviteLink.roomId);
            if (!roomInfo) {
                console.log(`❌ Room not found for invite code: ${code} (roomId: ${inviteLink.roomId})`);
                timer.finish(true, undefined, { result: 'room_not_found' });
                return null;
            }
            console.log(`✅ Invite code validated: ${code} -> Room: ${roomInfo.name}`);
            timer.finish(true, undefined, { result: 'valid', roomId: roomInfo.roomId });
            return roomInfo;
        }
        catch (error) {
            (0, metrics_1.logError)('ValidateInviteCode', error, { code });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Handle deep link URL and return appropriate action
     */
    async handleDeepLink(url) {
        const timer = new metrics_1.PerformanceTimer('HandleDeepLink');
        console.log(`🔗 Handling deep link: ${url}`);
        try {
            // Parse URL to extract invite code
            const inviteCode = this.extractInviteCodeFromUrl(url);
            if (!inviteCode) {
                console.log(`❌ Invalid deep link format: ${url}`);
                timer.finish(true, undefined, { result: 'invalid_format' });
                return {
                    type: 'ERROR',
                    errorMessage: 'Invalid invite link format',
                };
            }
            // Validate invite code
            const roomInfo = await this.validateInviteCode(inviteCode);
            if (!roomInfo) {
                console.log(`❌ Invalid or expired invite code: ${inviteCode}`);
                timer.finish(true, undefined, { result: 'invalid_code' });
                return {
                    type: 'INVALID_CODE',
                    errorMessage: 'This invite link is invalid or has expired',
                };
            }
            // Check room status
            if (roomInfo.status === 'COMPLETED' || roomInfo.status === 'INACTIVE') {
                console.log(`❌ Room is not available: ${roomInfo.roomId} (status: ${roomInfo.status})`);
                timer.finish(true, undefined, { result: 'room_unavailable' });
                return {
                    type: 'INVALID_CODE',
                    errorMessage: 'This room is no longer available',
                };
            }
            // Increment usage count
            await this.incrementUsageCount(inviteCode);
            console.log(`✅ Deep link handled successfully: ${inviteCode} -> ${roomInfo.roomId}`);
            timer.finish(true, undefined, { result: 'success', roomId: roomInfo.roomId });
            return {
                type: 'JOIN_ROOM',
                roomId: roomInfo.roomId,
                metadata: {
                    roomName: roomInfo.name,
                    hostId: roomInfo.hostId,
                    memberCount: roomInfo.memberCount,
                    inviteCode,
                },
            };
        }
        catch (error) {
            (0, metrics_1.logError)('HandleDeepLink', error, { url });
            timer.finish(false, error.name);
            return {
                type: 'ERROR',
                errorMessage: 'An error occurred while processing the invite link',
            };
        }
    }
    /**
     * Get all active invite links for a room
     */
    async getRoomInviteLinks(roomId) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                KeyConditionExpression: 'PK = :roomId AND begins_with(SK, :invitePrefix)',
                ExpressionAttributeValues: {
                    ':roomId': roomId,
                    ':invitePrefix': 'INVITE#',
                },
            }));
            if (!response.Items || response.Items.length === 0) {
                return [];
            }
            // Get full invite link details for each code
            const inviteLinks = [];
            for (const item of response.Items) {
                const fullInvite = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.INVITE_LINKS_TABLE,
                    Key: { PK: item.inviteCode, SK: 'INVITE' },
                }));
                if (fullInvite.Item) {
                    inviteLinks.push(fullInvite.Item);
                }
            }
            // Filter active and non-expired invites
            const now = new Date();
            return inviteLinks.filter(invite => invite.isActive && new Date(invite.expiresAt) > now);
        }
        catch (error) {
            console.error('❌ Error getting room invite links:', error);
            return [];
        }
    }
    /**
     * Deactivate an invite code
     */
    async deactivateInviteCode(code) {
        try {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Key: { PK: code, SK: 'INVITE' },
                UpdateExpression: 'SET isActive = :inactive, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':inactive': false,
                    ':updatedAt': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(PK)',
            }));
            console.log(`🔒 Invite code deactivated: ${code}`);
        }
        catch (error) {
            console.error('❌ Error deactivating invite code:', error);
            throw error;
        }
    }
    /**
     * Generate a unique invite code
     */
    async generateUniqueInviteCode() {
        for (let attempt = 0; attempt < this.MAX_GENERATION_ATTEMPTS; attempt++) {
            const code = this.generateRandomCode();
            // Check if code already exists
            const exists = await this.checkCodeExists(code);
            if (!exists) {
                return code;
            }
            console.log(`🔄 Invite code collision, retrying: ${code} (attempt ${attempt + 1})`);
        }
        throw new Error('Failed to generate unique invite code after maximum attempts');
    }
    /**
     * Generate a random invite code
     */
    generateRandomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < this.INVITE_CODE_LENGTH; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    /**
     * Check if an invite code already exists
     */
    async checkCodeExists(code) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Key: { PK: code, SK: 'INVITE' },
            }));
            return !!response.Item;
        }
        catch (error) {
            console.error('❌ Error checking code existence:', error);
            return true; // Assume exists to be safe
        }
    }
    /**
     * Extract invite code from URL
     */
    extractInviteCodeFromUrl(url) {
        try {
            // Handle different URL formats:
            // https://trinity.app/room/ABC123
            // trinity.app/room/ABC123
            // /room/ABC123 (only if it's a relative path)
            // ABC123 (direct code)
            const patterns = [
                /^https?:\/\/trinity\.app\/room\/([A-Z0-9]{6})$/i,
                /^trinity\.app\/room\/([A-Z0-9]{6})$/i,
                /^\/room\/([A-Z0-9]{6})$/i,
                /^([A-Z0-9]{6})$/i,
            ];
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) {
                    return match[1].toUpperCase();
                }
            }
            return null;
        }
        catch (error) {
            console.error('❌ Error extracting invite code from URL:', error);
            return null;
        }
    }
    /**
     * Get room information by ID
     */
    async getRoomInfo(roomId) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
            }));
            if (!response.Item) {
                return null;
            }
            const room = response.Item;
            return {
                roomId: room.roomId || roomId,
                name: room.name || 'Unnamed Room',
                hostId: room.hostId,
                status: room.status,
                memberCount: room.memberCount || 0,
                isPrivate: room.isPrivate || false,
                createdAt: room.createdAt,
            };
        }
        catch (error) {
            console.error('❌ Error getting room info:', error);
            return null;
        }
    }
    /**
     * Increment usage count for an invite code
     */
    async incrementUsageCount(code) {
        try {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Key: { PK: code, SK: 'INVITE' },
                UpdateExpression: 'ADD usageCount :increment SET updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':increment': 1,
                    ':updatedAt': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_exists(PK)',
            }));
        }
        catch (error) {
            console.error('❌ Error incrementing usage count:', error);
            // Don't throw - this is not critical for the join process
        }
    }
    /**
     * Clean up expired invite codes (maintenance function)
     */
    async cleanupExpiredInvites() {
        console.log('🧹 Starting cleanup of expired invite codes');
        let cleanedCount = 0;
        try {
            // This would typically be implemented as a scheduled job
            // For now, we'll just mark it as a placeholder
            console.log('⚠️ Cleanup function not fully implemented - would be run as scheduled job');
            return cleanedCount;
        }
        catch (error) {
            console.error('❌ Error during invite cleanup:', error);
            return cleanedCount;
        }
    }
    /**
     * Get invite link statistics
     */
    async getInviteStats(code) {
        try {
            const response = await this.docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.INVITE_LINKS_TABLE,
                Key: { PK: code, SK: 'INVITE' },
            }));
            if (!response.Item) {
                return null;
            }
            const invite = response.Item;
            return {
                code: invite.code,
                usageCount: invite.usageCount,
                maxUsage: invite.maxUsage,
                isActive: invite.isActive,
                expiresAt: invite.expiresAt,
                createdAt: invite.createdAt,
            };
        }
        catch (error) {
            console.error('❌ Error getting invite stats:', error);
            return null;
        }
    }
}
exports.DeepLinkService = DeepLinkService;
// Export singleton instance
exports.deepLinkService = new DeepLinkService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVlcExpbmtTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVlcExpbmtTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBb0g7QUFDcEgsOENBQWlGO0FBK0JqRjs7O0dBR0c7QUFDSCxNQUFhLGVBQWU7SUFPMUIsWUFBWSxTQUFrQztRQU43Qix1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFDdkIseUJBQW9CLEdBQUcsR0FBRyxDQUFDLENBQUMsU0FBUztRQUNyQyw0QkFBdUIsR0FBRyxFQUFFLENBQUM7UUFDN0IsYUFBUSxHQUFHLHFCQUFxQixDQUFDO1FBSWhELElBQUksU0FBUyxFQUFFO1lBQ2IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7U0FDNUI7YUFBTTtZQUNMLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUM1RDtJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxrQkFBa0IsQ0FDdEIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLE9BR0M7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLDBCQUFnQixDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsTUFBTSxZQUFZLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFakYsSUFBSTtZQUNGLDhCQUE4QjtZQUM5QixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBRXpELHdCQUF3QjtZQUN4QixNQUFNLFdBQVcsR0FBRyxPQUFPLEVBQUUsV0FBVyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztZQUN0RSxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMs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UTtnQkFDekIsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO2dCQUMzQixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7YUFDNUIsQ0FBQztTQUNIO1FBQUMsT0FBTyxLQUFLLEVBQUU7WUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3RELE9BQU8sSUFBSSxDQUFDO1NBQ2I7SUFDSCxDQUFDO0NBQ0Y7QUFuZUQsMENBbWVDO0FBRUQsNEJBQTRCO0FBQ2YsUUFBQSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCwgUXVlcnlDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEludml0ZUxpbmsge1xyXG4gIGNvZGU6IHN0cmluZztcclxuICB1cmw6IHN0cmluZztcclxuICByb29tSWQ6IHN0cmluZztcclxuICBjcmVhdGVkQnk6IHN0cmluZztcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxuICBleHBpcmVzQXQ6IHN0cmluZztcclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxuICB1c2FnZUNvdW50OiBudW1iZXI7XHJcbiAgbWF4VXNhZ2U/OiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGVlcExpbmtBY3Rpb24ge1xyXG4gIHR5cGU6ICdKT0lOX1JPT00nIHwgJ0lOVkFMSURfQ09ERScgfCAnRVhQSVJFRF9DT0RFJyB8ICdFUlJPUic7XHJcbiAgcm9vbUlkPzogc3RyaW5nO1xyXG4gIGVycm9yTWVzc2FnZT86IHN0cmluZztcclxuICBtZXRhZGF0YT86IHsgW2tleTogc3RyaW5nXTogYW55IH07XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUm9vbUluZm8ge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBob3N0SWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICBtZW1iZXJDb3VudDogbnVtYmVyO1xyXG4gIGlzUHJpdmF0ZTogYm9vbGVhbjtcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIERlZXAgTGluayBTZXJ2aWNlXHJcbiAqIEhhbmRsZXMgaW52aXRlIGNvZGUgZ2VuZXJhdGlvbiwgdmFsaWRhdGlvbiwgYW5kIGRlZXAgbGluayByb3V0aW5nXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRGVlcExpbmtTZXJ2aWNlIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IElOVklURV9DT0RFX0xFTkdUSCA9IDY7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBERUZBVUxUX0VYUElSWV9IT1VSUyA9IDE2ODsgLy8gNyBkYXlzXHJcbiAgcHJpdmF0ZSByZWFkb25seSBNQVhfR0VORVJBVElPTl9BVFRFTVBUUyA9IDEwO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgQkFTRV9VUkwgPSAnaHR0cHM6Ly90cmluaXR5LmFwcCc7XHJcbiAgcHJpdmF0ZSBkb2NDbGllbnQ6IER5bmFtb0RCRG9jdW1lbnRDbGllbnQ7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGRvY0NsaWVudD86IER5bmFtb0RCRG9jdW1lbnRDbGllbnQpIHtcclxuICAgIGlmIChkb2NDbGllbnQpIHtcclxuICAgICAgdGhpcy5kb2NDbGllbnQgPSBkb2NDbGllbnQ7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG4gICAgICB0aGlzLmRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgYSB1bmlxdWUgaW52aXRlIGxpbmsgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIGFzeW5jIGdlbmVyYXRlSW52aXRlTGluayhcclxuICAgIHJvb21JZDogc3RyaW5nLCBcclxuICAgIGNyZWF0ZWRCeTogc3RyaW5nLCBcclxuICAgIG9wdGlvbnM/OiB7XHJcbiAgICAgIGV4cGlyeUhvdXJzPzogbnVtYmVyO1xyXG4gICAgICBtYXhVc2FnZT86IG51bWJlcjtcclxuICAgIH1cclxuICApOiBQcm9taXNlPEludml0ZUxpbms+IHtcclxuICAgIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0dlbmVyYXRlSW52aXRlTGluaycpO1xyXG4gICAgY29uc29sZS5sb2coYPCflJcgR2VuZXJhdGluZyBpbnZpdGUgbGluayBmb3Igcm9vbSAke3Jvb21JZH0gYnkgdXNlciAke2NyZWF0ZWRCeX1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBHZW5lcmF0ZSB1bmlxdWUgaW52aXRlIGNvZGVcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVVbmlxdWVJbnZpdGVDb2RlKCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDYWxjdWxhdGUgZXhwaXJ5IHRpbWVcclxuICAgICAgY29uc3QgZXhwaXJ5SG91cnMgPSBvcHRpb25zPy5leHBpcnlIb3VycyB8fCB0aGlzLkRFRkFVTFRfRVhQSVJZX0hPVVJTO1xyXG4gICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgKGV4cGlyeUhvdXJzICogNjAgKiA2MCAqIDEwMDApKS50b0lTT1N0cmluZygpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ3JlYXRlIGludml0ZSBsaW5rIG9iamVjdFxyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rOiBJbnZpdGVMaW5rID0ge1xyXG4gICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgdXJsOiBgJHt0aGlzLkJBU0VfVVJMfS9yb29tLyR7aW52aXRlQ29kZX1gLFxyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICBjcmVhdGVkQnksXHJcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgZXhwaXJlc0F0LFxyXG4gICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgbWF4VXNhZ2U6IG9wdGlvbnM/Lm1heFVzYWdlLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgLy8gU3RvcmUgaW4gRHluYW1vREJcclxuICAgICAgYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5JTlZJVEVfTElOS1NfVEFCTEUhLFxyXG4gICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgIFBLOiBpbnZpdGVDb2RlLCAvLyBQcmltYXJ5IGtleSBpcyB0aGUgaW52aXRlIGNvZGVcclxuICAgICAgICAgIFNLOiAnSU5WSVRFJywgICAvLyBTb3J0IGtleSBmb3IgaW52aXRlIGxpbmtzXHJcbiAgICAgICAgICAuLi5pbnZpdGVMaW5rLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKFBLKScsIC8vIEVuc3VyZSB1bmlxdWVuZXNzXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIEFsc28gY3JlYXRlIGEgcmV2ZXJzZSBsb29rdXAgYnkgcm9vbUlkIGZvciBtYW5hZ2VtZW50XHJcbiAgICAgIGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFISxcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgU0s6IGBJTlZJVEUjJHtpbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBpbnZpdGVMaW5rLmNyZWF0ZWRBdCxcclxuICAgICAgICAgIGV4cGlyZXNBdDogaW52aXRlTGluay5leHBpcmVzQXQsXHJcbiAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICAgIGxvZ0J1c2luZXNzTWV0cmljKCdJTlZJVEVfTElOS19DUkVBVEVEJywgcm9vbUlkLCBjcmVhdGVkQnksIHtcclxuICAgICAgICBpbnZpdGVDb2RlLFxyXG4gICAgICAgIGV4cGlyeUhvdXJzLFxyXG4gICAgICAgIG1heFVzYWdlOiBvcHRpb25zPy5tYXhVc2FnZSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEludml0ZSBsaW5rIGdlbmVyYXRlZDogJHtpbnZpdGVMaW5rLnVybH0gKGV4cGlyZXM6ICR7ZXhwaXJlc0F0fSlgKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBpbnZpdGVDb2RlLCByb29tSWQgfSk7XHJcbiAgICAgIHJldHVybiBpbnZpdGVMaW5rO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvZ0Vycm9yKCdHZW5lcmF0ZUludml0ZUxpbmsnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIGNyZWF0ZWRCeSB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIGFuIGludml0ZSBjb2RlIGFuZCByZXR1cm4gcm9vbSBpbmZvcm1hdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIHZhbGlkYXRlSW52aXRlQ29kZShjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFJvb21JbmZvIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignVmFsaWRhdGVJbnZpdGVDb2RlJyk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBWYWxpZGF0aW5nIGludml0ZSBjb2RlOiAke2NvZGV9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGludml0ZSBsaW5rIGZyb20gRHluYW1vREJcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LklOVklURV9MSU5LU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiBjb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZpdGUgY29kZSBub3QgZm91bmQ6ICR7Y29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ25vdF9mb3VuZCcgfSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGludml0ZUxpbmsgPSByZXNwb25zZS5JdGVtIGFzIEludml0ZUxpbms7XHJcblxyXG4gICAgICAvLyBDaGVjayBpZiBpbnZpdGUgaXMgYWN0aXZlXHJcbiAgICAgIGlmICghaW52aXRlTGluay5pc0FjdGl2ZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgSW52aXRlIGNvZGUgaXMgaW5hY3RpdmU6ICR7Y29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2luYWN0aXZlJyB9KTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgaWYgaW52aXRlIGhhcyBleHBpcmVkXHJcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICAgIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShpbnZpdGVMaW5rLmV4cGlyZXNBdCk7XHJcbiAgICAgIGlmIChub3cgPiBleHBpcnlEYXRlKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZpdGUgY29kZSBoYXMgZXhwaXJlZDogJHtjb2RlfSAoZXhwaXJlZDogJHtpbnZpdGVMaW5rLmV4cGlyZXNBdH0pYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWFyayBhcyBpbmFjdGl2ZVxyXG4gICAgICAgIGF3YWl0IHRoaXMuZGVhY3RpdmF0ZUludml0ZUNvZGUoY29kZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICdleHBpcmVkJyB9KTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgdXNhZ2UgbGltaXRzXHJcbiAgICAgIGlmIChpbnZpdGVMaW5rLm1heFVzYWdlICYmIGludml0ZUxpbmsudXNhZ2VDb3VudCA+PSBpbnZpdGVMaW5rLm1heFVzYWdlKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZpdGUgY29kZSB1c2FnZSBsaW1pdCByZWFjaGVkOiAke2NvZGV9ICgke2ludml0ZUxpbmsudXNhZ2VDb3VudH0vJHtpbnZpdGVMaW5rLm1heFVzYWdlfSlgKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNYXJrIGFzIGluYWN0aXZlXHJcbiAgICAgICAgYXdhaXQgdGhpcy5kZWFjdGl2YXRlSW52aXRlQ29kZShjb2RlKTtcclxuICAgICAgICBcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ3VzYWdlX2xpbWl0X3JlYWNoZWQnIH0pO1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBHZXQgcm9vbSBpbmZvcm1hdGlvblxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Um9vbUluZm8oaW52aXRlTGluay5yb29tSWQpO1xyXG4gICAgICBpZiAoIXJvb21JbmZvKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBSb29tIG5vdCBmb3VuZCBmb3IgaW52aXRlIGNvZGU6ICR7Y29kZX0gKHJvb21JZDogJHtpbnZpdGVMaW5rLnJvb21JZH0pYCk7XHJcbiAgICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICdyb29tX25vdF9mb3VuZCcgfSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgSW52aXRlIGNvZGUgdmFsaWRhdGVkOiAke2NvZGV9IC0+IFJvb206ICR7cm9vbUluZm8ubmFtZX1gKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByZXN1bHQ6ICd2YWxpZCcsIHJvb21JZDogcm9vbUluZm8ucm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4gcm9vbUluZm87XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbG9nRXJyb3IoJ1ZhbGlkYXRlSW52aXRlQ29kZScsIGVycm9yIGFzIEVycm9yLCB7IGNvZGUgfSk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBIYW5kbGUgZGVlcCBsaW5rIFVSTCBhbmQgcmV0dXJuIGFwcHJvcHJpYXRlIGFjdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGhhbmRsZURlZXBMaW5rKHVybDogc3RyaW5nKTogUHJvbWlzZTxEZWVwTGlua0FjdGlvbj4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignSGFuZGxlRGVlcExpbmsnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SXIEhhbmRsaW5nIGRlZXAgbGluazogJHt1cmx9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gUGFyc2UgVVJMIHRvIGV4dHJhY3QgaW52aXRlIGNvZGVcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9IHRoaXMuZXh0cmFjdEludml0ZUNvZGVGcm9tVXJsKHVybCk7XHJcbiAgICAgIGlmICghaW52aXRlQ29kZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgSW52YWxpZCBkZWVwIGxpbmsgZm9ybWF0OiAke3VybH1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2ludmFsaWRfZm9ybWF0JyB9KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgdHlwZTogJ0VSUk9SJyxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZTogJ0ludmFsaWQgaW52aXRlIGxpbmsgZm9ybWF0JyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBWYWxpZGF0ZSBpbnZpdGUgY29kZVxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IHRoaXMudmFsaWRhdGVJbnZpdGVDb2RlKGludml0ZUNvZGUpO1xyXG4gICAgICBpZiAoIXJvb21JbmZvKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKdjCBJbnZhbGlkIG9yIGV4cGlyZWQgaW52aXRlIGNvZGU6ICR7aW52aXRlQ29kZX1gKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ2ludmFsaWRfY29kZScgfSk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIHR5cGU6ICdJTlZBTElEX0NPREUnLFxyXG4gICAgICAgICAgZXJyb3JNZXNzYWdlOiAnVGhpcyBpbnZpdGUgbGluayBpcyBpbnZhbGlkIG9yIGhhcyBleHBpcmVkJyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayByb29tIHN0YXR1c1xyXG4gICAgICBpZiAocm9vbUluZm8uc3RhdHVzID09PSAnQ09NUExFVEVEJyB8fCByb29tSW5mby5zdGF0dXMgPT09ICdJTkFDVElWRScpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MIFJvb20gaXMgbm90IGF2YWlsYWJsZTogJHtyb29tSW5mby5yb29tSWR9IChzdGF0dXM6ICR7cm9vbUluZm8uc3RhdHVzfSlgKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJlc3VsdDogJ3Jvb21fdW5hdmFpbGFibGUnIH0pO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICB0eXBlOiAnSU5WQUxJRF9DT0RFJyxcclxuICAgICAgICAgIGVycm9yTWVzc2FnZTogJ1RoaXMgcm9vbSBpcyBubyBsb25nZXIgYXZhaWxhYmxlJyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBJbmNyZW1lbnQgdXNhZ2UgY291bnRcclxuICAgICAgYXdhaXQgdGhpcy5pbmNyZW1lbnRVc2FnZUNvdW50KGludml0ZUNvZGUpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBEZWVwIGxpbmsgaGFuZGxlZCBzdWNjZXNzZnVsbHk6ICR7aW52aXRlQ29kZX0gLT4gJHtyb29tSW5mby5yb29tSWR9YCk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcmVzdWx0OiAnc3VjY2VzcycsIHJvb21JZDogcm9vbUluZm8ucm9vbUlkIH0pO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdKT0lOX1JPT00nLFxyXG4gICAgICAgIHJvb21JZDogcm9vbUluZm8ucm9vbUlkLFxyXG4gICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICByb29tTmFtZTogcm9vbUluZm8ubmFtZSxcclxuICAgICAgICAgIGhvc3RJZDogcm9vbUluZm8uaG9zdElkLFxyXG4gICAgICAgICAgbWVtYmVyQ291bnQ6IHJvb21JbmZvLm1lbWJlckNvdW50LFxyXG4gICAgICAgICAgaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvZ0Vycm9yKCdIYW5kbGVEZWVwTGluaycsIGVycm9yIGFzIEVycm9yLCB7IHVybCB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdFUlJPUicsXHJcbiAgICAgICAgZXJyb3JNZXNzYWdlOiAnQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcHJvY2Vzc2luZyB0aGUgaW52aXRlIGxpbmsnLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCBhY3RpdmUgaW52aXRlIGxpbmtzIGZvciBhIHJvb21cclxuICAgKi9cclxuICBhc3luYyBnZXRSb29tSW52aXRlTGlua3Mocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPEludml0ZUxpbmtbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFISxcclxuICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnUEsgPSA6cm9vbUlkIEFORCBiZWdpbnNfd2l0aChTSywgOmludml0ZVByZWZpeCknLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAgICAgJzppbnZpdGVQcmVmaXgnOiAnSU5WSVRFIycsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtcyB8fCByZXNwb25zZS5JdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEdldCBmdWxsIGludml0ZSBsaW5rIGRldGFpbHMgZm9yIGVhY2ggY29kZVxyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rczogSW52aXRlTGlua1tdID0gW107XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiByZXNwb25zZS5JdGVtcykge1xyXG4gICAgICAgIGNvbnN0IGZ1bGxJbnZpdGUgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFISxcclxuICAgICAgICAgIEtleTogeyBQSzogaXRlbS5pbnZpdGVDb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGlmIChmdWxsSW52aXRlLkl0ZW0pIHtcclxuICAgICAgICAgIGludml0ZUxpbmtzLnB1c2goZnVsbEludml0ZS5JdGVtIGFzIEludml0ZUxpbmspO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRmlsdGVyIGFjdGl2ZSBhbmQgbm9uLWV4cGlyZWQgaW52aXRlc1xyXG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICByZXR1cm4gaW52aXRlTGlua3MuZmlsdGVyKGludml0ZSA9PiBcclxuICAgICAgICBpbnZpdGUuaXNBY3RpdmUgJiYgbmV3IERhdGUoaW52aXRlLmV4cGlyZXNBdCkgPiBub3dcclxuICAgICAgKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyByb29tIGludml0ZSBsaW5rczonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERlYWN0aXZhdGUgYW4gaW52aXRlIGNvZGVcclxuICAgKi9cclxuICBhc3luYyBkZWFjdGl2YXRlSW52aXRlQ29kZShjb2RlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IFVwZGF0ZUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IGNvZGUsIFNLOiAnSU5WSVRFJyB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgaXNBY3RpdmUgPSA6aW5hY3RpdmUsIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6aW5hY3RpdmUnOiBmYWxzZSxcclxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9leGlzdHMoUEspJyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCflJIgSW52aXRlIGNvZGUgZGVhY3RpdmF0ZWQ6ICR7Y29kZX1gKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZWFjdGl2YXRpbmcgaW52aXRlIGNvZGU6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIGEgdW5pcXVlIGludml0ZSBjb2RlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZVVuaXF1ZUludml0ZUNvZGUoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgdGhpcy5NQVhfR0VORVJBVElPTl9BVFRFTVBUUzsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgIGNvbnN0IGNvZGUgPSB0aGlzLmdlbmVyYXRlUmFuZG9tQ29kZSgpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2hlY2sgaWYgY29kZSBhbHJlYWR5IGV4aXN0c1xyXG4gICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmNoZWNrQ29kZUV4aXN0cyhjb2RlKTtcclxuICAgICAgaWYgKCFleGlzdHMpIHtcclxuICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYPCflIQgSW52aXRlIGNvZGUgY29sbGlzaW9uLCByZXRyeWluZzogJHtjb2RlfSAoYXR0ZW1wdCAke2F0dGVtcHQgKyAxfSlgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgdW5pcXVlIGludml0ZSBjb2RlIGFmdGVyIG1heGltdW0gYXR0ZW1wdHMnKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIGEgcmFuZG9tIGludml0ZSBjb2RlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBnZW5lcmF0ZVJhbmRvbUNvZGUoKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IGNoYXJzID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaMDEyMzQ1Njc4OSc7XHJcbiAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICBcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5JTlZJVEVfQ09ERV9MRU5HVEg7IGkrKykge1xyXG4gICAgICByZXN1bHQgKz0gY2hhcnMuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNoYXJzLmxlbmd0aCkpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgYW4gaW52aXRlIGNvZGUgYWxyZWFkeSBleGlzdHNcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29kZUV4aXN0cyhjb2RlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5JTlZJVEVfTElOS1NfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBQSzogY29kZSwgU0s6ICdJTlZJVEUnIH0sXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiAhIXJlc3BvbnNlLkl0ZW07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY2hlY2tpbmcgY29kZSBleGlzdGVuY2U6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gQXNzdW1lIGV4aXN0cyB0byBiZSBzYWZlXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeHRyYWN0IGludml0ZSBjb2RlIGZyb20gVVJMXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBleHRyYWN0SW52aXRlQ29kZUZyb21VcmwodXJsOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgVVJMIGZvcm1hdHM6XHJcbiAgICAgIC8vIGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS9BQkMxMjNcclxuICAgICAgLy8gdHJpbml0eS5hcHAvcm9vbS9BQkMxMjNcclxuICAgICAgLy8gL3Jvb20vQUJDMTIzIChvbmx5IGlmIGl0J3MgYSByZWxhdGl2ZSBwYXRoKVxyXG4gICAgICAvLyBBQkMxMjMgKGRpcmVjdCBjb2RlKVxyXG4gICAgICBcclxuICAgICAgY29uc3QgcGF0dGVybnMgPSBbXHJcbiAgICAgICAgL15odHRwcz86XFwvXFwvdHJpbml0eVxcLmFwcFxcL3Jvb21cXC8oW0EtWjAtOV17Nn0pJC9pLFxyXG4gICAgICAgIC9edHJpbml0eVxcLmFwcFxcL3Jvb21cXC8oW0EtWjAtOV17Nn0pJC9pLFxyXG4gICAgICAgIC9eXFwvcm9vbVxcLyhbQS1aMC05XXs2fSkkL2ksXHJcbiAgICAgICAgL14oW0EtWjAtOV17Nn0pJC9pLFxyXG4gICAgICBdO1xyXG4gICAgICBcclxuICAgICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2ggPSB1cmwubWF0Y2gocGF0dGVybik7XHJcbiAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICByZXR1cm4gbWF0Y2hbMV0udG9VcHBlckNhc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGV4dHJhY3RpbmcgaW52aXRlIGNvZGUgZnJvbSBVUkw6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCByb29tIGluZm9ybWF0aW9uIGJ5IElEXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRSb29tSW5mbyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbUluZm8gfCBudWxsPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByb29tID0gcmVzcG9uc2UuSXRlbTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICByb29tSWQ6IHJvb20ucm9vbUlkIHx8IHJvb21JZCxcclxuICAgICAgICBuYW1lOiByb29tLm5hbWUgfHwgJ1VubmFtZWQgUm9vbScsXHJcbiAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICAgIG1lbWJlckNvdW50OiByb29tLm1lbWJlckNvdW50IHx8IDAsXHJcbiAgICAgICAgaXNQcml2YXRlOiByb29tLmlzUHJpdmF0ZSB8fCBmYWxzZSxcclxuICAgICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0LFxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGdldHRpbmcgcm9vbSBpbmZvOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbmNyZW1lbnQgdXNhZ2UgY291bnQgZm9yIGFuIGludml0ZSBjb2RlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBpbmNyZW1lbnRVc2FnZUNvdW50KGNvZGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5JTlZJVEVfTElOS1NfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBQSzogY29kZSwgU0s6ICdJTlZJVEUnIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ0FERCB1c2FnZUNvdW50IDppbmNyZW1lbnQgU0VUIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6aW5jcmVtZW50JzogMSxcclxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9leGlzdHMoUEspJyxcclxuICAgICAgfSkpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluY3JlbWVudGluZyB1c2FnZSBjb3VudDonLCBlcnJvcik7XHJcbiAgICAgIC8vIERvbid0IHRocm93IC0gdGhpcyBpcyBub3QgY3JpdGljYWwgZm9yIHRoZSBqb2luIHByb2Nlc3NcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENsZWFuIHVwIGV4cGlyZWQgaW52aXRlIGNvZGVzIChtYWludGVuYW5jZSBmdW5jdGlvbilcclxuICAgKi9cclxuICBhc3luYyBjbGVhbnVwRXhwaXJlZEludml0ZXMoKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn6e5IFN0YXJ0aW5nIGNsZWFudXAgb2YgZXhwaXJlZCBpbnZpdGUgY29kZXMnKTtcclxuICAgIGxldCBjbGVhbmVkQ291bnQgPSAwO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBUaGlzIHdvdWxkIHR5cGljYWxseSBiZSBpbXBsZW1lbnRlZCBhcyBhIHNjaGVkdWxlZCBqb2JcclxuICAgICAgLy8gRm9yIG5vdywgd2UnbGwganVzdCBtYXJrIGl0IGFzIGEgcGxhY2Vob2xkZXJcclxuICAgICAgY29uc29sZS5sb2coJ+KaoO+4jyBDbGVhbnVwIGZ1bmN0aW9uIG5vdCBmdWxseSBpbXBsZW1lbnRlZCAtIHdvdWxkIGJlIHJ1biBhcyBzY2hlZHVsZWQgam9iJyk7XHJcbiAgICAgIHJldHVybiBjbGVhbmVkQ291bnQ7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZHVyaW5nIGludml0ZSBjbGVhbnVwOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIGNsZWFuZWRDb3VudDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBpbnZpdGUgbGluayBzdGF0aXN0aWNzXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0SW52aXRlU3RhdHMoY29kZTogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgICBjb2RlOiBzdHJpbmc7XHJcbiAgICB1c2FnZUNvdW50OiBudW1iZXI7XHJcbiAgICBtYXhVc2FnZT86IG51bWJlcjtcclxuICAgIGlzQWN0aXZlOiBib29sZWFuO1xyXG4gICAgZXhwaXJlc0F0OiBzdHJpbmc7XHJcbiAgICBjcmVhdGVkQXQ6IHN0cmluZztcclxuICB9IHwgbnVsbD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LklOVklURV9MSU5LU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiBjb2RlLCBTSzogJ0lOVklURScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGludml0ZSA9IHJlc3BvbnNlLkl0ZW0gYXMgSW52aXRlTGluaztcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBjb2RlOiBpbnZpdGUuY29kZSxcclxuICAgICAgICB1c2FnZUNvdW50OiBpbnZpdGUudXNhZ2VDb3VudCxcclxuICAgICAgICBtYXhVc2FnZTogaW52aXRlLm1heFVzYWdlLFxyXG4gICAgICAgIGlzQWN0aXZlOiBpbnZpdGUuaXNBY3RpdmUsXHJcbiAgICAgICAgZXhwaXJlc0F0OiBpbnZpdGUuZXhwaXJlc0F0LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogaW52aXRlLmNyZWF0ZWRBdCxcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIGludml0ZSBzdGF0czonLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxyXG5leHBvcnQgY29uc3QgZGVlcExpbmtTZXJ2aWNlID0gbmV3IERlZXBMaW5rU2VydmljZSgpOyJdfQ==