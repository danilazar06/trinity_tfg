# Advanced Room Features - Design Document

## Architecture Overview

The advanced room features will extend the existing room system with new services and controllers while maintaining clean separation of concerns and backward compatibility.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Advanced Room Features                   │
├─────────────────────────────────────────────────────────────┤
│  RoomTemplateService  │  RoomSettingsService  │  RoomThemeService  │
│  RoomScheduleService  │  RoomModerationService │  RoomAnalyticsService │
├─────────────────────────────────────────────────────────────┤
│                    Existing Room System                     │
│     RoomService     │    MemberService    │  ShuffleSyncService │
├─────────────────────────────────────────────────────────────┤
│                    Supporting Services                      │
│  RealtimeService  │  EventTracker  │  AnalyticsService  │  AuthService │
└─────────────────────────────────────────────────────────────┘
```

## Data Model Design

### Room Templates

```typescript
interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  isPublic: boolean;
  category: TemplateCategory;
  configuration: {
    filters: ContentFilters;
    settings: AdvancedRoomSettings;
    theme?: RoomTheme;
  };
  usageCount: number;
  rating: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

enum TemplateCategory {
  MOVIE_NIGHT = 'movie_night',
  SERIES_MARATHON = 'series_marathon',
  FAMILY_FRIENDLY = 'family_friendly',
  HORROR_NIGHT = 'horror_night',
  COMEDY_SPECIAL = 'comedy_special',
  DOCUMENTARY = 'documentary',
  CUSTOM = 'custom'
}
```

### Advanced Room Settings

```typescript
interface AdvancedRoomSettings {
  // Voting Configuration
  votingTimeout?: number; // seconds per item
  sessionTimeout?: number; // minutes per session
  consensusThreshold: ConsensusType;
  customThreshold?: number; // percentage for custom consensus
  
  // Privacy and Access
  privacy: RoomPrivacy;
  maxMembers?: number;
  requireApproval: boolean;
  allowGuestVoting: boolean;
  
  // Content Management
  contentInjectionEnabled: boolean;
  injectionFrequency?: number; // items between injections
  allowMemberSuggestions: boolean;
  autoProgressEnabled: boolean;
  
  // Features
  chatEnabled: boolean;
  anonymousVoting: boolean;
  showVotingProgress: boolean;
  enableReactions: boolean;
  
  // Automation
  autoInactiveHandling: boolean;
  smartOptimization: boolean;
  predictiveMatching: boolean;
}

enum ConsensusType {
  UNANIMOUS = 'unanimous',
  MAJORITY = 'majority',
  SUPER_MAJORITY = 'super_majority', // 75%
  CUSTOM = 'custom'
}

enum RoomPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
  INVITE_ONLY = 'invite_only'
}
```

### Room Scheduling

```typescript
interface RoomSchedule {
  id: string;
  roomId: string;
  creatorId: string;
  title: string;
  description?: string;
  
  // Scheduling
  scheduledAt: Date;
  duration?: number; // minutes
  timeZone: string;
  
  // Recurrence
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  recurrenceEnd?: Date;
  
  // Notifications
  reminderMinutes: number[];
  notificationsSent: Date[];
  
  // Status
  status: ScheduleStatus;
  attendees: ScheduleAttendee[];
  
  createdAt: Date;
  updatedAt: Date;
}

interface RecurrencePattern {
  type: RecurrenceType;
  interval: number; // every N days/weeks/months
  daysOfWeek?: number[]; // for weekly recurrence
  dayOfMonth?: number; // for monthly recurrence
}

enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

enum ScheduleStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

interface ScheduleAttendee {
  userId: string;
  status: AttendeeStatus;
  respondedAt?: Date;
}

enum AttendeeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  MAYBE = 'maybe'
}
```

### Room Themes

```typescript
interface RoomTheme {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  
  // Visual Elements
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  
  // Assets
  backgroundImage?: string;
  icon?: string;
  banner?: string;
  
  // Customization
  isCustom: boolean;
  creatorId?: string;
  isPublic: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

enum ThemeCategory {
  MOVIE_GENRES = 'movie_genres',
  SEASONAL = 'seasonal',
  EVENTS = 'events',
  MINIMAL = 'minimal',
  COLORFUL = 'colorful',
  CUSTOM = 'custom'
}
```

### Enhanced Member Roles

```typescript
interface CustomRole {
  id: string;
  roomId: string;
  name: string;
  description: string;
  permissions: RoomPermission[];
  color?: string;
  priority: number; // for role hierarchy
  createdAt: Date;
}

enum RoomPermission {
  // Basic Permissions
  VOTE = 'vote',
  VIEW_RESULTS = 'view_results',
  CHAT = 'chat',
  
