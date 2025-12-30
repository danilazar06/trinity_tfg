/**
 * AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates
 */
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
export declare function publishMatchFoundEvent(roomId: string, movieId: string, movieTitle: string, participants: string[]): Promise<void>;
/**
 * Publish Vote Update event to room subscribers
 */
export declare function publishVoteUpdateEvent(roomId: string, userId: string, movieId: string, voteType: 'LIKE' | 'DISLIKE' | 'SKIP', currentVotes: number, totalMembers: number): Promise<void>;
/**
 * Get movie title from cache or TMDB ID
 */
export declare function getMovieTitle(movieId: string): Promise<string>;
