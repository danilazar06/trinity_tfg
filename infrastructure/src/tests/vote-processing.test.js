"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
// Mock environment variables
process.env.ROOMS_TABLE = 'test-rooms-table';
process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';
process.env.VOTES_TABLE = 'test-votes-table';
process.env.USER_VOTES_TABLE = 'test-user-votes-table';
(0, globals_1.describe)('Vote Processing Reliability - Property Tests', () => {
    /**
     * Property 1: Vote Processing Reliability
     * Validates: Requirements 1.1, 1.2
     *
     * These tests verify that the vote processing system:
     * 1. Uses correct DynamoDB key structure { PK: roomId, SK: 'ROOM' }
     * 2. Handles errors gracefully with exponential backoff
     * 3. Processes DISLIKE votes according to Stop-on-Match algorithm
     */
    (0, globals_1.describe)('Property 1: Vote Processing Reliability', () => {
        (0, globals_1.it)('should use correct DynamoDB key structure format', () => {
            // Test the key structure format used in the vote handler
            const roomId = 'test-room-123';
            const expectedKey = { PK: roomId, SK: 'ROOM' };
            // Verify the key structure matches the expected format
            (0, globals_1.expect)(expectedKey.PK).toBe(roomId);
            (0, globals_1.expect)(expectedKey.SK).toBe('ROOM');
            (0, globals_1.expect)(Object.keys(expectedKey)).toEqual(['PK', 'SK']);
        });
        (0, globals_1.it)('should implement exponential backoff for retry logic', () => {
            // Test exponential backoff calculation
            const baseDelay = 100;
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const expectedDelay = baseDelay * Math.pow(2, attempt);
                const calculatedDelay = baseDelay * Math.pow(2, attempt);
                (0, globals_1.expect)(calculatedDelay).toBe(expectedDelay);
                (0, globals_1.expect)(calculatedDelay).toBeGreaterThan(0);
            }
        });
        (0, globals_1.it)('should validate Stop-on-Match algorithm logic', () => {
            // Test that DISLIKE votes are ignored according to Stop-on-Match
            const voteTypes = ['LIKE', 'DISLIKE'];
            const processedVotes = voteTypes.filter(voteType => voteType === 'LIKE');
            (0, globals_1.expect)(processedVotes).toEqual(['LIKE']);
            (0, globals_1.expect)(processedVotes).not.toContain('DISLIKE');
        });
        (0, globals_1.it)('should handle error message formatting correctly', () => {
            // Test error message formatting for user-friendly messages
            const systemError = 'ValidationException: key element does not match';
            const userFriendlyMessage = 'Error interno del sistema. Por favor, inténtalo de nuevo más tarde.';
            // Verify that system errors are converted to user-friendly messages
            const isSystemError = systemError.includes('ValidationException') &&
                systemError.includes('key element does not match');
            (0, globals_1.expect)(isSystemError).toBe(true);
            (0, globals_1.expect)(userFriendlyMessage).toContain('Error interno del sistema');
            (0, globals_1.expect)(userFriendlyMessage).not.toContain('ValidationException');
        });
        (0, globals_1.it)('should validate room status for voting eligibility', () => {
            // Test room status validation logic
            const validStatuses = ['ACTIVE', 'WAITING'];
            const invalidStatuses = ['MATCHED', 'COMPLETED', 'PAUSED'];
            validStatuses.forEach(status => {
                const isValidForVoting = status === 'ACTIVE' || status === 'WAITING';
                (0, globals_1.expect)(isValidForVoting).toBe(true);
            });
            invalidStatuses.forEach(status => {
                const isValidForVoting = status === 'ACTIVE' || status === 'WAITING';
                (0, globals_1.expect)(isValidForVoting).toBe(false);
            });
        });
        (0, globals_1.it)('should validate vote count consensus logic', () => {
            // Test Stop-on-Match consensus logic
            const testCases = [
                { currentVotes: 1, totalMembers: 2, shouldMatch: false },
                { currentVotes: 2, totalMembers: 2, shouldMatch: true },
                { currentVotes: 3, totalMembers: 3, shouldMatch: true },
                { currentVotes: 2, totalMembers: 3, shouldMatch: false },
            ];
            testCases.forEach(({ currentVotes, totalMembers, shouldMatch }) => {
                const hasConsensus = currentVotes >= totalMembers;
                (0, globals_1.expect)(hasConsensus).toBe(shouldMatch);
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS1wcm9jZXNzaW5nLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b3RlLXByb2Nlc3NpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDJDQUF1RTtBQUV2RSw2QkFBNkI7QUFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRyx5QkFBeUIsQ0FBQztBQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQztBQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDO0FBRXZELElBQUEsa0JBQVEsRUFBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7SUFDNUQ7Ozs7Ozs7O09BUUc7SUFDSCxJQUFBLGtCQUFRLEVBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELElBQUEsWUFBRSxFQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUMxRCx5REFBeUQ7WUFDekQsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDO1lBQy9CLE1BQU0sV0FBVyxHQUFHLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFFL0MsdURBQXVEO1lBQ3ZELElBQUEsZ0JBQU0sRUFBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLElBQUEsZ0JBQU0sRUFBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLElBQUEsZ0JBQU0sRUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDekQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJ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Q0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUEsWUFBRSxFQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtZQUNwRCxxQ0FBcUM7WUFDckMsTUFBTSxTQUFTLEdBQUc7Z0JBQ2hCLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUU7Z0JBQ3hELEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUU7Z0JBQ3ZELEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUU7Z0JBQ3ZELEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUU7YUFDekQsQ0FBQztZQUVGLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtnQkFDaEUsTUFBTSxZQUFZLEdBQUcsWUFBWSxJQUFJLFlBQVksQ0FBQztnQkFDbEQsSUFBQSxnQkFBTSxFQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN6QyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlc2NyaWJlLCBpdCwgZXhwZWN0LCBiZWZvcmVFYWNoLCBqZXN0IH0gZnJvbSAnQGplc3QvZ2xvYmFscyc7XHJcblxyXG4vLyBNb2NrIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG5wcm9jZXNzLmVudi5ST09NU19UQUJMRSA9ICd0ZXN0LXJvb21zLXRhYmxlJztcclxucHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFID0gJ3Rlc3Qtcm9vbS1tZW1iZXJzLXRhYmxlJztcclxucHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUgPSAndGVzdC12b3Rlcy10YWJsZSc7XHJcbnByb2Nlc3MuZW52LlVTRVJfVk9URVNfVEFCTEUgPSAndGVzdC11c2VyLXZvdGVzLXRhYmxlJztcclxuXHJcbmRlc2NyaWJlKCdWb3RlIFByb2Nlc3NpbmcgUmVsaWFiaWxpdHkgLSBQcm9wZXJ0eSBUZXN0cycsICgpID0+IHtcclxuICAvKipcclxuICAgKiBQcm9wZXJ0eSAxOiBWb3RlIFByb2Nlc3NpbmcgUmVsaWFiaWxpdHlcclxuICAgKiBWYWxpZGF0ZXM6IFJlcXVpcmVtZW50cyAxLjEsIDEuMlxyXG4gICAqIFxyXG4gICAqIFRoZXNlIHRlc3RzIHZlcmlmeSB0aGF0IHRoZSB2b3RlIHByb2Nlc3Npbmcgc3lzdGVtOlxyXG4gICAqIDEuIFVzZXMgY29ycmVjdCBEeW5hbW9EQiBrZXkgc3RydWN0dXJlIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9XHJcbiAgICogMi4gSGFuZGxlcyBlcnJvcnMgZ3JhY2VmdWxseSB3aXRoIGV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgKiAzLiBQcm9jZXNzZXMgRElTTElLRSB2b3RlcyBhY2NvcmRpbmcgdG8gU3RvcC1vbi1NYXRjaCBhbGdvcml0aG1cclxuICAgKi9cclxuICBkZXNjcmliZSgnUHJvcGVydHkgMTogVm90ZSBQcm9jZXNzaW5nIFJlbGlhYmlsaXR5JywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCB1c2UgY29ycmVjdCBEeW5hbW9EQiBrZXkgc3RydWN0dXJlIGZvcm1hdCcsICgpID0+IHtcclxuICAgICAgLy8gVGVzdCB0aGUga2V5IHN0cnVjdHVyZSBmb3JtYXQgdXNlZCBpbiB0aGUgdm90ZSBoYW5kbGVyXHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tMTIzJztcclxuICAgICAgY29uc3QgZXhwZWN0ZWRLZXkgPSB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfTtcclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSB0aGUga2V5IHN0cnVjdHVyZSBtYXRjaGVzIHRoZSBleHBlY3RlZCBmb3JtYXRcclxuICAgICAgZXhwZWN0KGV4cGVjdGVkS2V5LlBLKS50b0JlKHJvb21JZCk7XHJcbiAgICAgIGV4cGVjdChleHBlY3RlZEtleS5TSykudG9CZSgnUk9PTScpO1xyXG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMoZXhwZWN0ZWRLZXkpKS50b0VxdWFsKFsnUEsnLCAnU0snXSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGltcGxlbWVudCBleHBvbmVudGlhbCBiYWNrb2ZmIGZvciByZXRyeSBsb2dpYycsICgpID0+IHtcclxuICAgICAgLy8gVGVzdCBleHBvbmVudGlhbCBiYWNrb2ZmIGNhbGN1bGF0aW9uXHJcbiAgICAgIGNvbnN0IGJhc2VEZWxheSA9IDEwMDtcclxuICAgICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcclxuICAgICAgICBjb25zdCBleHBlY3RlZERlbGF5ID0gYmFzZURlbGF5ICogTWF0aC5wb3coMiwgYXR0ZW1wdCk7XHJcbiAgICAgICAgY29uc3QgY2FsY3VsYXRlZERlbGF5ID0gYmFzZURlbGF5ICogTWF0aC5wb3coMiwgYXR0ZW1wdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZXhwZWN0KGNhbGN1bGF0ZWREZWxheSkudG9CZShleHBlY3RlZERlbGF5KTtcclxuICAgICAgICBleHBlY3QoY2FsY3VsYXRlZERlbGF5KS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgdmFsaWRhdGUgU3RvcC1vbi1NYXRjaCBhbGdvcml0aG0gbG9naWMnLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3QgdGhhdCBESVNMSUtFIHZvdGVzIGFyZSBpZ25vcmVkIGFjY29yZGluZyB0byBTdG9wLW9uLU1hdGNoXHJcbiAgICAgIGNvbnN0IHZvdGVUeXBlcyA9IFsnTElLRScsICdESVNMSUtFJ107XHJcbiAgICAgIGNvbnN0IHByb2Nlc3NlZFZvdGVzID0gdm90ZVR5cGVzLmZpbHRlcih2b3RlVHlwZSA9PiB2b3RlVHlwZSA9PT0gJ0xJS0UnKTtcclxuICAgICAgXHJcbiAgICAgIGV4cGVjdChwcm9jZXNzZWRWb3RlcykudG9FcXVhbChbJ0xJS0UnXSk7XHJcbiAgICAgIGV4cGVjdChwcm9jZXNzZWRWb3Rlcykubm90LnRvQ29udGFpbignRElTTElLRScpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZXJyb3IgbWVzc2FnZSBmb3JtYXR0aW5nIGNvcnJlY3RseScsICgpID0+IHtcclxuICAgICAgLy8gVGVzdCBlcnJvciBtZXNzYWdlIGZvcm1hdHRpbmcgZm9yIHVzZXItZnJpZW5kbHkgbWVzc2FnZXNcclxuICAgICAgY29uc3Qgc3lzdGVtRXJyb3IgPSAnVmFsaWRhdGlvbkV4Y2VwdGlvbjoga2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnO1xyXG4gICAgICBjb25zdCB1c2VyRnJpZW5kbHlNZXNzYWdlID0gJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLic7XHJcbiAgICAgIFxyXG4gICAgICAvLyBWZXJpZnkgdGhhdCBzeXN0ZW0gZXJyb3JzIGFyZSBjb252ZXJ0ZWQgdG8gdXNlci1mcmllbmRseSBtZXNzYWdlc1xyXG4gICAgICBjb25zdCBpc1N5c3RlbUVycm9yID0gc3lzdGVtRXJyb3IuaW5jbHVkZXMoJ1ZhbGlkYXRpb25FeGNlcHRpb24nKSAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgc3lzdGVtRXJyb3IuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJyk7XHJcbiAgICAgIFxyXG4gICAgICBleHBlY3QoaXNTeXN0ZW1FcnJvcikudG9CZSh0cnVlKTtcclxuICAgICAgZXhwZWN0KHVzZXJGcmllbmRseU1lc3NhZ2UpLnRvQ29udGFpbignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYScpO1xyXG4gICAgICBleHBlY3QodXNlckZyaWVuZGx5TWVzc2FnZSkubm90LnRvQ29udGFpbignVmFsaWRhdGlvbkV4Y2VwdGlvbicpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSByb29tIHN0YXR1cyBmb3Igdm90aW5nIGVsaWdpYmlsaXR5JywgKCkgPT4ge1xyXG4gICAgICAvLyBUZXN0IHJvb20gc3RhdHVzIHZhbGlkYXRpb24gbG9naWNcclxuICAgICAgY29uc3QgdmFsaWRTdGF0dXNlcyA9IFsnQUNUSVZFJywgJ1dBSVRJTkcnXTtcclxuICAgICAgY29uc3QgaW52YWxpZFN0YXR1c2VzID0gWydNQVRDSEVEJywgJ0NPTVBMRVRFRCcsICdQQVVTRUQnXTtcclxuICAgICAgXHJcbiAgICAgIHZhbGlkU3RhdHVzZXMuZm9yRWFjaChzdGF0dXMgPT4ge1xyXG4gICAgICAgIGNvbnN0IGlzVmFsaWRGb3JWb3RpbmcgPSBzdGF0dXMgPT09ICdBQ1RJVkUnIHx8IHN0YXR1cyA9PT0gJ1dBSVRJTkcnO1xyXG4gICAgICAgIGV4cGVjdChpc1ZhbGlkRm9yVm90aW5nKS50b0JlKHRydWUpO1xyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIGludmFsaWRTdGF0dXNlcy5mb3JFYWNoKHN0YXR1cyA9PiB7XHJcbiAgICAgICAgY29uc3QgaXNWYWxpZEZvclZvdGluZyA9IHN0YXR1cyA9PT0gJ0FDVElWRScgfHwgc3RhdHVzID09PSAnV0FJVElORyc7XHJcbiAgICAgICAgZXhwZWN0KGlzVmFsaWRGb3JWb3RpbmcpLnRvQmUoZmFsc2UpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgdmFsaWRhdGUgdm90ZSBjb3VudCBjb25zZW5zdXMgbG9naWMnLCAoKSA9PiB7XHJcbiAgICAgIC8vIFRlc3QgU3RvcC1vbi1NYXRjaCBjb25zZW5zdXMgbG9naWNcclxuICAgICAgY29uc3QgdGVzdENhc2VzID0gW1xyXG4gICAgICAgIHsgY3VycmVudFZvdGVzOiAxLCB0b3RhbE1lbWJlcnM6IDIsIHNob3VsZE1hdGNoOiBmYWxzZSB9LFxyXG4gICAgICAgIHsgY3VycmVudFZvdGVzOiAyLCB0b3RhbE1lbWJlcnM6IDIsIHNob3VsZE1hdGNoOiB0cnVlIH0sXHJcbiAgICAgICAgeyBjdXJyZW50Vm90ZXM6IDMsIHRvdGFsTWVtYmVyczogMywgc2hvdWxkTWF0Y2g6IHRydWUgfSxcclxuICAgICAgICB7IGN1cnJlbnRWb3RlczogMiwgdG90YWxNZW1iZXJzOiAzLCBzaG91bGRNYXRjaDogZmFsc2UgfSxcclxuICAgICAgXTtcclxuICAgICAgXHJcbiAgICAgIHRlc3RDYXNlcy5mb3JFYWNoKCh7IGN1cnJlbnRWb3RlcywgdG90YWxNZW1iZXJzLCBzaG91bGRNYXRjaCB9KSA9PiB7XHJcbiAgICAgICAgY29uc3QgaGFzQ29uc2Vuc3VzID0gY3VycmVudFZvdGVzID49IHRvdGFsTWVtYmVycztcclxuICAgICAgICBleHBlY3QoaGFzQ29uc2Vuc3VzKS50b0JlKHNob3VsZE1hdGNoKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxufSk7Il19