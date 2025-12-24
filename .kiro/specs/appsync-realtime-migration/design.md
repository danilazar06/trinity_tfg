# Design Document: AppSync Real-time Migration

## Overview

This design document outlines the migration from Socket.IO WebSockets to AWS AppSync Subscriptions for real-time functionality in the Trinity MVP platform. The migration leverages AWS AppSync's native GraphQL subscriptions to provide better performance, lower costs, automatic scaling, and seamless integration with the existing GraphQL infrastructure.

The design maintains all existing real-time functionality while improving the architecture through AWS-native services, eliminating the need for custom WebSocket management, and providing better observability and monitoring capabilities.

## Architecture

### Current Architecture (Socket.IO)
```
Client ↔ NestJS RealtimeGateway (Socket.IO) ↔ RealtimeService ↔ Business Services
```

### New Architecture (AppSync Subscriptions)
```
Client ↔ AWS AppSync (GraphQL Subscriptions) ↔ Lambda Resolvers ↔ Business Services
```

### Key Architectural Changes

1. **Connection Management**: AppSync handles all connection lifecycle, authentication, and scaling
2. **Event Publishing**: Business services publish events to AppSync via Lambda resolvers
3. **Subscription Filtering**: AppSync provides built-in filtering by roomId, userId, and event type
4. **Authentication**: Cognito JWT tokens are validated natively by AppSync
5. **Monitoring**: CloudWatch provides comprehensive metrics and logging

## Components and Interfaces

### 1. AppSync GraphQL Schema Extensions

#### Subscription Types
```graphql
type Subscription {
  # Room-level subscriptions
  onRoomEvent(roomId: ID!): RoomEvent
  onVoteUpdate(roomId: ID!): VoteEvent
  onMatchFound(roomId: ID!): MatchEvent
  onMemberUpdate(roomId: ID!): MemberEvent
  
  # Advanced features
  onRoleAssignment(roomId: ID!): RoleEvent
  onModerationAction(roomId: ID!): ModerationEvent
  onScheduleEvent(roomId: ID!): ScheduleEvent
  onThemeChange(roomId: ID!): ThemeEvent
  onSettingsChange(roomId: ID!): SettingsEvent
  
  # Collaboration features
  onChatMessage(roomId: ID!): ChatEvent
  onContentSuggestion(roomId: ID!): SuggestionEvent
  
  # User-specific subscriptions
  onUserNotification(userId: ID!): UserNotification
}
```

#### Event Types
```graphql
interface BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
}

type RoomEvent implements BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  data: AWSJSON!
}

type VoteEvent implements BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  userId: ID!
  mediaId: ID!
  voteType: VoteType!
  progress: VoteProgress!
}

type MatchEvent implements BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  matchId: ID!
  mediaId: ID!
  mediaTitle: String!
  participants: [ID!]!
}

type MemberEvent implements BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  userId: ID!
  action: MemberAction!
  memberCount: Int!
}

type ChatEvent implements BaseEvent {
  id: ID!
  timestamp: AWSDateTime!
  roomId: ID!
  eventType: String!
  messageId: ID!
  userId: ID!
  content: String
  messageType: ChatMessageType!
  action: ChatAction!
}

enum VoteType {
  LIKE
  DISLIKE
  SKIP
}

enum MemberAction {
  JOINED
  LEFT
  STATUS_CHANGED
  ROLE_CHANGED
}

enum ChatAction {
  CREATED
  EDITED
  DELETED
  REACTION_ADDED
  REACTION_REMOVED
}
```

### 2. Lambda Resolvers

