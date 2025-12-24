# Trinity MVP - Design Specification

## System Architecture

### High-Level Architecture
Trinity follows a serverless microservices architecture on AWS with clean separation of concerns:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App    │    │    Web Client    │    │  Admin Panel    │
│  (React Native) │    │   (Future)       │    │   (Future)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │     AWS AppSync         │
                    │   (GraphQL Gateway)     │
                    └─────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Lambda   │    │   Room Lambda   │    │  Movie Lambda   │
│   (Cognito)     │    │ (Shuffle&Sync)  │    │   (TMDB API)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │      DynamoDB           │
                    │   (Multi-Table)         │
                    └─────────────────────────┘
```

### Backend Architecture (NestJS)

#### Clean Architecture Layers
```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Controllers   │  │   GraphQL       │  │   Guards    │ │
│  │   (REST API)    │  │   Resolvers     │  │   (JWT)     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │    Services     │  │   Use Cases     │  │    DTOs     │ │
│  │  (Business)     │  │   (Workflows)   │  │ (Validation)│ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                     Domain Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │    Entities     │  │   Interfaces    │  │   Events    │ │
│  │  (Core Models)  │  │  (Contracts)    │  │ (Domain)    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   DynamoDB      │  │   AWS Cognito   │  │   TMDB API  │ │
│  │   (Database)    │  │   (Auth)        │  │  (External) │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Database Design

### DynamoDB Multi-Table Strategy
Trinity uses 5 specialized DynamoDB tables for optimal performance:

#### 1. Users Table
```typescript
interface User {
  PK: string;           // USER#{userId}
  SK: string;           // PROFILE
  userId: string;
  email: string;
  cognitoId: string;
  createdAt: string;
  lastActiveAt: string;
  preferences?: UserPreferences;
}
```

#### 2. Rooms Table
```typescript
interface Room {
  PK: string;           // ROOM#{roomId}
  SK: string;           // METADATA
  roomId: string;
  name: string;
  adminId: string;
  status: 'active' | 'paused' | 'finished';
  settings: RoomSettings;
  createdAt: string;
  updatedAt: string;
}
```

#### 3. Room Members Table
```typescript
interface RoomMember {
  PK: string;           // ROOM#{roomId}
  SK: string;           // MEMBER#{userId}
  roomId: string;
  userId: string;
  role: 'admin' | 'moderator' | 'member';
  status: 'active' | 'inactive' | 'left';
  joinedAt: string;
  lastActiveAt: string;
}
```

#### 4. Votes Table
```typescript
interface Vote {
  PK: string;           // ROOM#{roomId}
  SK: string;           // VOTE#{userId}#{contentId}
  roomId: string;
  userId: string;
  contentId: string;
  vote: 'like' | 'dislike';
  timestamp: string;
  sessionId: string;
}
```

#### 5. Movies Cache Table
```typescript
interface MovieCache {
  PK: string;           // MOVIE#{tmdbId}
  SK: string;           // DETAILS
  tmdbId: string;
  title: string;
  overview: string;
  genres: Genre[];
  posterPath: string;
  releaseDate: string;
  cachedAt: string;
  ttl: number;
}
```

### Access Patterns
- **Get User Profile**: Query Users table with PK=USER#{userId}
- **Get Room Details**: Query Rooms table with PK=ROOM#{roomId}
- **Get Room Members**: Query RoomMembers table with PK=ROOM#{roomId}
- **Get User Votes**: Query Votes table with PK=ROOM#{roomId}, SK begins_with VOTE#{userId}
- **Get Movie Details**: Query MoviesCache table with PK=MOVIE#{tmdbId}

## Core Algorithms

### Shuffle & Sync Algorithm
The heart of Trinity's fairness system:

```typescript
class ShuffleSyncService {
  async generateMasterList(roomId: string): Promise<string[]> {
    // 1. Fetch content from TMDB API
    const content = await this.tmdbService.getPopularMovies();
    
    // 2. Create deterministic master list
    const masterList = content.map(movie => movie.id);
    
    // 3. Store master list with timestamp
    await this.storeMasterList(roomId, masterList);
    
    return masterList;
  }

  async generateUserList(roomId: string, userId: string): Promise<string[]> {
    // 1. Get master list
    const masterList = await this.getMasterList(roomId);
    
    // 2. Create user-specific seed
    const seed = this.createSeed(roomId, userId);
    
    // 3. Shuffle using seeded random
    const userList = this.seededShuffle(masterList, seed);
    
    return userList;
  }

  private createSeed(roomId: string, userId: string): string {
    return `${roomId}-${userId}-${Date.now()}`;
  }
}
```

