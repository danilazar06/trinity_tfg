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

// src/handlers/auth.ts
var auth_exports = {};
__export(auth_exports, {
  ensureUserProfile: () => ensureUserProfile,
  handler: () => handler
});
module.exports = __toCommonJS(auth_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var dynamoClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
var handler = async (event) => {
  console.log("\u{1F510} Post Confirmation Trigger:", JSON.stringify(event, null, 2));
  try {
    const { userAttributes } = event.request;
    const userName = event.userName;
    const userId = userName;
    const email = userAttributes.email;
    const emailVerified = userAttributes.email_verified === "true";
    const userProfile = {
      userId,
      email,
      emailVerified,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: true,
      // Campos opcionales que se pueden actualizar después
      username: email.split("@")[0],
      // Username temporal basado en email
      profilePicture: null,
      preferences: {
        genres: [],
        languages: ["es"]
      }
    };
    await docClient.send(new import_lib_dynamodb.PutCommand({
      TableName: process.env.USERS_TABLE,
      Item: userProfile,
      ConditionExpression: "attribute_not_exists(userId)"
      // Evitar duplicados
    }));
    console.log(`\u2705 Usuario creado exitosamente: ${userId}`);
    return event;
  } catch (error) {
    console.error("\u274C Error en Post Confirmation:", error);
    return event;
  }
};
var ensureUserProfile = async (userId, email) => {
  try {
    const userProfile = {
      userId,
      email: email || `${userId}@unknown.com`,
      emailVerified: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: true,
      username: userId,
      profilePicture: null,
      preferences: {
        genres: [],
        languages: ["es"]
      }
    };
    await docClient.send(new import_lib_dynamodb.PutCommand({
      TableName: process.env.USERS_TABLE,
      Item: userProfile,
      ConditionExpression: "attribute_not_exists(userId)"
    }));
    console.log(`\u2705 Perfil de usuario creado: ${userId}`);
    return userProfile;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.log(`\u2139\uFE0F Usuario ya existe: ${userId}`);
      return null;
    }
    throw error;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ensureUserProfile,
  handler
});