  // Content Permissions
  SUGGEST_CONTENT = 'suggest_content',
  INJECT_CONTENT = 'inject_content',
  MANAGE_QUEUE = 'manage_queue',
  
  // Member Permissions
  INVITE_MEMBERS = 'invite_members',
  REMOVE_MEMBERS = 'remove_members',
  ASSIGN_ROLES = 'assign_roles',
  MODERATE_CHAT = 'moderate_chat',
  
  // Room Permissions
  MODIFY_SETTINGS = 'modify_settings',
  SCHEDULE_SESSIONS = 'schedule_sessions',
  VIEW_ANALYTICS = 'view_analytics',
  MANAGE_TEMPLATES = 'manage_templates',
  
  // Admin Permissions
  DELETE_ROOM = 'delete_room',
  TRANSFER_OWNERSHIP = 'transfer_ownership'
}
```

## Service Layer Design

### 1. RoomTemplateService

```typescript
@Injectable()
export class RoomTemplateService {
  // Template Management
  async createTemplate(creatorId: string, templateData: CreateTemplateDto): Promise<RoomTemplate>
  async getTemplate(templateId: string): Promise<RoomTemplate>
  async updateTemplate(templateId: string, updates: UpdateTemplateDto): Promise<RoomTemplate>
  async deleteTemplate(templateId: string, userId: string): Promise<void>
  
  // Template Discovery
  async getPublicTemplates(filters?: TemplateFilters): Promise<RoomTemplate[]>
  async getUserTemplates(userId: string): Promise<RoomTemplate[]>
  async getPopularTemplates(limit?: number): Promise<RoomTemplate[]>
  async searchTemplates(query: string, filters?: TemplateFilters): Promise<RoomTemplate[]>
  
  // Template Usage
  async createRoomFromTemplate(templateId: string, userId: string, overrides?: Partial<CreateRoomDto>): Promise<Room>
  async incrementUsageCount(templateId: string): Promise<void>
  async rateTemplate(templateId: string, userId: string, rating: number): Promise<void>
}
```

### 2. RoomSettingsService

```typescript
@Injectable()
export class RoomSettingsService {
  // Settings Management
  async updateRoomSettings(roomId: string, userId: string, settings: AdvancedRoomSettings): Promise<void>
  async getRoomSettings(roomId: string): Promise<AdvancedRoomSettings>
  async resetToDefaults(roomId: string, userId: string): Promise<AdvancedRoomSettings>
  
  // Permission Validation
  async validateUserPermission(roomId: string, userId: string, permission: RoomPermission): Promise<boolean>
  async getUserPermissions(roomId: string, userId: string): Promise<RoomPermission[]>
  
  // Settings Validation
  async validateSettings(settings: AdvancedRoomSettings): Promise<ValidationResult>
  async getRecommendedSettings(roomId: string): Promise<AdvancedRoomSettings>
}
```

### 3. RoomScheduleService

```typescript
@Injectable()
export class RoomScheduleService {
  // Schedule Management
  async createSchedule(roomId: string, userId: string, scheduleData: CreateScheduleDto): Promise<RoomSchedule>
  async updateSchedule(scheduleId: string, userId: string, updates: UpdateScheduleDto): Promise<RoomSchedule>
  async cancelSchedule(scheduleId: string, userId: string): Promise<void>
  
  // Schedule Queries
  async getRoomSchedules(roomId: string): Promise<RoomSchedule[]>
  async getUserSchedules(userId: string): Promise<RoomSchedule[]>
  async getUpcomingSchedules(userId: string, days?: number): Promise<RoomSchedule[]>
  
  // Attendance Management
  async respondToSchedule(scheduleId: string, userId: string, status: AttendeeStatus): Promise<void>
  async getScheduleAttendees(scheduleId: string): Promise<ScheduleAttendee[]>
  
  // Notifications
  async sendScheduleReminders(scheduleId: string): Promise<void>
  async processRecurringSchedules(): Promise<void>
}
```

### 4. RoomModerationService

```typescript
@Injectable()
export class RoomModerationService {
  // Role Management
  async createCustomRole(roomId: string, userId: string, roleData: CreateRoleDto): Promise<CustomRole>
  async assignRole(roomId: string, moderatorId: string, memberId: string, roleId: string): Promise<void>
  async removeRole(roomId: string, moderatorId: string, memberId: string, roleId: string): Promise<void>
  
