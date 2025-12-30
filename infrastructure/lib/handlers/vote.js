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

// src/handlers/vote.ts
var vote_exports = {};
__export(vote_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(vote_exports);
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");

// src/utils/appsync-publisher.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var dynamoClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
async function publishMatchFoundEvent(roomId, movieId, movieTitle, participants) {
  try {
    const event = {
      id: `match_${roomId}_${movieId}_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      roomId,
      eventType: "MATCH_FOUND",
      matchId: `match_${roomId}_${movieId}`,
      mediaId: movieId,
      mediaTitle: movieTitle,
      participants,
      consensusType: "UNANIMOUS"
      // Trinity uses unanimous consensus
    };
    console.log(`\u{1F389} MATCH_FOUND Event published for room ${roomId}:`, {
      movieId,
      movieTitle,
      participantCount: participants.length
    });
    await storeEventForAudit("MATCH_FOUND", roomId, event);
  } catch (error) {
    console.error("\u274C Error publishing match found event:", error);
  }
}
async function publishVoteUpdateEvent(roomId, userId, movieId, voteType, currentVotes, totalMembers) {
  try {
    const event = {
      id: `vote_${roomId}_${userId}_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      roomId,
      eventType: "VOTE_UPDATE",
      userId,
      mediaId: movieId,
      voteType,
      progress: {
        totalVotes: currentVotes,
        likesCount: voteType === "LIKE" ? currentVotes : 0,
        // Simplified for Trinity
        dislikesCount: 0,
        skipsCount: 0,
        remainingUsers: Math.max(0, totalMembers - currentVotes),
        percentage: totalMembers > 0 ? currentVotes / totalMembers * 100 : 0
      }
    };
    console.log(`\u{1F5F3}\uFE0F VOTE_UPDATE Event published for room ${roomId}:`, {
      userId,
      movieId,
      progress: `${currentVotes}/${totalMembers} (${event.progress.percentage.toFixed(1)}%)`
    });
    await storeEventForAudit("VOTE_UPDATE", roomId, event);
  } catch (error) {
    console.error("\u274C Error publishing vote update event:", error);
  }
}
async function getMovieTitle(movieId) {
  try {
    const response = await docClient.send(new import_lib_dynamodb.GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE,
      Key: { tmdbId: `movie_${movieId}` }
    }));
    if (response.Item?.movies) {
      const movies = response.Item.movies;
      const movie = movies.find((m) => m.id === movieId);
      if (movie?.title) {
        return movie.title;
      }
    }
    return `Movie ${movieId}`;
  } catch (error) {
    console.warn("\u26A0\uFE0F Error getting movie title:", error);
    return `Movie ${movieId}`;
  }
}
async function storeEventForAudit(eventType, roomId, eventData) {
  try {
    console.log(`\u{1F4CA} AUDIT_EVENT:${eventType}`, {
      roomId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      eventData: JSON.stringify(eventData)
    });
  } catch (error) {
    console.warn("\u26A0\uFE0F Error storing audit event:", error);
  }
}

// src/utils/metrics.ts
function logMetric(metric) {
  const logEntry = {
    timestamp: metric.timestamp?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
    metricType: "CUSTOM_METRIC",
    metricName: metric.metricName,
    value: metric.value,
    unit: metric.unit,
    dimensions: metric.dimensions || {}
  };
  console.log(`\u{1F4CA} METRIC: ${JSON.stringify(logEntry)}`);
}
function logPerformance(perf) {
  const logEntry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metricType: "PERFORMANCE",
    operation: perf.operation,
    duration: perf.duration,
    success: perf.success,
    errorType: perf.errorType,
    metadata: perf.metadata || {}
  };
  console.log(`\u26A1 PERFORMANCE: ${JSON.stringify(logEntry)}`);
  logMetric({
    metricName: `${perf.operation}_Duration`,
    value: perf.duration,
    unit: "Milliseconds",
    dimensions: {
      Operation: perf.operation,
      Success: perf.success.toString(),
      ErrorType: perf.errorType || "None"
    }
  });
}
function logBusinessMetric(eventType, roomId, userId, metadata) {
  const logEntry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metricType: "BUSINESS_EVENT",
    eventType,
    roomId: roomId || "unknown",
    userId: userId || "unknown",
    metadata: metadata || {}
  };
  console.log(`\u{1F4BC} BUSINESS: ${JSON.stringify(logEntry)}`);
  logMetric({
    metricName: `Business_${eventType}`,
    value: 1,
    unit: "Count",
    dimensions: {
      EventType: eventType,
      Stage: process.env.STAGE || "dev"
    }
  });
}
function logError(operation, error, context) {
  const logEntry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metricType: "ERROR",
    operation,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    context: context || {}
  };
  console.error(`\u274C ERROR: ${JSON.stringify(logEntry)}`);
  logMetric({
    metricName: "Errors",
    value: 1,
    unit: "Count",
    dimensions: {
      Operation: operation,
      ErrorType: error.name,
      Stage: process.env.STAGE || "dev"
    }
  });
}
var PerformanceTimer = class {
  constructor(operation) {
    this.operation = operation;
    this.startTime = Date.now();
  }
  finish(success = true, errorType, metadata) {
    const duration = Date.now() - this.startTime;
    logPerformance({
      operation: this.operation,
      duration,
      success,
      errorType,
      metadata
    });
  }
};

