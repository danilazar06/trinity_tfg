"use strict";
/**
 * AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMovieTitle = exports.publishVoteUpdateEvent = exports.publishMatchFoundEvent = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * Publish Match Found event to all room subscribers
 */
async function publishMatchFoundEvent(roomId, movieId, movieTitle, participants) {
    try {
        const event = {
            id: `match_${roomId}_${movieId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'MATCH_FOUND',
            matchId: `match_${roomId}_${movieId}`,
            mediaId: movieId,
            mediaTitle: movieTitle,
            participants,
            consensusType: 'UNANIMOUS' // Trinity uses unanimous consensus
        };
        // En AppSync, los eventos se publican automáticamente a los subscribers
        // cuando se ejecuta la mutation publishMatchEvent desde el resolver
        console.log(`🎉 MATCH_FOUND Event published for room ${roomId}:`, {
            movieId,
            movieTitle,
            participantCount: participants.length
        });
        // Store the match event for audit/history purposes
        await storeEventForAudit('MATCH_FOUND', roomId, event);
    }
    catch (error) {
        console.error('❌ Error publishing match found event:', error);
        // Don't throw - real-time notifications are nice-to-have, not critical
    }
}
exports.publishMatchFoundEvent = publishMatchFoundEvent;
/**
 * Publish Vote Update event to room subscribers
 */
async function publishVoteUpdateEvent(roomId, userId, movieId, voteType, currentVotes, totalMembers) {
    try {
        const event = {
            id: `vote_${roomId}_${userId}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            roomId,
            eventType: 'VOTE_UPDATE',
            userId,
            mediaId: movieId,
            voteType,
            progress: {
                totalVotes: currentVotes,
                likesCount: voteType === 'LIKE' ? currentVotes : 0,
                dislikesCount: 0,
                skipsCount: 0,
                remainingUsers: Math.max(0, totalMembers - currentVotes),
                percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0
            }
        };
        console.log(`🗳️ VOTE_UPDATE Event published for room ${roomId}:`, {
            userId,
            movieId,
            progress: `${currentVotes}/${totalMembers} (${event.progress.percentage.toFixed(1)}%)`
        });
        // Store the vote event for audit/history purposes
        await storeEventForAudit('VOTE_UPDATE', roomId, event);
    }
    catch (error) {
        console.error('❌ Error publishing vote update event:', error);
        // Don't throw - real-time notifications are nice-to-have, not critical
    }
}
exports.publishVoteUpdateEvent = publishVoteUpdateEvent;
/**
 * Get movie title from cache or TMDB ID
 */
async function getMovieTitle(movieId) {
    try {
        // Try to get movie title from cache
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: `movie_${movieId}` },
        }));
        if (response.Item?.movies) {
            const movies = response.Item.movies;
            const movie = movies.find((m) => m.id === movieId);
            if (movie?.title) {
                return movie.title;
            }
        }
        // Fallback to generic title
        return `Movie ${movieId}`;
    }
    catch (error) {
        console.warn('⚠️ Error getting movie title:', error);
        return `Movie ${movieId}`;
    }
}
exports.getMovieTitle = getMovieTitle;
/**
 * Store event for audit trail and debugging
 */
