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

// asset-input/src/handlers/vote.ts
var vote_exports = {};
__export(vote_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(vote_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var dynamoClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
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
  console.log(`\u{1F5F3}\uFE0F Procesando voto: Usuario ${userId}, Sala ${roomId}, Pel\xEDcula ${movieId}`);
  const room = await getRoomAndValidate(roomId);
  await validateUserMembership(userId, roomId);
  const currentVotes = await incrementVoteCount(roomId, movieId);
  const totalMembers = await getTotalActiveMembers(roomId);
  console.log(`\u{1F4CA} Votos actuales: ${currentVotes}, Miembros totales: ${totalMembers}`);
  if (currentVotes >= totalMembers) {
    console.log("\u{1F389} \xA1Match encontrado! Actualizando sala...");
    await updateRoomWithMatch(roomId, movieId);
    return {
      id: roomId,
      status: "MATCHED",
      resultMovieId: movieId,
      hostId: room.hostId
    };
  }
  return {
    id: roomId,
    status: room.status,
    resultMovieId: room.resultMovieId,
    hostId: room.hostId
  };
}
async function getRoomAndValidate(roomId) {
  const response = await docClient.send(new import_lib_dynamodb.GetCommand({
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
  const response = await docClient.send(new import_lib_dynamodb.GetCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    Key: { roomId, userId }
  }));
  if (!response.Item || !response.Item.isActive) {
    throw new Error("Usuario no es miembro activo de la sala");
  }
}
async function incrementVoteCount(roomId, movieId) {
  try {
    const response = await docClient.send(new import_lib_dynamodb.UpdateCommand({
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
    await docClient.send(new import_lib_dynamodb.PutCommand({
      TableName: process.env.VOTES_TABLE,
      Item: newVote,
      ConditionExpression: "attribute_not_exists(roomId) AND attribute_not_exists(movieId)"
    }));
    return 1;
  }
}
async function getTotalActiveMembers(roomId) {
  const response = await docClient.send(new import_lib_dynamodb.QueryCommand({
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
  await docClient.send(new import_lib_dynamodb.UpdateCommand({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