  // Moderation Actions
  async muteMember(roomId: string, moderatorId: string, memberId: string, duration?: number): Promise<void>
  async unmuteMember(roomId: string, moderatorId: string, memberId: string): Promise<void>
  async warnMember(roomId: string, moderatorId: string, memberId: string, reason: string): Promise<void>
  async temporaryBan(roomId: string, moderatorId: string, memberId: string, duration: number, reason: string): Promise<void>
  
  // Audit Trail
  async getModerationHistory(roomId: string): Promise<ModerationAction[]>
  async logModerationAction(action: ModerationAction): Promise<void>
}
```

### 5. RoomThemeService

```typescript
@Injectable()
export class RoomThemeService {
  // Theme Management
  async createTheme(userId: string, themeData: CreateThemeDto): Promise<RoomTheme>
  async updateTheme(themeId: string, userId: string, updates: UpdateThemeDto): Promise<RoomTheme>
  async deleteTheme(themeId: string, userId: string): Promise<void>
  
  // Theme Application
  async applyTheme(roomId: string, userId: string, themeId: string): Promise<void>
  async removeTheme(roomId: string, userId: string): Promise<void>
  async getRoomTheme(roomId: string): Promise<RoomTheme | null>
  
  // Theme Discovery
  async getPublicThemes(category?: ThemeCategory): Promise<RoomTheme[]>
  async getUserThemes(userId: string): Promise<RoomTheme[]>
  async getPopularThemes(limit?: number): Promise<RoomTheme[]>
}
```

## API Design

### Room Templates Controller

```typescript
@Controller('room-templates')
export class RoomTemplateController {
  @Post() createTemplate(@Request() req, @Body() createTemplateDto: CreateTemplateDto)
  @Get() getPublicTemplates(@Query() filters: TemplateFiltersDto)
  @Get('my-templates') getUserTemplates(@Request() req)
  @Get('popular') getPopularTemplates(@Query('limit') limit: number)
  @Get('search') searchTemplates(@Query('q') query: string, @Query() filters: TemplateFiltersDto)
  @Get(':id') getTemplate(@Param('id') templateId: string)
  @Put(':id') updateTemplate(@Param('id') templateId: string, @Body() updateTemplateDto: UpdateTemplateDto)
  @Delete(':id') deleteTemplate(@Param('id') templateId: string, @Request() req)
  @Post(':id/use') createRoomFromTemplate(@Param('id') templateId: string, @Request() req, @Body() overrides: CreateRoomOverridesDto)
  @Post(':id/rate') rateTemplate(@Param('id') templateId: string, @Request() req, @Body() ratingDto: RatingDto)
}
```

### Advanced Room Settings Controller

```typescript
@Controller('rooms/:roomId/settings')
export class RoomSettingsController {
  @Get() getRoomSettings(@Param('roomId') roomId: string)
  @Put() updateRoomSettings(@Param('roomId') roomId: string, @Request() req, @Body() settings: AdvancedRoomSettingsDto)
  @Post('reset') resetToDefaults(@Param('roomId') roomId: string, @Request() req)
  @Get('recommendations') getRecommendedSettings(@Param('roomId') roomId: string)
  @Get('permissions') getUserPermissions(@Param('roomId') roomId: string, @Request() req)
}
```

### Room Schedule Controller

```typescript
@Controller('rooms/:roomId/schedules')
export class RoomScheduleController {
  @Post() createSchedule(@Param('roomId') roomId: string, @Request() req, @Body() scheduleDto: CreateScheduleDto)
  @Get() getRoomSchedules(@Param('roomId') roomId: string)
  @Get(':scheduleId') getSchedule(@Param('scheduleId') scheduleId: string)
  @Put(':scheduleId') updateSchedule(@Param('scheduleId') scheduleId: string, @Request() req, @Body() updates: UpdateScheduleDto)
  @Delete(':scheduleId') cancelSchedule(@Param('scheduleId') scheduleId: string, @Request() req)
  @Post(':scheduleId/respond') respondToSchedule(@Param('scheduleId') scheduleId: string, @Request() req, @Body() response: ScheduleResponseDto)
  @Get(':scheduleId/attendees') getScheduleAttendees(@Param('scheduleId') scheduleId: string)
}
```

## Database Schema

### DynamoDB Table Structure

```typescript
// Room Templates Table
PK: TEMPLATE#{templateId}
SK: METADATA
GSI1PK: USER#{creatorId}
GSI1SK: TEMPLATE#{createdAt}
GSI2PK: CATEGORY#{category}
GSI2SK: USAGE#{usageCount}#{templateId}

// Room Settings Table
PK: ROOM#{roomId}
SK: SETTINGS
// Settings data stored as JSON

// Room Schedules Table
PK: ROOM#{roomId}
SK: SCHEDULE#{scheduleId}
GSI1PK: USER#{creatorId}
GSI1SK: SCHEDULE#{scheduledAt}
GSI2PK: DATE#{date}
GSI2SK: TIME#{scheduledAt}

// Room Themes Table
PK: THEME#{themeId}
SK: METADATA
GSI1PK: USER#{creatorId}
GSI1SK: THEME#{createdAt}
GSI2PK: CATEGORY#{category}
GSI2SK: POPULARITY#{usageCount}

// Custom Roles Table
PK: ROOM#{roomId}
SK: ROLE#{roleId}
// Role data with permissions array

// Member Roles Assignment Table
PK: ROOM#{roomId}
SK: MEMBER#{userId}#ROLE#{roleId}
```

## Integration Points

### Real-time Integration

```typescript
// New real-time events for advanced features
interface AdvancedRoomEvents {
  scheduleReminder: { scheduleId: string; minutesUntil: number };
  settingsChanged: { roomId: string; changes: Partial<AdvancedRoomSettings> };
  roleAssigned: { roomId: string; userId: string; roleId: string };
  themeChanged: { roomId: string; themeId: string };
  templateUsed: { templateId: string; roomId: string };
}
```

### Analytics Integration

```typescript
// New event types for analytics
enum AdvancedEventType {
  TEMPLATE_CREATED = 'template_created',
  TEMPLATE_USED = 'template_used',
  SETTINGS_CHANGED = 'settings_changed',
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_ATTENDED = 'schedule_attended',
  ROLE_ASSIGNED = 'role_assigned',
  THEME_APPLIED = 'theme_applied',
  MODERATION_ACTION = 'moderation_action'
}
```

## Performance Considerations

### Caching Strategy

```typescript
// Redis caching for frequently accessed data
- Room settings: TTL 1 hour
- Popular templates: TTL 30 minutes
- User permissions: TTL 15 minutes
- Theme data: TTL 2 hours
- Schedule data: TTL 5 minutes
```

### Query Optimization

- Use GSI for efficient template discovery
- Batch operations for role assignments
- Pagination for large result sets
- Efficient filtering for schedule queries

## Security Considerations

### Permission System

```typescript
// Hierarchical permission checking
async checkPermission(roomId: string, userId: string, permission: RoomPermission): Promise<boolean> {
  const userRoles = await this.getUserRoles(roomId, userId);
  const userPermissions = await this.aggregatePermissions(userRoles);
  return userPermissions.includes(permission);
}
```

### Data Validation

- Strict validation for all advanced settings
- Template content sanitization
- Schedule time validation
- Permission escalation prevention

## Testing Strategy

### Property-Based Testing

```typescript
// Test advanced room features with property-based testing
describe('Advanced Room Features Property Tests', () => {
  it('should maintain room functionality with any valid advanced settings', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        votingTimeout: fc.integer({ min: 30, max: 300 }),
        consensusThreshold: fc.constantFrom('unanimous', 'majority', 'custom'),
        privacy: fc.constantFrom('public', 'private', 'invite_only'),
        maxMembers: fc.integer({ min: 2, max: 50 })
      }),
      async (settings) => {
        const room = await createRoomWithSettings(settings);
        const result = await testBasicRoomFunctionality(room.id);
        expect(result.success).toBe(true);
      }
    ));
  });
});
```

## Migration Strategy

### Backward Compatibility

1. **Gradual Rollout**: Deploy advanced features as optional enhancements
2. **Default Settings**: Provide sensible defaults for all new settings
3. **Feature Flags**: Use feature flags to control advanced feature availability
4. **Data Migration**: Migrate existing rooms to use default advanced settings

### Deployment Plan

1. **Phase 1**: Deploy core services (Templates, Settings)
2. **Phase 2**: Deploy scheduling and moderation features
3. **Phase 3**: Deploy themes and advanced analytics
4. **Phase 4**: Deploy collaboration and automation features

This design ensures that advanced room features enhance the Trinity experience while maintaining the simplicity and reliability of the core room system.