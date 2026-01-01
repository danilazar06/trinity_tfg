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
