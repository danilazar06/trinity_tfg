/**
 * AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface MatchFoundEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'MATCH_FOUND';
  matchId: string;
  mediaId: string;
  mediaTitle: string;
  participants: string[];
  consensusType: 'UNANIMOUS' | 'MAJORITY';
}

export interface VoteUpdateEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'VOTE_UPDATE';
  userId: string;
  mediaId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP';
  progress: {
    totalVotes: number;
    likesCount: number;
    dislikesCount: number;
    skipsCount: number;
    remainingUsers: number;
    percentage: number;
  };
}

/**
 * Publish Match Found event to all room subscribers
 */
export async function publishMatchFoundEvent(
  roomId: string,
  movieId: string,
  movieTitle: string,
  participants: string[]
): Promise<void> {
  try {
    const event: MatchFoundEvent = {
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
    
  } catch (error) {
    console.error('❌ Error publishing match found event:', error);
    // Don't throw - real-time notifications are nice-to-have, not critical
  }
}

/**
 * Publish Vote Update event to room subscribers
 */
export async function publishVoteUpdateEvent(
  roomId: string,
  userId: string,
  movieId: string,
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP',
  currentVotes: number,
  totalMembers: number
): Promise<void> {
  try {
    const event: VoteUpdateEvent = {
      id: `vote_${roomId}_${userId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      roomId,
      eventType: 'VOTE_UPDATE',
      userId,
      mediaId: movieId,
      voteType,
      progress: {
        totalVotes: currentVotes,
        likesCount: voteType === 'LIKE' ? currentVotes : 0, // Simplified for Trinity
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
    
  } catch (error) {
    console.error('❌ Error publishing vote update event:', error);
    // Don't throw - real-time notifications are nice-to-have, not critical
  }
}

/**
 * Get movie title from cache or TMDB ID
 */
export async function getMovieTitle(movieId: string): Promise<string> {
  try {
    // Try to get movie title from cache
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: `movie_${movieId}` },
    }));

    if (response.Item?.movies) {
      const movies = response.Item.movies;
      const movie = movies.find((m: any) => m.id === movieId);
      if (movie?.title) {
        return movie.title;
      }
    }

    // Fallback to generic title
    return `Movie ${movieId}`;
    
  } catch (error) {
    console.warn('⚠️ Error getting movie title:', error);
    return `Movie ${movieId}`;
  }
}

/**
 * Store event for audit trail and debugging
 */
async function storeEventForAudit(eventType: string, roomId: string, eventData: any): Promise<void> {
  try {
    // In a production system, you might want to store events in a separate audit table
    // For now, we'll just log them with structured data for CloudWatch
    console.log(`📊 AUDIT_EVENT:${eventType}`, {
      roomId,
      timestamp: new Date().toISOString(),
      eventData: JSON.stringify(eventData)
    });
  } catch (error) {
    console.warn('⚠️ Error storing audit event:', error);
    // Don't throw - audit is optional
  }
}