#### Subscription Resolvers
```typescript
// Real-time event publisher resolver
export const publishRoomEvent = async (event: AppSyncResolverEvent) => {
  const { roomId, eventType, data } = event.arguments;
  
  // Validate user permissions
  const userId = event.identity.sub;
  await validateRoomMembership(userId, roomId);
  
  // Publish event to AppSync
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType,
    data: JSON.stringify(data)
  };
  
  return eventData;
};

// Subscription filter resolver
export const roomEventFilter = async (event: AppSyncResolverEvent) => {
  const { roomId } = event.arguments;
  const userId = event.identity.sub;
  
  // Verify user has access to room events
  const hasAccess = await checkRoomAccess(userId, roomId);
  
  return {
    roomId: { eq: roomId },
    // Additional filtering based on user permissions
    ...(await getPermissionFilters(userId, roomId))
  };
};
```

### 3. AppSync Publisher Service

#### RealtimePublisher (replaces RealtimeService)
```typescript
@Injectable()
export class RealtimePublisher {
  constructor(
    private appSyncClient: AppSyncClient,
    private logger: Logger
  ) {}

  async publishVoteUpdate(roomId: string, voteData: VoteEventData): Promise<void> {
    try {
      await this.appSyncClient.publish({
        subscription: 'onVoteUpdate',
        data: {
          id: generateEventId(),
          timestamp: new Date().toISOString(),
          roomId,
          eventType: 'VOTE_UPDATE',
          ...voteData
        }
      });
      
      this.logger.log(`🗳️ Published vote update to room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to publish vote update: ${error.message}`);
      // Implement fallback or retry logic
    }
  }

  async publishMatchFound(roomId: string, matchData: MatchEventData): Promise<void> {
    try {
      await this.appSyncClient.publish({
        subscription: 'onMatchFound',
        data: {
          id: generateEventId(),
          timestamp: new Date().toISOString(),
          roomId,
          eventType: 'MATCH_FOUND',
          ...matchData
        }
      });
      
      this.logger.log(`🎯 Published match found to room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to publish match: ${error.message}`);
    }
  }

  // Additional publish methods for all event types...
}
```

### 4. Service Integration Layer

#### Updated Business Services
```typescript
// Example: InteractionService integration
@Injectable()
export class InteractionService {
  constructor(
    private realtimePublisher: RealtimePublisher, // Replaced RealtimeService
    // ... other dependencies
  ) {}

  async registerVote(createVoteDto: CreateVoteDto, userId: string): Promise<VoteResult> {
    // Existing vote logic...
    const voteResult = await this.processVote(createVoteDto, userId);
    
    // Publish real-time update via AppSync
    await this.realtimePublisher.publishVoteUpdate(createVoteDto.roomId, {
      userId,
      mediaId: createVoteDto.mediaId,
      voteType: createVoteDto.voteType,
      progress: voteResult.progress
    });
    
    return voteResult;
  }
}
```

## Data Models

### Event Data Structures

```typescript
interface BaseEventData {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: string;
}

interface VoteEventData extends BaseEventData {
  userId: string;
  mediaId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP';
  progress: {
    totalVotes: number;
    likesCount: number;
    dislikesCount: number;
    skipsCount: number;
    remainingUsers: number;
  };
}

interface MatchEventData extends BaseEventData {
  matchId: string;
  mediaId: string;
  mediaTitle: string;
  participants: string[];
  consensusType: 'UNANIMOUS' | 'MAJORITY';
}

interface MemberEventData extends BaseEventData {
  userId: string;
  action: 'JOINED' | 'LEFT' | 'STATUS_CHANGED' | 'ROLE_CHANGED';
  memberCount: number;
  memberData?: {
    role?: string;
    status?: string;
    permissions?: string[];
  };
}

interface ChatEventData extends BaseEventData {
  messageId: string;
  userId: string;
  content?: string;
  messageType: 'TEXT' | 'SYSTEM' | 'REACTION';
  action: 'CREATED' | 'EDITED' | 'DELETED' | 'REACTION_ADDED' | 'REACTION_REMOVED';
  metadata?: {
    editedAt?: string;
    reactions?: Array<{
      emoji: string;
      users: string[];
      count: number;
    }>;
  };
}
```

### AppSync Configuration