### Consensus Detection Algorithm
Automatic match detection when all active members vote positively:

```typescript
class MatchService {
  async detectConsensus(roomId: string, contentId: string): Promise<boolean> {
    // 1. Get all active members
    const activeMembers = await this.getActiveMembers(roomId);
    
    // 2. Get all votes for this content
    const votes = await this.getVotesForContent(roomId, contentId);
    
    // 3. Check if all active members voted positively
    const positiveVotes = votes.filter(vote => vote.vote === 'like');
    const hasConsensus = positiveVotes.length === activeMembers.length;
    
    if (hasConsensus) {
      await this.createMatch(roomId, contentId, positiveVotes);
    }
    
    return hasConsensus;
  }
}
```

### Semantic Analysis Algorithm
AI-powered content similarity and injection:

```typescript
class SemanticAnalysisService {
  async analyzePreferences(roomId: string): Promise<PreferencePattern> {
    // 1. Get all positive votes
    const positiveVotes = await this.getPositiveVotes(roomId);
    
    // 2. Extract content metadata
    const contentMetadata = await this.getContentMetadata(positiveVotes);
    
    // 3. Calculate preference vectors
    const preferenceVector = this.calculatePreferenceVector(contentMetadata);
    
    return preferenceVector;
  }

  async findSimilarContent(preferenceVector: PreferenceVector): Promise<string[]> {
    // 1. Get candidate content
    const candidates = await this.tmdbService.searchContent();
    
    // 2. Calculate similarity scores
    const similarities = candidates.map(content => ({
      id: content.id,
      score: this.calculateSimilarity(preferenceVector, content.metadata)
    }));
    
    // 3. Return top matches
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.id);
  }
}
```

## AI Integration Design

### Salamandra AI Architecture
Integration with Spanish sovereign AI for emotional recommendations:

```typescript
class ALIAService {
  async getChatRecommendations(userText: string): Promise<AIRecommendation> {
    try {
      // 1. Analyze emotional state
      const emotionalState = await this.analyzeEmotion(userText);
      
      // 2. Get genre recommendations from Salamandra
      const genreRecommendations = await this.getGenreRecommendations(
        userText, 
        emotionalState
      );
      
      // 3. Convert genres to specific movies
      const movieIds = await this.convertGenresToMovies(genreRecommendations);
      
      return {
        movies: movieIds,
        reasoning: genreRecommendations.reasoning,
        confidence: genreRecommendations.confidence,
        emotionalState,
        suggestedGenres: genreRecommendations.genres
      };
    } catch (error) {
      // Fallback to default recommendations
      return this.getFallbackRecommendations();
    }
  }
}
```

### AI Prompt Engineering
Optimized prompts for Salamandra model:

```typescript
const EMOTION_ANALYSIS_PROMPT = `
Eres un asistente de IA especializado en análisis emocional y recomendaciones de entretenimiento.

Analiza el siguiente texto del usuario y determina:
1. Su estado emocional actual
2. Géneros cinematográficos que podrían ayudar o complementar ese estado
3. Razón de la recomendación

Texto del usuario: "{userText}"

Responde en formato JSON con esta estructura:
{
  "emotionalState": "estado_emocional",
  "suggestedGenres": ["genero1", "genero2", "genero3"],
  "reasoning": "explicación_breve",
  "confidence": 0.85
}
`;
```

## API Design

### RESTful API Structure
```
/api/v1/
├── auth/
│   ├── POST /register
│   ├── POST /login
│   ├── POST /refresh
│   └── GET /profile
├── rooms/
│   ├── POST /
│   ├── GET /:id
│   ├── POST /:id/join
│   ├── DELETE /:id/leave
│   └── GET /:id/members
├── votes/
│   ├── POST /rooms/:roomId/votes
│   └── GET /rooms/:roomId/votes
├── matches/
│   └── GET /rooms/:roomId/matches
├── ai/
│   ├── POST /chat-recommendations
│   └── GET /health
└── cdn/
    ├── POST /optimize-image
    └── GET /cache-stats
```

### GraphQL Schema
```graphql
type User {
  id: ID!
  email: String!
  createdAt: String!
  rooms: [Room!]!
}

type Room {
  id: ID!
  name: String!
  adminId: String!
  status: RoomStatus!
  members: [RoomMember!]!
  matches: [Match!]!
  createdAt: String!
}

type Vote {
  id: ID!
  userId: String!
  contentId: String!
  vote: VoteType!
  timestamp: String!
}

type Match {
  id: ID!
  roomId: String!
  contentId: String!
  participants: [String!]!
  createdAt: String!
}

type AIRecommendation {
  movies: [String!]!
  reasoning: String!
  confidence: Float!
  emotionalState: String!
  suggestedGenres: [String!]!
}
```

