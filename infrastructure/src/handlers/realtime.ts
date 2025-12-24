import { AppSyncResolverEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface AppSyncIdentity {
  sub: string;
  username?: string;
  claims?: Record<string, any>;
}

interface RealtimeResolverEvent extends AppSyncResolverEvent<any> {
  identity: AppSyncIdentity;
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate user has access to room
 */
async function validateRoomAccess(userId: string, roomId: string): Promise<boolean> {
  try {
    const result = await dynamoClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: {
        roomId,
        userId
      }
    }));
    
    return !!result.Item;
  } catch (error) {
    console.error('Error validating room access:', error);
    return false;
  }
}

/**
 * Get user permissions for filtering
 */
async function getUserPermissions(userId: string, roomId: string): Promise<string[]> {
  try {
    const result = await dynamoClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: {
        roomId,
        userId
      }
    }));
    
    return result.Item?.permissions || ['member'];
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return ['member'];
  }
}

/**
 * Publish Room Event
 */
export const publishRoomEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('📡 Publishing room event:', JSON.stringify(event, null, 2));
  
  const { roomId, eventType, data } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType,
    data: JSON.stringify(data)
  };
  
  console.log('✅ Room event published:', eventData);
  return eventData;
};

/**
 * Publish Vote Event
 */
export const publishVoteEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('🗳️ Publishing vote event:', JSON.stringify(event, null, 2));
  
  const { roomId, voteData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'VOTE_UPDATE',
    userId: voteData.userId,
    mediaId: voteData.mediaId,
    voteType: voteData.voteType,
    progress: voteData.progress
  };
  
  console.log('✅ Vote event published:', eventData);
  return eventData;
};

/**
 * Publish Match Event
 */
export const publishMatchEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('🎯 Publishing match event:', JSON.stringify(event, null, 2));
  
  const { roomId, matchData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MATCH_FOUND',
    matchId: matchData.matchId,
    mediaId: matchData.mediaId,
    mediaTitle: matchData.mediaTitle,
    participants: matchData.participants,
    consensusType: matchData.consensusType || 'UNANIMOUS'
  };
  
  console.log('✅ Match event published:', eventData);
  return eventData;
};

/**
 * Publish Member Event
 */
export const publishMemberEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('👤 Publishing member event:', JSON.stringify(event, null, 2));
  
  const { roomId, memberData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MEMBER_UPDATE',
    userId: memberData.userId,
    action: memberData.action,
    memberCount: memberData.memberCount,
    memberData: memberData.memberData
  };
  
  console.log('✅ Member event published:', eventData);
  return eventData;
};

/**
 * Publish Role Event
 */
export const publishRoleEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('👑 Publishing role event:', JSON.stringify(event, null, 2));
  
  const { roomId, roleData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room and appropriate permissions
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const permissions = await getUserPermissions(userId, roomId);
  if (!permissions.includes('admin') && !permissions.includes('moderator')) {
    throw new Error('Unauthorized: Insufficient permissions for role management');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'ROLE_ASSIGNMENT',
    targetUserId: roleData.targetUserId,
    roleId: roleData.roleId,
    roleName: roleData.roleName,
    assignedBy: userId,
    action: roleData.action
  };
  
  console.log('✅ Role event published:', eventData);
  return eventData;
};

/**
 * Publish Moderation Event
 */
export const publishModerationEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('🛡️ Publishing moderation event:', JSON.stringify(event, null, 2));
  
  const { roomId, moderationData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room and moderation permissions
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const permissions = await getUserPermissions(userId, roomId);
  if (!permissions.includes('admin') && !permissions.includes('moderator')) {
    throw new Error('Unauthorized: Insufficient permissions for moderation');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MODERATION_ACTION',
    targetUserId: moderationData.targetUserId,
    moderatorId: userId,
    actionType: moderationData.actionType,
    reason: moderationData.reason,
    duration: moderationData.duration,
    expiresAt: moderationData.expiresAt
  };
  
  console.log('✅ Moderation event published:', eventData);
  return eventData;
};

/**
 * Publish Schedule Event
 */
export const publishScheduleEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('📅 Publishing schedule event:', JSON.stringify(event, null, 2));
  
  const { roomId, scheduleData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'SCHEDULE_EVENT',
    scheduleId: scheduleData.scheduleId,
    title: scheduleData.title,
    action: scheduleData.action,
    startTime: scheduleData.startTime,
    endTime: scheduleData.endTime,
    message: scheduleData.message
  };
  
  console.log('✅ Schedule event published:', eventData);
  return eventData;
};

/**
 * Publish Theme Event
 */
export const publishThemeEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('🎨 Publishing theme event:', JSON.stringify(event, null, 2));
  
  const { roomId, themeData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'THEME_CHANGE',
    themeId: themeData.themeId,
    themeName: themeData.themeName,
    action: themeData.action,
    appliedBy: userId,
    customizations: themeData.customizations
  };
  
  console.log('✅ Theme event published:', eventData);
  return eventData;
};

/**
 * Publish Settings Event
 */
export const publishSettingsEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('⚙️ Publishing settings event:', JSON.stringify(event, null, 2));
  
  const { roomId, settingsData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room and admin permissions
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const permissions = await getUserPermissions(userId, roomId);
  if (!permissions.includes('admin')) {
    throw new Error('Unauthorized: Only room admins can change settings');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'SETTINGS_CHANGE',
    settingKey: settingsData.settingKey,
    oldValue: settingsData.oldValue,
    newValue: settingsData.newValue,
    changedBy: userId,
    category: settingsData.category
  };
  
  console.log('✅ Settings event published:', eventData);
  return eventData;
};

/**
 * Publish Chat Event
 */
export const publishChatEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('💬 Publishing chat event:', JSON.stringify(event, null, 2));
  
  const { roomId, chatData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'CHAT_MESSAGE',
    messageId: chatData.messageId,
    userId: chatData.userId,
    username: chatData.username,
    content: chatData.content,
    messageType: chatData.messageType || 'TEXT',
    action: chatData.action,
    metadata: chatData.metadata
  };
  
  console.log('✅ Chat event published:', eventData);
  return eventData;
};

/**
 * Publish Suggestion Event
 */
export const publishSuggestionEvent = async (event: RealtimeResolverEvent, context: Context) => {
  console.log('💡 Publishing suggestion event:', JSON.stringify(event, null, 2));
  
  const { roomId, suggestionData } = event.arguments;
  const userId = event.identity.sub;
  
  // Validate user has access to room
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Unauthorized: User does not have access to this room');
  }
  
  const eventData = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'CONTENT_SUGGESTION',
    suggestionId: suggestionData.suggestionId,
    userId: suggestionData.userId,
    username: suggestionData.username,
    action: suggestionData.action,
    suggestion: suggestionData.suggestion,
    vote: suggestionData.vote,
    comment: suggestionData.comment
  };
  
  console.log('✅ Suggestion event published:', eventData);
  return eventData;
};

/**
 * Subscription filter for room events
 */
export const roomEventFilter = async (event: RealtimeResolverEvent, context: Context) => {
  const { roomId } = event.arguments;
  const userId = event.identity.sub;
  
  // Verify user has access to room events
  const hasAccess = await validateRoomAccess(userId, roomId);
  
  if (!hasAccess) {
    return null; // Filter out this subscription
  }
  
  return {
    roomId: { eq: roomId }
  };
};