// src/handlers/vote.ts
var dynamoClient2 = new import_client_dynamodb2.DynamoDBClient({});
var docClient2 = import_lib_dynamodb2.DynamoDBDocumentClient.from(dynamoClient2);
var handler = async (event) => {
  console.log("\u{1F5F3}\uFE0F Vote Handler:", JSON.stringify(event, null, 2));
  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity;
  try {
    switch (fieldName) {
      case "vote":
        return await processVote(userId, args.roomId, args.movieId);
      default:
        throw new Error(`Operaci\xF3n no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`\u274C Error en ${fieldName}:`, error);
    throw error;
  }
};
async function processVote(userId, roomId, movieId) {
  const timer = new PerformanceTimer("ProcessVote");
  console.log(`\u{1F5F3}\uFE0F Procesando voto: Usuario ${userId}, Sala ${roomId}, Pel\xEDcula ${movieId}`);
  try {
    const room = await getRoomAndValidate(roomId);
    await validateUserMembership(userId, roomId);
    await preventDuplicateVote(userId, roomId, movieId);
    const currentVotes = await incrementVoteCount(roomId, movieId);
    const totalMembers = await getTotalActiveMembers(roomId);
    console.log(`\u{1F4CA} Votos actuales: ${currentVotes}, Miembros totales: ${totalMembers}`);
    await publishVoteUpdateEvent(roomId, userId, movieId, "LIKE", currentVotes, totalMembers);
    logBusinessMetric("VOTE_CAST", roomId, userId, {
      movieId,
      currentVotes,
      totalMembers,
      progress: totalMembers > 0 ? currentVotes / totalMembers * 100 : 0
    });
    if (currentVotes >= totalMembers) {
      console.log("\u{1F389} \xA1Match encontrado! Actualizando sala y notificando...");
      await updateRoomWithMatch(roomId, movieId);
      const participants = await getRoomParticipants(roomId);
      const movieTitle = await getMovieTitle(movieId);
      await publishMatchFoundEvent(roomId, movieId, movieTitle, participants);
      logBusinessMetric("MATCH_FOUND", roomId, userId, {
        movieId,
        movieTitle,
        participantCount: participants.length,
        votesRequired: totalMembers
      });
      timer.finish(true, void 0, {
        result: "match_found",
        movieId,
        participantCount: participants.length
      });
      return {
        id: roomId,
        status: "MATCHED",
        resultMovieId: movieId,
        hostId: room.hostId
      };
    }
    timer.finish(true, void 0, {
      result: "vote_recorded",
      progress: `${currentVotes}/${totalMembers}`
    });
    return {
      id: roomId,
      status: room.status,
      resultMovieId: room.resultMovieId,
      hostId: room.hostId
    };
  } catch (error) {
    logError("ProcessVote", error, { userId, roomId, movieId });
    timer.finish(false, error.name);
    throw error;
  }
}
async function getRoomAndValidate(roomId) {
  const response = await docClient2.send(new import_lib_dynamodb2.GetCommand({
    TableName: process.env.ROOMS_TABLE,
    Key: { roomId }
  }));
  if (!response.Item) {
    throw new Error("Sala no encontrada");
  }
  const room = response.Item;
  if (room.status !== "ACTIVE" && room.status !== "WAITING") {
    throw new Error(`La sala no est\xE1 disponible para votar. Estado actual: ${room.status}`);
  }
  return room;
}
async function validateUserMembership(userId, roomId) {
  const response = await docClient2.send(new import_lib_dynamodb2.GetCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    Key: { roomId, userId }
  }));
  if (!response.Item || !response.Item.isActive) {
    throw new Error("Usuario no es miembro activo de la sala");
  }
}
async function incrementVoteCount(roomId, movieId) {
  try {
    const response = await docClient2.send(new import_lib_dynamodb2.UpdateCommand({
      TableName: process.env.VOTES_TABLE,
      Key: { roomId, movieId },
      UpdateExpression: "ADD votes :increment SET updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":increment": 1,
        ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
      },
      ReturnValues: "ALL_NEW"
    }));
    return response.Attributes?.votes || 1;
  } catch (error) {
    const newVote = {
      roomId,
      movieId,
      votes: 1,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await docClient2.send(new import_lib_dynamodb2.PutCommand({
      TableName: process.env.VOTES_TABLE,
      Item: newVote,
      ConditionExpression: "attribute_not_exists(roomId) AND attribute_not_exists(movieId)"
    }));
    return 1;
  }
}
async function getTotalActiveMembers(roomId) {
  const response = await docClient2.send(new import_lib_dynamodb2.QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    KeyConditionExpression: "roomId = :roomId",
    FilterExpression: "isActive = :active",
    ExpressionAttributeValues: {
      ":roomId": roomId,
      ":active": true
    },
    Select: "COUNT"
  }));
  return response.Count || 0;
}
async function updateRoomWithMatch(roomId, movieId) {
  await docClient2.send(new import_lib_dynamodb2.UpdateCommand({
    TableName: process.env.ROOMS_TABLE,
    Key: { roomId },
    UpdateExpression: "SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt",
    ExpressionAttributeNames: {
      "#status": "status"
      // 'status' es palabra reservada en DynamoDB
    },
    ExpressionAttributeValues: {
      ":status": "MATCHED",
      ":movieId": movieId,
      ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
    }
  }));
  console.log(`\u2705 Sala ${roomId} actualizada con match: pel\xEDcula ${movieId}`);
}
async function preventDuplicateVote(userId, roomId, movieId) {
  const roomMovieId = `${roomId}_${movieId}`;
  try {
    const existingVote = await docClient2.send(new import_lib_dynamodb2.GetCommand({
      TableName: process.env.USER_VOTES_TABLE,
      Key: { userId, roomMovieId }
    }));
    if (existingVote.Item) {
      throw new Error(`Usuario ${userId} ya vot\xF3 por la pel\xEDcula ${movieId} en la sala ${roomId}`);
    }
    await docClient2.send(new import_lib_dynamodb2.PutCommand({
      TableName: process.env.USER_VOTES_TABLE,
      Item: {
        userId,
        roomMovieId,
        roomId,
        movieId,
        votedAt: (/* @__PURE__ */ new Date()).toISOString(),
        voteType: "LIKE"
        // Trinity solo tiene votos positivos
      },
      ConditionExpression: "attribute_not_exists(userId) AND attribute_not_exists(roomMovieId)"
    }));
    console.log(`\u2705 Voto registrado: Usuario ${userId}, Sala ${roomId}, Pel\xEDcula ${movieId}`);
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      throw new Error(`Usuario ${userId} ya vot\xF3 por la pel\xEDcula ${movieId} en la sala ${roomId}`);
    }
    throw error;
  }
}
async function getRoomParticipants(roomId) {
  try {
    const response = await docClient2.send(new import_lib_dynamodb2.QueryCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE,
      KeyConditionExpression: "roomId = :roomId",
      FilterExpression: "isActive = :active",
      ExpressionAttributeValues: {
        ":roomId": roomId,
        ":active": true
      },
      ProjectionExpression: "userId"
    }));
    return response.Items?.map((item) => item.userId) || [];
  } catch (error) {
    console.warn("\u26A0\uFE0F Error obteniendo participantes:", error);
    return [];
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