async function storeEventForAudit(eventType, roomId, eventData) {
    try {
        // In a production system, you might want to store events in a separate audit table
        // For now, we'll just log them with structured data for CloudWatch
        console.log(`📊 AUDIT_EVENT:${eventType}`, {
            roomId,
            timestamp: new Date().toISOString(),
            eventData: JSON.stringify(eventData)
        });
    }
    catch (error) {
        console.warn('⚠️ Error storing audit event:', error);
        // Don't throw - audit is optional
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwc3luYy1wdWJsaXNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHBzeW5jLXB1Ymxpc2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUFFSCw4REFBMEQ7QUFDMUQsd0RBQTJFO0FBRTNFLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFnQzVEOztHQUVHO0FBQ0ksS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsT0FBZSxFQUNmLFVBQWtCLEVBQ2xCLFlBQXNCO0lBRXRCLElBQUk7UUFDRixNQUFNLEtBQUssR0FBb0I7WUFDN0IsRUFBRSxFQUFFLFNBQVMsTUFBTSxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDOUMsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ25DLE1BQU07WUFDTixTQUFTLEVBQUUsYUFBYTtZQUN4QixPQUFPLEVBQUUsU0FBUyxNQUFNLElBQUksT0FBTyxFQUFFO1lBQ3JDLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLFlBQVk7WUFDWixhQUFhLEVBQUUsV0FBVyxDQUFDLG1DQUFtQztTQUMvRCxDQUFDO1FBRUYsd0VBQXdFO1FBQ3hFLG9FQUFvRTtRQUNwRSxPQUFPLENBQUMsR0FBRyxDQUFDLDJDQUEyQyxNQUFNLEdBQUcsRUFBRTtZQUNoRSxPQUFPO1lBQ1AsVUFBVTtZQUNWLGdCQUFnQixFQUFFLFlBQVksQ0FBQyxNQUFNO1NBQ3RDLENBQUMsQ0FBQztRQUVILG1EQUFtRDtRQUNuRCxNQUFNLGtCQUFrQixDQUFDLGFBQWEsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FFeEQ7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNk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QUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLGtCQUFrQixDQUFDLFNBQWlCLEVBQUUsTUFBYyxFQUFFLFNBQWM7SUFDakYsSUFBSTtRQUNGLG1GQUFtRjtRQUNuRixtRUFBbUU7UUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsU0FBUyxFQUFFLEVBQUU7WUFDekMsTUFBTTtZQUNOLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUM7U0FDckMsQ0FBQyxDQUFDO0tBQ0o7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckQsa0NBQWtDO0tBQ25DO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBBcHBTeW5jIFJlYWwtdGltZSBFdmVudCBQdWJsaXNoZXJcclxuICogUHVibGlzaGVzIGV2ZW50cyB0byBBcHBTeW5jIHN1YnNjcmlwdGlvbnMgZm9yIHJlYWwtdGltZSB1cGRhdGVzXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcclxuXHJcbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XHJcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNYXRjaEZvdW5kRXZlbnQge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgZXZlbnRUeXBlOiAnTUFUQ0hfRk9VTkQnO1xyXG4gIG1hdGNoSWQ6IHN0cmluZztcclxuICBtZWRpYUlkOiBzdHJpbmc7XHJcbiAgbWVkaWFUaXRsZTogc3RyaW5nO1xyXG4gIHBhcnRpY2lwYW50czogc3RyaW5nW107XHJcbiAgY29uc2Vuc3VzVHlwZTogJ1VOQU5JTU9VUycgfCAnTUFKT1JJVFknO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFZvdGVVcGRhdGVFdmVudCB7XHJcbiAgaWQ6IHN0cmluZztcclxuICB0aW1lc3RhbXA6IHN0cmluZztcclxuICByb29tSWQ6IHN0cmluZztcclxuICBldmVudFR5cGU6ICdWT1RFX1VQREFURSc7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgbWVkaWFJZDogc3RyaW5nO1xyXG4gIHZvdGVUeXBlOiAnTElLRScgfCAnRElTTElLRScgfCAnU0tJUCc7XHJcbiAgcHJvZ3Jlc3M6IHtcclxuICAgIHRvdGFsVm90ZXM6IG51bWJlcjtcclxuICAgIGxpa2VzQ291bnQ6IG51bWJlcjtcclxuICAgIGRpc2xpa2VzQ291bnQ6IG51bWJlcjtcclxuICAgIHNraXBzQ291bnQ6IG51bWJlcjtcclxuICAgIHJlbWFpbmluZ1VzZXJzOiBudW1iZXI7XHJcbiAgICBwZXJjZW50YWdlOiBudW1iZXI7XHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFB1Ymxpc2ggTWF0Y2ggRm91bmQgZXZlbnQgdG8gYWxsIHJvb20gc3Vic2NyaWJlcnNcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwdWJsaXNoTWF0Y2hGb3VuZEV2ZW50KFxyXG4gIHJvb21JZDogc3RyaW5nLFxyXG4gIG1vdmllSWQ6IHN0cmluZyxcclxuICBtb3ZpZVRpdGxlOiBzdHJpbmcsXHJcbiAgcGFydGljaXBhbnRzOiBzdHJpbmdbXVxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZXZlbnQ6IE1hdGNoRm91bmRFdmVudCA9IHtcclxuICAgICAgaWQ6IGBtYXRjaF8ke3Jvb21JZH1fJHttb3ZpZUlkfV8ke0RhdGUubm93KCl9YCxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgZXZlbnRUeXBlOiAnTUFUQ0hfRk9VTkQnLFxyXG4gICAgICBtYXRjaElkOiBgbWF0Y2hfJHtyb29tSWR9XyR7bW92aWVJZH1gLFxyXG4gICAgICBtZWRpYUlkOiBtb3ZpZUlkLFxyXG4gICAgICBtZWRpYVRpdGxlOiBtb3ZpZVRpdGxlLFxyXG4gICAgICBwYXJ0aWNpcGFudHMsXHJcbiAgICAgIGNvbnNlbnN1c1R5cGU6ICdVTkFOSU1PVVMnIC8vIFRyaW5pdHkgdXNlcyB1bmFuaW1vdXMgY29uc2Vuc3VzXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEVuIEFwcFN5bmMsIGxvcyBldmVudG9zIHNlIHB1YmxpY2FuIGF1dG9tw6F0aWNhbWVudGUgYSBsb3Mgc3Vic2NyaWJlcnNcclxuICAgIC8vIGN1YW5kbyBzZSBlamVjdXRhIGxhIG11dGF0aW9uIHB1Ymxpc2hNYXRjaEV2ZW50IGRlc2RlIGVsIHJlc29sdmVyXHJcbiAgICBjb25zb2xlLmxvZyhg8J+OiSBNQVRDSF9GT1VORCBFdmVudCBwdWJsaXNoZWQgZm9yIHJvb20gJHtyb29tSWR9OmAsIHtcclxuICAgICAgbW92aWVJZCxcclxuICAgICAgbW92aWVUaXRsZSxcclxuICAgICAgcGFydGljaXBhbnRDb3VudDogcGFydGljaXBhbnRzLmxlbmd0aFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIFN0b3JlIHRoZSBtYXRjaCBldmVudCBmb3IgYXVkaXQvaGlzdG9yeSBwdXJwb3Nlc1xyXG4gICAgYXdhaXQgc3RvcmVFdmVudEZvckF1ZGl0KCdNQVRDSF9GT1VORCcsIHJvb21JZCwgZXZlbnQpO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwdWJsaXNoaW5nIG1hdGNoIGZvdW5kIGV2ZW50OicsIGVycm9yKTtcclxuICAgIC8vIERvbid0IHRocm93IC0gcmVhbC10aW1lIG5vdGlmaWNhdGlvbnMgYXJlIG5pY2UtdG8taGF2ZSwgbm90IGNyaXRpY2FsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHVibGlzaCBWb3RlIFVwZGF0ZSBldmVudCB0byByb29tIHN1YnNjcmliZXJzXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHVibGlzaFZvdGVVcGRhdGVFdmVudChcclxuICByb29tSWQ6IHN0cmluZyxcclxuICB1c2VySWQ6IHN0cmluZyxcclxuICBtb3ZpZUlkOiBzdHJpbmcsXHJcbiAgdm90ZVR5cGU6ICdMSUtFJyB8ICdESVNMSUtFJyB8ICdTS0lQJyxcclxuICBjdXJyZW50Vm90ZXM6IG51bWJlcixcclxuICB0b3RhbE1lbWJlcnM6IG51bWJlclxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZXZlbnQ6IFZvdGVVcGRhdGVFdmVudCA9IHtcclxuICAgICAgaWQ6IGB2b3RlXyR7cm9vbUlkfV8ke3VzZXJJZH1fJHtEYXRlLm5vdygpfWAsXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICByb29tSWQsXHJcbiAgICAgIGV2ZW50VHlwZTogJ1ZPVEVfVVBEQVRFJyxcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBtZWRpYUlkOiBtb3ZpZUlkLFxyXG4gICAgICB2b3RlVHlwZSxcclxuICAgICAgcHJvZ3Jlc3M6IHtcclxuICAgICAgICB0b3RhbFZvdGVzOiBjdXJyZW50Vm90ZXMsXHJcbiAgICAgICAgbGlrZXNDb3VudDogdm90ZVR5cGUgPT09ICdMSUtFJyA/IGN1cnJlbnRWb3RlcyA6IDAsIC8vIFNpbXBsaWZpZWQgZm9yIFRyaW5pdHlcclxuICAgICAgICBkaXNsaWtlc0NvdW50OiAwLFxyXG4gICAgICAgIHNraXBzQ291bnQ6IDAsXHJcbiAgICAgICAgcmVtYWluaW5nVXNlcnM6IE1hdGgubWF4KDAsIHRvdGFsTWVtYmVycyAtIGN1cnJlbnRWb3RlcyksXHJcbiAgICAgICAgcGVyY2VudGFnZTogdG90YWxNZW1iZXJzID4gMCA/IChjdXJyZW50Vm90ZXMgLyB0b3RhbE1lbWJlcnMpICogMTAwIDogMFxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5ez77iPIFZPVEVfVVBEQVRFIEV2ZW50IHB1Ymxpc2hlZCBmb3Igcm9vbSAke3Jvb21JZH06YCwge1xyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIHByb2dyZXNzOiBgJHtjdXJyZW50Vm90ZXN9LyR7dG90YWxNZW1iZXJzfSAoJHtldmVudC5wcm9ncmVzcy5wZXJjZW50YWdlLnRvRml4ZWQoMSl9JSlgXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gU3RvcmUgdGhlIHZvdGUgZXZlbnQgZm9yIGF1ZGl0L2hpc3RvcnkgcHVycG9zZXNcclxuICAgIGF3YWl0IHN0b3JlRXZlbnRGb3JBdWRpdCgnVk9URV9VUERBVEUnLCByb29tSWQsIGV2ZW50KTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHVibGlzaGluZyB2b3RlIHVwZGF0ZSBldmVudDonLCBlcnJvcik7XHJcbiAgICAvLyBEb24ndCB0aHJvdyAtIHJlYWwtdGltZSBub3RpZmljYXRpb25zIGFyZSBuaWNlLXRvLWhhdmUsIG5vdCBjcml0aWNhbFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBtb3ZpZSB0aXRsZSBmcm9tIGNhY2hlIG9yIFRNREIgSURcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRNb3ZpZVRpdGxlKG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIFRyeSB0byBnZXQgbW92aWUgdGl0bGUgZnJvbSBjYWNoZVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVTX0NBQ0hFX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHRtZGJJZDogYG1vdmllXyR7bW92aWVJZH1gIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKHJlc3BvbnNlLkl0ZW0/Lm1vdmllcykge1xyXG4gICAgICBjb25zdCBtb3ZpZXMgPSByZXNwb25zZS5JdGVtLm1vdmllcztcclxuICAgICAgY29uc3QgbW92aWUgPSBtb3ZpZXMuZmluZCgobTogYW55KSA9PiBtLmlkID09PSBtb3ZpZUlkKTtcclxuICAgICAgaWYgKG1vdmllPy50aXRsZSkge1xyXG4gICAgICAgIHJldHVybiBtb3ZpZS50aXRsZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIGdlbmVyaWMgdGl0bGVcclxuICAgIHJldHVybiBgTW92aWUgJHttb3ZpZUlkfWA7XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZ2V0dGluZyBtb3ZpZSB0aXRsZTonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gYE1vdmllICR7bW92aWVJZH1gO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFN0b3JlIGV2ZW50IGZvciBhdWRpdCB0cmFpbCBhbmQgZGVidWdnaW5nXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBzdG9yZUV2ZW50Rm9yQXVkaXQoZXZlbnRUeXBlOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nLCBldmVudERhdGE6IGFueSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIHRyeSB7XHJcbiAgICAvLyBJbiBhIHByb2R1Y3Rpb24gc3lzdGVtLCB5b3UgbWlnaHQgd2FudCB0byBzdG9yZSBldmVudHMgaW4gYSBzZXBhcmF0ZSBhdWRpdCB0YWJsZVxyXG4gICAgLy8gRm9yIG5vdywgd2UnbGwganVzdCBsb2cgdGhlbSB3aXRoIHN0cnVjdHVyZWQgZGF0YSBmb3IgQ2xvdWRXYXRjaFxyXG4gICAgY29uc29sZS5sb2coYPCfk4ogQVVESVRfRVZFTlQ6JHtldmVudFR5cGV9YCwge1xyXG4gICAgICByb29tSWQsXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBldmVudERhdGE6IEpTT04uc3RyaW5naWZ5KGV2ZW50RGF0YSlcclxuICAgIH0pO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBzdG9yaW5nIGF1ZGl0IGV2ZW50OicsIGVycm9yKTtcclxuICAgIC8vIERvbid0IHRocm93IC0gYXVkaXQgaXMgb3B0aW9uYWxcclxuICB9XHJcbn0iXX0=