## Security Design

### Authentication Flow
```
1. User Registration
   ├── Frontend → AWS Cognito
   ├── Email Verification
   └── JWT Token Generation

2. User Login
   ├── Frontend → AWS Cognito
   ├── Credential Validation
   └── JWT Token + Refresh Token

3. API Access
   ├── JWT Token in Authorization Header
   ├── Token Validation in Guards
   └── User Context Injection
```

### Authorization Matrix
```
| Resource    | Admin | Moderator | Member | Guest |
|-------------|-------|-----------|--------|-------|
| Create Room | ✅    | ✅        | ✅     | ❌    |
| Join Room   | ✅    | ✅        | ✅     | ❌    |
| Vote        | ✅    | ✅        | ✅     | ❌    |
| Kick Member | ✅    | ✅        | ❌     | ❌    |
| Delete Room | ✅    | ❌        | ❌     | ❌    |
```

## Performance Design

### Caching Strategy
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │   Application   │    │    DynamoDB     │
│   (CDN Cache)   │    │     Cache       │    │   (Database)    │
│                 │    │                 │    │                 │
│ • Images: 24h   │    │ • User: 15min   │    │ • TTL: 7 days   │
│ • Static: 1h    │    │ • Room: 5min    │    │ • Auto-expire   │
│ • API: 5min     │    │ • Movies: 1h    │    │ • Lazy refresh  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Circuit Breaker Pattern
```typescript
class CircuitBreakerService {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

## Testing Strategy

### Property-Based Testing with fast-check
```typescript
describe('ShuffleSyncService', () => {
  it('should maintain list integrity across shuffles', () => {
    fc.assert(fc.property(
      fc.array(fc.string(), { minLength: 10, maxLength: 100 }),
      fc.string(),
      (masterList, userId) => {
        const shuffled = service.generateUserList(masterList, userId);
        
        // Property: Same elements, different order
        expect(shuffled.sort()).toEqual(masterList.sort());
        expect(shuffled).not.toEqual(masterList);
      }
    ));
  });
});
```

### Integration Testing
```typescript
describe('Room Workflow Integration', () => {
  it('should complete full room lifecycle', async () => {
    // 1. Create room
    const room = await roomService.create(createRoomDto);
    
    // 2. Add members
    await roomService.addMember(room.id, user1.id);
    await roomService.addMember(room.id, user2.id);
    
    // 3. Generate shuffle lists
    await shuffleService.generateLists(room.id);
    
    // 4. Submit votes
    await voteService.vote(room.id, user1.id, 'movie1', 'like');
    await voteService.vote(room.id, user2.id, 'movie1', 'like');
    
    // 5. Verify match creation
    const matches = await matchService.getMatches(room.id);
    expect(matches).toHaveLength(1);
  });
});
```

## Deployment Architecture

### AWS CDK Infrastructure
```typescript
export class TrinityStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const tables = this.createDynamoTables();
    
    // Lambda Functions
    const lambdas = this.createLambdaFunctions(tables);
    
    // AppSync API
    const api = this.createAppSyncAPI(lambdas);
    
    // Cognito User Pool
    const userPool = this.createCognitoUserPool();
    
    // CloudFront Distribution
    const cdn = this.createCloudFrontDistribution();
  }
}
```

### Environment Configuration
```yaml
Development:
  - Local DynamoDB
  - Mock external APIs
  - Debug logging
  - Hot reload

Staging:
  - AWS DynamoDB
  - Real external APIs
  - Info logging
  - Blue/Green deployment

Production:
  - AWS DynamoDB with backups
  - Real external APIs
  - Error logging only
  - Canary deployment
```

## Monitoring & Observability

### Metrics Collection
```typescript
class MetricsService {
  async recordVote(roomId: string, userId: string, vote: string) {
    await this.cloudWatch.putMetricData({
      Namespace: 'Trinity/Voting',
      MetricData: [{
        MetricName: 'VoteSubmitted',
        Value: 1,
        Dimensions: [
          { Name: 'RoomId', Value: roomId },
          { Name: 'VoteType', Value: vote }
        ]
      }]
    });
  }
}
```

### Health Checks
```typescript
@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkTMDBAPI(),
      this.checkSalamandraAI(),
      this.checkCognito()
    ]);
    
    return {
      status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'unhealthy',
      checks: checks.map(this.formatCheck),
      timestamp: new Date().toISOString()
    };
  }
}
```

---

**Document Version**: 1.0  
**Last Updated**: December 24, 2024  
**Status**: Living document - updated as implementation evolves  
**Next Review**: After Task 11 completion and architecture validation