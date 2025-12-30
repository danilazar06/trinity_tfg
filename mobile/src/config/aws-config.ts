/**
 * AWS Configuration for Trinity Mobile App
 * Production values from deployed infrastructure
 */

export interface AWSConfig {
  region: string;
  graphqlEndpoint: string;
  userPoolId: string;
  userPoolWebClientId: string;
  identityPoolId?: string;
}

// Production AWS Configuration
export const AWS_CONFIG: AWSConfig = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_6UxioIj4z',
  userPoolWebClientId: '59dpqsm580j14ulkcha19shl64', // From CDK deployment
  // identityPoolId: 'YOUR_IDENTITY_POOL_ID', // Optional for unauthenticated access
};

// Environment detection
export const getAWSConfig = (): AWSConfig => {
  if (__DEV__) {
    console.log('🔧 Using AWS Production Config in Development Mode');
    console.log('📍 Region:', AWS_CONFIG.region);
    console.log('🔗 GraphQL Endpoint:', AWS_CONFIG.graphqlEndpoint);
    console.log('👤 User Pool ID:', AWS_CONFIG.userPoolId);
  }
  
  return AWS_CONFIG;
};

// GraphQL Queries and Mutations
export const GRAPHQL_OPERATIONS = {
  // Mutations
  CREATE_ROOM: `
    mutation CreateRoom($input: CreateRoomInput!) {
      createRoom(input: $input) {
        id
        name
        hostId
        status
        inviteCode
        createdAt
      }
    }
  `,
  
  JOIN_ROOM: `
    mutation JoinRoom($inviteCode: String!) {
      joinRoom(inviteCode: $inviteCode) {
        id
        name
        hostId
        status
        inviteCode
      }
    }
  `,
  
  VOTE: `
    mutation Vote($roomId: ID!, $movieId: String!) {
      vote(roomId: $roomId, movieId: $movieId) {
        id
        status
        resultMovieId
        hostId
      }
    }
  `,
  
  GET_AI_RECOMMENDATIONS: `
    mutation GetAIRecommendations($userText: String!) {
      getAIRecommendations(userText: $userText) {
        chatResponse
        recommendedGenres
        recommendedMovies {
          id
          title
          overview
          poster_path
          vote_average
          release_date
        }
      }
    }
  `,
  
  // Queries
  GET_ROOM: `
    query GetRoom($roomId: ID!) {
      getRoom(roomId: $roomId) {
        id
        name
        hostId
        status
        inviteCode
        resultMovieId
        createdAt
        updatedAt
      }
    }
  `,
  
  GET_USER_ROOMS: `
    query GetUserRooms {
      getUserRooms {
        id
        name
        hostId
        status
        memberCount
        createdAt
      }
    }
  `,
  
  GET_MOVIE_DETAILS: `
    query GetMovieDetails($movieId: String!) {
      getMovieDetails(movieId: $movieId) {
        id
        title
        overview
        poster_path
        backdrop_path
        vote_average
        release_date
        genres {
          id
          name
        }
        runtime
      }
    }
  `,
  
  // Subscriptions
  ON_VOTE_UPDATE: `
    subscription OnVoteUpdate($roomId: ID!) {
      onVoteUpdate(roomId: $roomId) {
        roomId
        userId
        movieId
        voteType
        currentVotes
        totalMembers
        timestamp
      }
    }
  `,
  
  ON_MATCH_FOUND: `
    subscription OnMatchFound($roomId: ID!) {
      onMatchFound(roomId: $roomId) {
        roomId
        movieId
        movieTitle
        participants
        timestamp
      }
    }
  `,
  
  ON_ROOM_UPDATE: `
    subscription OnRoomUpdate($roomId: ID!) {
      onRoomUpdate(roomId: $roomId) {
        id
        status
        resultMovieId
        memberCount
        updatedAt
      }
    }
  `
};

export default AWS_CONFIG;