```typescript
interface AppSyncConfig {
  apiId: string;
  region: string;
  authType: 'AMAZON_COGNITO_USER_POOLS';
  userPoolConfig: {
    userPoolId: string;
    awsRegion: string;
    defaultAction: 'ALLOW';
  };
  subscriptionConfig: {
    maxConnections: number;
    connectionTtl: number;
    keepAliveInterval: number;
  };
}
```

## Error Handling

### Connection Management
```typescript
class AppSyncConnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  async handleConnectionError(error: AppSyncError): Promise<void> {
    this.logger.error(`AppSync connection error: ${error.message}`);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      
      setTimeout(async () => {
        try {
          await this.reconnect();
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
        } catch (reconnectError) {
          this.reconnectAttempts++;
          await this.handleConnectionError(reconnectError);
        }
      }, delay);
    } else {
      // Max attempts reached, notify user
      this.notifyConnectionFailure();
    }
  }

  async handleSubscriptionError(subscriptionName: string, error: AppSyncError): Promise<void> {
    this.logger.error(`Subscription ${subscriptionName} error: ${error.message}`);
    
    // Implement subscription-specific error handling
    switch (error.code) {
      case 'UNAUTHORIZED':
        await this.refreshAuthToken();
        break;
      case 'SUBSCRIPTION_LIMIT_EXCEEDED':
        await this.handleSubscriptionLimit();
        break;
      default:
        await this.retrySubscription(subscriptionName);
    }
  }
}
```

### Event Publishing Resilience
```typescript
class ReliableEventPublisher {
  private eventQueue: EventData[] = [];
  private isProcessing = false;

  async publishWithRetry(eventData: EventData, maxRetries = 3): Promise<void> {
    let attempts = 0;
    
    while (attempts < maxRetries) {
      try {
        await this.appSyncClient.publish(eventData);
        return;
      } catch (error) {
        attempts++;
        
        if (attempts === maxRetries) {
          // Add to queue for later processing
          this.eventQueue.push(eventData);
          this.logger.error(`Failed to publish event after ${maxRetries} attempts: ${error.message}`);
        } else {
          // Wait before retry with exponential backoff
          await this.delay(1000 * Math.pow(2, attempts - 1));
        }
      }
    }
  }

  async processQueuedEvents(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      try {
        await this.appSyncClient.publish(event);
      } catch (error) {
        // Re-queue if still failing
        this.eventQueue.unshift(event);
        break;
      }
    }
    
    this.isProcessing = false;
  }
}
```

## Testing Strategy

### Unit Testing
- Test AppSync resolver functions with mocked AppSync client
- Test RealtimePublisher methods with various event types
- Test error handling and retry logic
- Test subscription filtering and authorization

### Property-Based Testing
- Verify event delivery consistency across multiple subscribers
- Test connection resilience under various failure scenarios
- Validate subscription filtering with random user/room combinations
- Test event ordering and deduplication

### Integration Testing
- End-to-end subscription flow from business service to client
- Cross-service integration with all real-time event publishers
- Authentication and authorization flow testing
- Performance testing with multiple concurrent subscriptions

### Load Testing
- Test AppSync subscription limits and scaling behavior
- Measure event delivery latency under high load
- Test connection handling with rapid connect/disconnect cycles
- Validate memory usage and resource cleanup

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Event Broadcasting Consistency
*For any* real-time event (vote, match, member change, role assignment, moderation action, schedule event, theme change, settings change, chat message, content suggestion), when the event is published to a room, all active subscribers to that room should receive the event within the specified time limit.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 2: Authentication and Authorization Consistency
*For any* subscription request with a valid Cognito JWT token, the AppSync system should authenticate the user and apply appropriate filtering based on room membership and role permissions.
**Validates: Requirements 1.2, 7.1, 7.2, 7.3, 7.4**

