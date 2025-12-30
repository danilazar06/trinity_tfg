"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/realtime.ts
var realtime_exports = {};
__export(realtime_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(realtime_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var dynamoClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
var handler = async (event) => {
  console.log("\u{1F4E1} Realtime Handler:", JSON.stringify(event, null, 2));
  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity;
  try {
    switch (fieldName) {
      case "publishRoomEvent":
        return await publishRoomEvent(userId, args.roomId, args.eventType, args.data);
      case "publishVoteEvent":
        return await publishVoteEvent(userId, args.roomId, args.voteData);
      case "publishMatchEvent":
        return await publishMatchEvent(userId, args.roomId, args.matchData);
      case "publishMemberEvent":
        return await publishMemberEvent(userId, args.roomId, args.memberData);
      case "publishRoleEvent":
        return await publishRoleEvent(userId, args.roomId, args.roleData);
      case "publishModerationEvent":
        return await publishModerationEvent(userId, args.roomId, args.moderationData);
      case "publishScheduleEvent":
        return await publishScheduleEvent(userId, args.roomId, args.scheduleData);
      case "publishThemeEvent":
        return await publishThemeEvent(userId, args.roomId, args.themeData);
      case "publishSettingsEvent":
        return await publishSettingsEvent(userId, args.roomId, args.settingsData);
      case "publishChatEvent":
        return await publishChatEvent(userId, args.roomId, args.chatData);
      case "publishSuggestionEvent":
        return await publishSuggestionEvent(userId, args.roomId, args.suggestionData);
      default:
        throw new Error(`Operaci\xF3n no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`\u274C Error en ${fieldName}:`, error);
    throw error;
  }
};
async function validateRoomAccess(userId, roomId) {
  try {
    const response = await docClient.send(new import_lib_dynamodb.GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE,
      Key: { roomId, userId }
    }));
    return response.Item?.isActive === true;
  } catch (error) {
    console.warn("\u26A0\uFE0F Error validando acceso a sala:", error);
    return false;
  }
}
async function publishRoomEvent(userId, roomId, eventType, data) {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error("Usuario no tiene acceso a esta sala");
  }
  const event = {
    id: `room_${roomId}_${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    roomId,
    eventType,
    data: typeof data === "string" ? data : JSON.stringify(data)
  };
  console.log(`\u{1F4E1} Publishing room event: ${eventType} for room ${roomId}`);
  return event;
}
async function publishVoteEvent(userId, roomId, voteData) {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error("Usuario no tiene acceso a esta sala");
  }
  const parsedData = typeof voteData === "string" ? JSON.parse(voteData) : voteData;
  const event = {
    id: `vote_${roomId}_${userId}_${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    roomId,
    eventType: "VOTE_UPDATE",
    userId,
    mediaId: parsedData.mediaId,
    voteType: parsedData.voteType || "LIKE",
    progress: parsedData.progress || {
      totalVotes: 0,
      likesCount: 0,
      dislikesCount: 0,
      skipsCount: 0,
      remainingUsers: 0,
      percentage: 0
    }
  };
  console.log(`\u{1F5F3}\uFE0F Publishing vote event for room ${roomId}, user ${userId}`);
  return event;
}
async function publishMatchEvent(userId, roomId, matchData) {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error("Usuario no tiene acceso a esta sala");
  }
  const parsedData = typeof matchData === "string" ? JSON.parse(matchData) : matchData;
  const event = {
    id: `match_${roomId}_${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    roomId,
    eventType: "MATCH_FOUND",
    matchId: parsedData.matchId || `match_${roomId}_${parsedData.mediaId}`,
    mediaId: parsedData.mediaId,
    mediaTitle: parsedData.mediaTitle || "Unknown Movie",
    participants: parsedData.participants || [],
    consensusType: parsedData.consensusType || "UNANIMOUS"
  };
  console.log(`\u{1F389} Publishing match event for room ${roomId}: ${parsedData.mediaTitle}`);
  return event;
}
async function publishMemberEvent(userId, roomId, memberData) {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error("Usuario no tiene acceso a esta sala");
  }
  const parsedData = typeof memberData === "string" ? JSON.parse(memberData) : memberData;
  const event = {
    id: `member_${roomId}_${userId}_${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    roomId,
    eventType: "MEMBER_UPDATE",
    userId: parsedData.userId || userId,
    action: parsedData.action || "JOINED",
    memberCount: parsedData.memberCount || 1,
    memberData: parsedData.memberData || null
  };
  console.log(`\u{1F465} Publishing member event for room ${roomId}: ${parsedData.action}`);
  return event;
}
async function publishRoleEvent(userId, roomId, roleData) {
  console.log(`\u{1F451} Role event (future feature): ${roomId}`);
  return { id: `role_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "ROLE_UPDATE" };
}
async function publishModerationEvent(userId, roomId, moderationData) {
  console.log(`\u{1F6E1}\uFE0F Moderation event (future feature): ${roomId}`);
  return { id: `mod_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "MODERATION_ACTION" };
}
async function publishScheduleEvent(userId, roomId, scheduleData) {
  console.log(`\u{1F4C5} Schedule event (future feature): ${roomId}`);
  return { id: `schedule_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "SCHEDULE_UPDATE" };
}
async function publishThemeEvent(userId, roomId, themeData) {
  console.log(`\u{1F3A8} Theme event (future feature): ${roomId}`);
  return { id: `theme_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "THEME_CHANGE" };
}
async function publishSettingsEvent(userId, roomId, settingsData) {
  console.log(`\u2699\uFE0F Settings event (future feature): ${roomId}`);
  return { id: `settings_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "SETTINGS_CHANGE" };
}
async function publishChatEvent(userId, roomId, chatData) {
  console.log(`\u{1F4AC} Chat event (future feature): ${roomId}`);
  return { id: `chat_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "CHAT_MESSAGE" };
}
async function publishSuggestionEvent(userId, roomId, suggestionData) {
  console.log(`\u{1F4A1} Suggestion event (future feature): ${roomId}`);
  return { id: `suggestion_${Date.now()}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), roomId, eventType: "CONTENT_SUGGESTION" };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
