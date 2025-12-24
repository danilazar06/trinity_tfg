"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// asset-input/src/handlers/room.ts
var room_exports = {};
__export(room_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(room_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// asset-input/node_modules/uuid/dist/esm-node/rng.js
var import_crypto = __toESM(require("crypto"));
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    import_crypto.default.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// asset-input/node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// asset-input/node_modules/uuid/dist/esm-node/native.js
var import_crypto2 = __toESM(require("crypto"));
var native_default = {
  randomUUID: import_crypto2.default.randomUUID
};

// asset-input/node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// asset-input/src/handlers/room.ts
var dynamoClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
var handler = async (event) => {
  console.log("\u{1F3E0} Room Handler:", JSON.stringify(event, null, 2));
  const { fieldName } = event.info;
  const { sub: userId } = event.identity;
  try {
    switch (fieldName) {
      case "createRoom":
        return await createRoom(userId);
      case "joinRoom":
        return await joinRoom(userId, event.arguments.roomId);
      case "getMyHistory":
        return await getMyHistory(userId);
      default:
        throw new Error(`Operaci\xF3n no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`\u274C Error en ${fieldName}:`, error);
    throw error;
  }
};
async function createRoom(hostId) {
  const roomId = v4_default();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const room = {
    id: roomId,
    status: "WAITING",
    hostId,
    createdAt: now,
    updatedAt: now
  };
  await docClient.send(new import_lib_dynamodb.PutCommand({
    TableName: process.env.ROOMS_TABLE,
    Item: {
      roomId,
      ...room
    }
  }));
  const hostMember = {
    roomId,
    userId: hostId,
    role: "HOST",
    joinedAt: now,
    isActive: true
  };
  await docClient.send(new import_lib_dynamodb.PutCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    Item: hostMember
  }));
  console.log(`\u2705 Sala creada: ${roomId} por ${hostId}`);
  return room;
}
async function joinRoom(userId, roomId) {
  const roomResponse = await docClient.send(new import_lib_dynamodb.GetCommand({
    TableName: process.env.ROOMS_TABLE,
    Key: { roomId }
  }));
  if (!roomResponse.Item) {
    throw new Error("Sala no encontrada");
  }
  const room = roomResponse.Item;
  if (room.status !== "WAITING") {
    throw new Error("La sala no est\xE1 disponible para nuevos miembros");
  }
  const existingMember = await docClient.send(new import_lib_dynamodb.GetCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    Key: { roomId, userId }
  }));
  if (existingMember.Item) {
    await docClient.send(new import_lib_dynamodb.UpdateCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE,
      Key: { roomId, userId },
      UpdateExpression: "SET isActive = :active, joinedAt = :joinedAt",
      ExpressionAttributeValues: {
        ":active": true,
        ":joinedAt": (/* @__PURE__ */ new Date()).toISOString()
      }
    }));
  } else {
    const newMember = {
      roomId,
      userId,
      role: "MEMBER",
      joinedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: true
    };
    await docClient.send(new import_lib_dynamodb.PutCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE,
      Item: newMember
    }));
  }
  await docClient.send(new import_lib_dynamodb.UpdateCommand({
    TableName: process.env.ROOMS_TABLE,
    Key: { roomId },
    UpdateExpression: "SET updatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
    }
  }));
  console.log(`\u2705 Usuario ${userId} se uni\xF3 a sala ${roomId}`);
  return {
    id: roomId,
    status: room.status,
    resultMovieId: room.resultMovieId,
    hostId: room.hostId,
    createdAt: room.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getMyHistory(userId) {
  const response = await docClient.send(new import_lib_dynamodb.QueryCommand({
    TableName: process.env.ROOM_MEMBERS_TABLE,
    IndexName: "UserHistoryIndex",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId
    },
    ScanIndexForward: false,
    // Ordenar por joinedAt descendente (más recientes primero)
    Limit: 50
    // Limitar a últimas 50 salas
  }));
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  const rooms = [];
  for (const member of response.Items) {
    try {
      const roomResponse = await docClient.send(new import_lib_dynamodb.GetCommand({
        TableName: process.env.ROOMS_TABLE,
        Key: { roomId: member.roomId }
      }));
      if (roomResponse.Item) {
        const room = roomResponse.Item;
        rooms.push({
          id: room.roomId,
          status: room.status,
          resultMovieId: room.resultMovieId,
          hostId: room.hostId,
          createdAt: room.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: room.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (error) {
      console.warn(`\u26A0\uFE0F Error obteniendo sala ${member.roomId}:`, error);
    }
  }
  console.log(`\u{1F4CB} Historial obtenido para ${userId}: ${rooms.length} salas`);
  return rooms;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