### Property 3: Service Integration Equivalence
*For any* notification method call from business services, the AppSync publisher should successfully publish the event to the corresponding subscription, maintaining functional equivalence with the previous Socket.IO implementation.
**Validates: Requirements 5.1, 5.3, 5.4**

### Property 4: Connection Resilience and Recovery
*For any* connection failure or subscription error, the AppSync system should implement appropriate recovery mechanisms including automatic reconnection, exponential backoff, retry logic, and graceful error handling.
**Validates: Requirements 1.3, 8.1, 8.2, 8.3, 8.4, 8.5**

### Property 5: Event Delivery Performance
*For any* published event, the AppSync system should deliver it to all eligible subscribers within 100ms and track delivery success rates for monitoring purposes.
**Validates: Requirements 6.2, 9.2**

### Property 6: Subscription Filtering Accuracy
*For any* user subscription request, the AppSync system should only deliver events that the user is authorized to receive based on room membership, role permissions, and event sensitivity.
**Validates: Requirements 1.4, 7.2, 7.3**

### Property 7: Token Expiration Handling
*For any* expired JWT token during an active subscription, the AppSync system should handle re-authentication gracefully without losing the subscription context.
**Validates: Requirements 7.5**

### Property 8: Error Logging Completeness
*For any* error that occurs in the AppSync system, detailed error information should be logged with appropriate context for debugging and monitoring purposes.
**Validates: Requirements 9.4**

### Property 9: Test Verification Completeness
*For any* event published during testing, the test suite should verify that all expected subscribers receive the event correctly, ensuring migration completeness.
**Validates: Requirements 10.3**

### Property 10: Performance Equivalence
*For any* performance metric measured in the new AppSync system, it should meet or exceed the corresponding metric from the previous Socket.IO implementation.
**Validates: Requirements 10.5**

## Testing Strategy

### Unit Testing
- **AppSync Resolver Testing**: Test individual Lambda resolvers with mocked AppSync clients
- **Publisher Service Testing**: Test RealtimePublisher methods with various event types and error scenarios
- **Authentication Testing**: Test JWT token validation and user authorization logic
- **Error Handling Testing**: Test connection failure recovery and retry mechanisms
- **Filtering Logic Testing**: Test subscription filtering based on room membership and permissions

### Property-Based Testing
- **Event Broadcasting Consistency**: Generate random events and verify delivery to all subscribers
- **Authentication Flow Testing**: Test with random valid/invalid JWT tokens and verify appropriate responses
- **Service Integration Testing**: Test all business service integration points with random event data
- **Connection Resilience Testing**: Simulate random connection failures and verify recovery behavior
- **Performance Testing**: Measure event delivery times across random event types and subscriber counts
- **Filtering Accuracy Testing**: Test subscription filtering with random user/room/role combinations

### Integration Testing
- **End-to-End Subscription Flow**: Test complete flow from business service event to client notification
- **Cross-Service Integration**: Verify integration with all services that publish real-time events
- **Authentication Integration**: Test Cognito JWT validation with AppSync subscriptions
- **Migration Compatibility**: Verify all existing real-time functionality works with new implementation

### Load and Performance Testing
- **Concurrent Subscription Testing**: Test AppSync behavior with multiple simultaneous subscriptions
- **Event Throughput Testing**: Measure system performance under high event publishing rates
- **Connection Scaling Testing**: Test connection handling as subscriber count increases
- **Memory and Resource Testing**: Verify efficient resource usage and cleanup

### Configuration Requirements
- **Property Test Iterations**: Minimum 100 iterations per property test
- **Test Tagging**: Each property test tagged with format: **Feature: appsync-realtime-migration, Property {number}: {property_text}**
- **Performance Thresholds**: Event delivery < 100ms, authentication < 50ms, reconnection < 5 seconds
- **Load Test Targets**: Support 1000+ concurrent subscriptions, 10,000+ events per minute

The testing strategy ensures comprehensive validation of the migration from Socket.IO to AppSync Subscriptions while maintaining all existing functionality and improving performance characteristics.