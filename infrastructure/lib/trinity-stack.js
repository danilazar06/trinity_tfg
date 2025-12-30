"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const appsync = __importStar(require("aws-cdk-lib/aws-appsync"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const path = __importStar(require("path"));
class TrinityStack extends cdk.Stack {
    // Getters para acceso público
    get api() { return this._api; }
    get userPool() { return this._userPool; }
    get usersTable() { return this._usersTable; }
    get roomsTable() { return this._roomsTable; }
    get roomMembersTable() { return this._roomMembersTable; }
    get votesTable() { return this._votesTable; }
    get userVotesTable() { return this._userVotesTable; }
    get moviesCacheTable() { return this._moviesCacheTable; }
    get authHandler() { return this._authHandler; }
    get roomHandler() { return this._roomHandler; }
    get movieHandler() { return this._movieHandler; }
    get voteHandler() { return this._voteHandler; }
    get aiHandler() { return this._aiHandler; }
    get realtimeHandler() { return this._realtimeHandler; }
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        const stage = props.stage || 'dev';
        // A. Base de Datos (DynamoDB) - 5 Tablas
        this.createDynamoDBTables(stage);
        // B. Autenticación (Cognito)
        this.createCognitoAuth(stage);
        // C. Computación (5 Lambdas independientes)
        this.createLambdaFunctions(stage);
        // D. API (AppSync GraphQL)
        this.createAppSyncAPI(stage);
        // Outputs
        this.createOutputs();
    }
    createDynamoDBTables(stage) {
        // 1. UsersTable: PK: userId (String)
        this._usersTable = new dynamodb.Table(this, 'UsersTable', {
            tableName: `trinity-users-${stage}`,
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // 2. RoomsTable: PK: roomId (String)
        this._roomsTable = new dynamodb.Table(this, 'RoomsTable', {
            tableName: `trinity-rooms-${stage}`,
            partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // 3. RoomMembersTable: PK: roomId, SK: userId + GSI
        this._roomMembersTable = new dynamodb.Table(this, 'RoomMembersTable', {
            tableName: `trinity-room-members-${stage}`,
            partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // GSI: UserHistoryIndex (PK: userId, SK: joinedAt)
        this._roomMembersTable.addGlobalSecondaryIndex({
            indexName: 'UserHistoryIndex',
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'joinedAt', type: dynamodb.AttributeType.STRING },
        });
        // 4. VotesTable: PK: roomId, SK: movieId
        this._votesTable = new dynamodb.Table(this, 'VotesTable', {
            tableName: `trinity-votes-${stage}`,
            partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // 5. UserVotesTable: PK: userId, SK: roomId_movieId (prevent duplicate votes)
        this._userVotesTable = new dynamodb.Table(this, 'UserVotesTable', {
            tableName: `trinity-user-votes-${stage}`,
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'roomMovieId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // 6. MoviesCacheTable: PK: tmdbId + TTL
        this._moviesCacheTable = new dynamodb.Table(this, 'MoviesCacheTable', {
            tableName: `trinity-movies-cache-${stage}`,
            partitionKey: { name: 'tmdbId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl',
        });
    }
    createCognitoAuth(stage) {
        // User Pool con auto-verificación de email
        this._userPool = new cognito.UserPool(this, 'TrinityUserPool', {
            userPoolName: `trinity-users-${stage}`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // User Pool Client para app móvil
        const userPoolClient = this._userPool.addClient('TrinityMobileClient', {
            userPoolClientName: `trinity-mobile-${stage}`,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            generateSecret: false, // Para aplicaciones móviles
        });
        // Post Confirmation Trigger (se configurará después de crear AuthHandler)
    }
    createLambdaFunctions(stage) {
        const commonEnvironment = {
            USERS_TABLE: this._usersTable.tableName,
            ROOMS_TABLE: this._roomsTable.tableName,
            ROOM_MEMBERS_TABLE: this._roomMembersTable.tableName,
            VOTES_TABLE: this._votesTable.tableName,
            USER_VOTES_TABLE: this._userVotesTable.tableName,
            MOVIES_CACHE_TABLE: this._moviesCacheTable.tableName,
            STAGE: stage,
        };
        // 1. AuthHandler: Post Confirmation Trigger
        this._authHandler = new lambda.Function(this, 'AuthHandler', {
            functionName: `trinity-auth-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'auth.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            environment: commonEnvironment,
        });
        // Configurar Post Confirmation Trigger
        this._userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, this._authHandler);
        // Permisos: Write en UsersTable
        this._usersTable.grantWriteData(this._authHandler);
        // 2. RoomHandler: Gestiona salas
        this._roomHandler = new lambda.Function(this, 'RoomHandler', {
            functionName: `trinity-room-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'room.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: commonEnvironment,
        });
        // Permisos: RW en RoomsTable y RoomMembersTable
        this._roomsTable.grantReadWriteData(this._roomHandler);
        this._roomMembersTable.grantReadWriteData(this._roomHandler);
        // 3. MovieHandler: Circuit Breaker + Cache
        this._movieHandler = new lambda.Function(this, 'MovieHandler', {
            functionName: `trinity-movie-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'movie.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: {
                ...commonEnvironment,
                TMDB_API_KEY: process.env.TMDB_API_KEY || '',
            },
        });
        // Permisos: RW en MoviesCacheTable
        this._moviesCacheTable.grantReadWriteData(this._movieHandler);
        // 4. VoteHandler: Lógica Stop-on-Match
        this._voteHandler = new lambda.Function(this, 'VoteHandler', {
            functionName: `trinity-vote-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'vote.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: commonEnvironment,
        });
        // Permisos: RW en VotesTable y RoomsTable, Read en RoomMembersTable, RW en UserVotesTable
        this._votesTable.grantReadWriteData(this._voteHandler);
        this._roomsTable.grantReadWriteData(this._voteHandler);
        this._roomMembersTable.grantReadData(this._voteHandler);
        this._userVotesTable.grantReadWriteData(this._voteHandler);
        // 5. AIHandler: Chat Contextual con Salamandra
        this._aiHandler = new lambda.Function(this, 'AIHandler', {
            functionName: `trinity-ai-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'ai.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: {
                ...commonEnvironment,
                HF_API_TOKEN: process.env.HF_API_TOKEN || '',
            },
        });
        // 6. RealtimeHandler: AppSync Subscriptions
        this._realtimeHandler = new lambda.Function(this, 'RealtimeHandler', {
            functionName: `trinity-realtime-${stage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'realtime.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lib/handlers')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: commonEnvironment,
        });
        // Permisos para RealtimeHandler: Read en RoomMembersTable para validación de acceso
        this._roomMembersTable.grantReadData(this._realtimeHandler);
    }
    createAppSyncAPI(stage) {
        // GraphQL API con definición desde archivo
        this._api = new appsync.GraphqlApi(this, 'TrinityGraphQLApi', {
            name: `trinity-api-${stage}`,
            definition: appsync.Definition.fromFile(path.join(__dirname, '../schema.graphql')),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: appsync.AuthorizationType.USER_POOL,
                    userPoolConfig: {
                        userPool: this._userPool,
                    },
                },
                additionalAuthorizationModes: [
                    {
                        authorizationType: appsync.AuthorizationType.API_KEY,
                        apiKeyConfig: {
                            expires: cdk.Expiration.after(cdk.Duration.days(365)),
                        },
                    },
                ],
            },
            logConfig: {
                fieldLogLevel: appsync.FieldLogLevel.ERROR,
            },
            xrayEnabled: false, // Optimización Free Tier
        });
        // Crear 6 Lambda Data Sources
        const authDataSource = this._api.addLambdaDataSource('AuthDataSource', this._authHandler);
        const roomDataSource = this._api.addLambdaDataSource('RoomDataSource', this._roomHandler);
        const movieDataSource = this._api.addLambdaDataSource('MovieDataSource', this._movieHandler);
        const voteDataSource = this._api.addLambdaDataSource('VoteDataSource', this._voteHandler);
        const aiDataSource = this._api.addLambdaDataSource('AIDataSource', this._aiHandler);
        const realtimeDataSource = this._api.addLambdaDataSource('RealtimeDataSource', this._realtimeHandler);
        // Definir Resolvers según el schema
        // Queries
        movieDataSource.createResolver('GetMoviesResolver', {
            typeName: 'Query',
            fieldName: 'getMovies',
        });
        aiDataSource.createResolver('GetChatRecommendationsResolver', {
            typeName: 'Query',
            fieldName: 'getChatRecommendations',
        });
        roomDataSource.createResolver('GetMyHistoryResolver', {
            typeName: 'Query',
            fieldName: 'getMyHistory',
        });
        // Mutations
        roomDataSource.createResolver('CreateRoomResolver', {
            typeName: 'Mutation',
            fieldName: 'createRoom',
        });
        roomDataSource.createResolver('JoinRoomResolver', {
            typeName: 'Mutation',
            fieldName: 'joinRoom',
        });
        voteDataSource.createResolver('VoteResolver', {
            typeName: 'Mutation',
            fieldName: 'vote',
        });
        // Real-time event publishing resolvers
        realtimeDataSource.createResolver('PublishRoomEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishRoomEvent',
        });
        realtimeDataSource.createResolver('PublishVoteEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishVoteEvent',
        });
        realtimeDataSource.createResolver('PublishMatchEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishMatchEvent',
        });
        realtimeDataSource.createResolver('PublishMemberEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishMemberEvent',
        });
        realtimeDataSource.createResolver('PublishRoleEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishRoleEvent',
        });
        realtimeDataSource.createResolver('PublishModerationEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishModerationEvent',
        });
        realtimeDataSource.createResolver('PublishScheduleEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishScheduleEvent',
        });
        realtimeDataSource.createResolver('PublishThemeEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishThemeEvent',
        });
        realtimeDataSource.createResolver('PublishSettingsEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishSettingsEvent',
        });
        realtimeDataSource.createResolver('PublishChatEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishChatEvent',
        });
        realtimeDataSource.createResolver('PublishSuggestionEventResolver', {
            typeName: 'Mutation',
            fieldName: 'publishSuggestionEvent',
        });
    }
    createOutputs() {
        new cdk.CfnOutput(this, 'GraphQLApiUrl', {
            value: this._api.graphqlUrl,
            description: 'URL de la API GraphQL',
        });
        new cdk.CfnOutput(this, 'GraphQLApiId', {
            value: this._api.apiId,
            description: 'ID de la API GraphQL',
        });
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this._userPool.userPoolId,
            description: 'ID del User Pool de Cognito',
        });
        new cdk.CfnOutput(this, 'Region', {
            value: cdk.Stack.of(this).region,
            description: 'Región de AWS',
        });
        // Nombres de las funciones Lambda
        new cdk.CfnOutput(this, 'AuthHandlerName', {
            value: this._authHandler.functionName,
        });
        new cdk.CfnOutput(this, 'RoomHandlerName', {
            value: this._roomHandler.functionName,
        });
        new cdk.CfnOutput(this, 'MovieHandlerName', {
            value: this._movieHandler.functionName,
        });
        new cdk.CfnOutput(this, 'VoteHandlerName', {
            value: this._voteHandler.functionName,
        });
        new cdk.CfnOutput(this, 'AIHandlerName', {
            value: this._aiHandler.functionName,
        });
        new cdk.CfnOutput(this, 'RealtimeHandlerName', {
            value: this._realtimeHandler.functionName,
        });
    }
}
exports.TrinityStack = TrinityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaW5pdHktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELGlFQUFtRDtBQUNuRCwrREFBaUQ7QUFDakQsbUVBQXFEO0FBRXJELDJDQUE2QjtBQU03QixNQUFhLFlBQWEsU0FBUSxHQUFHLENBQUMsS0FBSztJQW9CekMsOEJBQThCO0lBQzlCLElBQVcsR0FBRyxLQUFLLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdEMsSUFBVyxRQUFRLEtBQUssT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoRCxJQUFXLFVBQVUsS0FBSyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3BELElBQVcsVUFBVSxLQUFLLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDcEQsSUFBVyxnQkFBZ0IsS0FBSyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFDaEUsSUFBVyxVQUFVLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNwRCxJQUFXLGNBQWMsS0FBSyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBQzVELElBQVcsZ0JBQWdCLEtBQUssT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLElBQVcsV0FBVyxLQUFLLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDdEQsSUFBVyxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN0RCxJQUFXLFlBQVksS0FBSyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQ3hELElBQVcsV0FB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QUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWTtTQUN0QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVk7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVk7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVk7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBamJELG9DQWliQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGFwcHN5bmMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcHN5bmMnO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpbml0eVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgc3RhZ2U/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUcmluaXR5U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHByaXZhdGUgX2FwaSE6IGFwcHN5bmMuR3JhcGhxbEFwaTtcclxuICBwcml2YXRlIF91c2VyUG9vbCE6IGNvZ25pdG8uVXNlclBvb2w7XHJcbiAgXHJcbiAgLy8gRHluYW1vREIgVGFibGVzXHJcbiAgcHJpdmF0ZSBfdXNlcnNUYWJsZSE6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHByaXZhdGUgX3Jvb21zVGFibGUhOiBkeW5hbW9kYi5UYWJsZTtcclxuICBwcml2YXRlIF9yb29tTWVtYmVyc1RhYmxlITogZHluYW1vZGIuVGFibGU7XHJcbiAgcHJpdmF0ZSBfdm90ZXNUYWJsZSE6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHByaXZhdGUgX3VzZXJWb3Rlc1RhYmxlITogZHluYW1vZGIuVGFibGU7XHJcbiAgcHJpdmF0ZSBfbW92aWVzQ2FjaGVUYWJsZSE6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIFxyXG4gIC8vIExhbWJkYSBGdW5jdGlvbnNcclxuICBwcml2YXRlIF9hdXRoSGFuZGxlciE6IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwcml2YXRlIF9yb29tSGFuZGxlciE6IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwcml2YXRlIF9tb3ZpZUhhbmRsZXIhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHJpdmF0ZSBfdm90ZUhhbmRsZXIhOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHJpdmF0ZSBfYWlIYW5kbGVyITogbGFtYmRhLkZ1bmN0aW9uO1xyXG4gIHByaXZhdGUgX3JlYWx0aW1lSGFuZGxlciE6IGxhbWJkYS5GdW5jdGlvbjtcclxuXHJcbiAgLy8gR2V0dGVycyBwYXJhIGFjY2VzbyBww7pibGljb1xyXG4gIHB1YmxpYyBnZXQgYXBpKCkgeyByZXR1cm4gdGhpcy5fYXBpOyB9XHJcbiAgcHVibGljIGdldCB1c2VyUG9vbCgpIHsgcmV0dXJuIHRoaXMuX3VzZXJQb29sOyB9XHJcbiAgcHVibGljIGdldCB1c2Vyc1RhYmxlKCkgeyByZXR1cm4gdGhpcy5fdXNlcnNUYWJsZTsgfVxyXG4gIHB1YmxpYyBnZXQgcm9vbXNUYWJsZSgpIHsgcmV0dXJuIHRoaXMuX3Jvb21zVGFibGU7IH1cclxuICBwdWJsaWMgZ2V0IHJvb21NZW1iZXJzVGFibGUoKSB7IHJldHVybiB0aGlzLl9yb29tTWVtYmVyc1RhYmxlOyB9XHJcbiAgcHVibGljIGdldCB2b3Rlc1RhYmxlKCkgeyByZXR1cm4gdGhpcy5fdm90ZXNUYWJsZTsgfVxyXG4gIHB1YmxpYyBnZXQgdXNlclZvdGVzVGFibGUoKSB7IHJldHVybiB0aGlzLl91c2VyVm90ZXNUYWJsZTsgfVxyXG4gIHB1YmxpYyBnZXQgbW92aWVzQ2FjaGVUYWJsZSgpIHsgcmV0dXJuIHRoaXMuX21vdmllc0NhY2hlVGFibGU7IH1cclxuICBwdWJsaWMgZ2V0IGF1dGhIYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fYXV0aEhhbmRsZXI7IH1cclxuICBwdWJsaWMgZ2V0IHJvb21IYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fcm9vbUhhbmRsZXI7IH1cclxuICBwdWJsaWMgZ2V0IG1vdmllSGFuZGxlcigpIHsgcmV0dXJuIHRoaXMuX21vdmllSGFuZGxlcjsgfVxyXG4gIHB1YmxpYyBnZXQgdm90ZUhhbmRsZXIoKSB7IHJldHVybiB0aGlzLl92b3RlSGFuZGxlcjsgfVxyXG4gIHB1YmxpYyBnZXQgYWlIYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fYWlIYW5kbGVyOyB9XHJcbiAgcHVibGljIGdldCByZWFsdGltZUhhbmRsZXIoKSB7IHJldHVybiB0aGlzLl9yZWFsdGltZUhhbmRsZXI7IH1cclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFRyaW5pdHlTdGFja1Byb3BzID0ge30pIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHN0YWdlID0gcHJvcHMuc3RhZ2UgfHwgJ2Rldic7XHJcblxyXG4gICAgLy8gQS4gQmFzZSBkZSBEYXRvcyAoRHluYW1vREIpIC0gNSBUYWJsYXNcclxuICAgIHRoaXMuY3JlYXRlRHluYW1vREJUYWJsZXMoc3RhZ2UpO1xyXG4gICAgXHJcbiAgICAvLyBCLiBBdXRlbnRpY2FjacOzbiAoQ29nbml0bylcclxuICAgIHRoaXMuY3JlYXRlQ29nbml0b0F1dGgoc3RhZ2UpO1xyXG4gICAgXHJcbiAgICAvLyBDLiBDb21wdXRhY2nDs24gKDUgTGFtYmRhcyBpbmRlcGVuZGllbnRlcylcclxuICAgIHRoaXMuY3JlYXRlTGFtYmRhRnVuY3Rpb25zKHN0YWdlKTtcclxuICAgIFxyXG4gICAgLy8gRC4gQVBJIChBcHBTeW5jIEdyYXBoUUwpXHJcbiAgICB0aGlzLmNyZWF0ZUFwcFN5bmNBUEkoc3RhZ2UpO1xyXG4gICAgXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICB0aGlzLmNyZWF0ZU91dHB1dHMoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlRHluYW1vREJUYWJsZXMoc3RhZ2U6IHN0cmluZykge1xyXG4gICAgLy8gMS4gVXNlcnNUYWJsZTogUEs6IHVzZXJJZCAoU3RyaW5nKVxyXG4gICAgdGhpcy5fdXNlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVXNlcnNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJpbml0eS11c2Vycy0ke3N0YWdlfWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDIuIFJvb21zVGFibGU6IFBLOiByb29tSWQgKFN0cmluZylcclxuICAgIHRoaXMuX3Jvb21zVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1Jvb21zVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyaW5pdHktcm9vbXMtJHtzdGFnZX1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3Jvb21JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAzLiBSb29tTWVtYmVyc1RhYmxlOiBQSzogcm9vbUlkLCBTSzogdXNlcklkICsgR1NJXHJcbiAgICB0aGlzLl9yb29tTWVtYmVyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdSb29tTWVtYmVyc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmluaXR5LXJvb20tbWVtYmVycy0ke3N0YWdlfWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncm9vbUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogVXNlckhpc3RvcnlJbmRleCAoUEs6IHVzZXJJZCwgU0s6IGpvaW5lZEF0KVxyXG4gICAgdGhpcy5fcm9vbU1lbWJlcnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ1VzZXJIaXN0b3J5SW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2pvaW5lZEF0JywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDQuIFZvdGVzVGFibGU6IFBLOiByb29tSWQsIFNLOiBtb3ZpZUlkXHJcbiAgICB0aGlzLl92b3Rlc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdWb3Rlc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmluaXR5LXZvdGVzLSR7c3RhZ2V9YCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdyb29tSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdtb3ZpZUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDUuIFVzZXJWb3Rlc1RhYmxlOiBQSzogdXNlcklkLCBTSzogcm9vbUlkX21vdmllSWQgKHByZXZlbnQgZHVwbGljYXRlIHZvdGVzKVxyXG4gICAgdGhpcy5fdXNlclZvdGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJWb3Rlc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmluaXR5LXVzZXItdm90ZXMtJHtzdGFnZX1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3Jvb21Nb3ZpZUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDYuIE1vdmllc0NhY2hlVGFibGU6IFBLOiB0bWRiSWQgKyBUVExcclxuICAgIHRoaXMuX21vdmllc0NhY2hlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ01vdmllc0NhY2hlVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyaW5pdHktbW92aWVzLWNhY2hlLSR7c3RhZ2V9YCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0bWRiSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjcmVhdGVDb2duaXRvQXV0aChzdGFnZTogc3RyaW5nKSB7XHJcbiAgICAvLyBVc2VyIFBvb2wgY29uIGF1dG8tdmVyaWZpY2FjacOzbiBkZSBlbWFpbFxyXG4gICAgdGhpcy5fdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVHJpbml0eVVzZXJQb29sJywge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IGB0cmluaXR5LXVzZXJzLSR7c3RhZ2V9YCxcclxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgYXV0b1ZlcmlmeToge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFVzZXIgUG9vbCBDbGllbnQgcGFyYSBhcHAgbcOzdmlsXHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHRoaXMuX3VzZXJQb29sLmFkZENsaWVudCgnVHJpbml0eU1vYmlsZUNsaWVudCcsIHtcclxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgdHJpbml0eS1tb2JpbGUtJHtzdGFnZX1gLFxyXG4gICAgICBhdXRoRmxvd3M6IHtcclxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLCAvLyBQYXJhIGFwbGljYWNpb25lcyBtw7N2aWxlc1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUG9zdCBDb25maXJtYXRpb24gVHJpZ2dlciAoc2UgY29uZmlndXJhcsOhIGRlc3B1w6lzIGRlIGNyZWFyIEF1dGhIYW5kbGVyKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjcmVhdGVMYW1iZGFGdW5jdGlvbnMoc3RhZ2U6IHN0cmluZykge1xyXG4gICAgY29uc3QgY29tbW9uRW52aXJvbm1lbnQgPSB7XHJcbiAgICAgIFVTRVJTX1RBQkxFOiB0aGlzLl91c2Vyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgUk9PTVNfVEFCTEU6IHRoaXMuX3Jvb21zVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBST09NX01FTUJFUlNfVEFCTEU6IHRoaXMuX3Jvb21NZW1iZXJzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBWT1RFU19UQUJMRTogdGhpcy5fdm90ZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfVk9URVNfVEFCTEU6IHRoaXMuX3VzZXJWb3Rlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgTU9WSUVTX0NBQ0hFX1RBQkxFOiB0aGlzLl9tb3ZpZXNDYWNoZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgU1RBR0U6IHN0YWdlLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBBdXRoSGFuZGxlcjogUG9zdCBDb25maXJtYXRpb24gVHJpZ2dlclxyXG4gICAgdGhpcy5fYXV0aEhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdXRoSGFuZGxlcicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1hdXRoLSR7c3RhZ2V9YCxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdhdXRoLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xpYi9oYW5kbGVycycpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyYXIgUG9zdCBDb25maXJtYXRpb24gVHJpZ2dlclxyXG4gICAgdGhpcy5fdXNlclBvb2wuYWRkVHJpZ2dlcihjb2duaXRvLlVzZXJQb29sT3BlcmF0aW9uLlBPU1RfQ09ORklSTUFUSU9OLCB0aGlzLl9hdXRoSGFuZGxlcik7XHJcblxyXG4gICAgLy8gUGVybWlzb3M6IFdyaXRlIGVuIFVzZXJzVGFibGVcclxuICAgIHRoaXMuX3VzZXJzVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5fYXV0aEhhbmRsZXIpO1xyXG5cclxuICAgIC8vIDIuIFJvb21IYW5kbGVyOiBHZXN0aW9uYSBzYWxhc1xyXG4gICAgdGhpcy5fcm9vbUhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSb29tSGFuZGxlcicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1yb29tLSR7c3RhZ2V9YCxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdyb29tLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xpYi9oYW5kbGVycycpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBlcm1pc29zOiBSVyBlbiBSb29tc1RhYmxlIHkgUm9vbU1lbWJlcnNUYWJsZVxyXG4gICAgdGhpcy5fcm9vbXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5fcm9vbUhhbmRsZXIpO1xyXG4gICAgdGhpcy5fcm9vbU1lbWJlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5fcm9vbUhhbmRsZXIpO1xyXG5cclxuICAgIC8vIDMuIE1vdmllSGFuZGxlcjogQ2lyY3VpdCBCcmVha2VyICsgQ2FjaGVcclxuICAgIHRoaXMuX21vdmllSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01vdmllSGFuZGxlcicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1tb3ZpZS0ke3N0YWdlfWAsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAnbW92aWUuaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGliL2hhbmRsZXJzJykpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAuLi5jb21tb25FbnZpcm9ubWVudCxcclxuICAgICAgICBUTURCX0FQSV9LRVk6IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWSB8fCAnJyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBlcm1pc29zOiBSVyBlbiBNb3ZpZXNDYWNoZVRhYmxlXHJcbiAgICB0aGlzLl9tb3ZpZXNDYWNoZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLl9tb3ZpZUhhbmRsZXIpO1xyXG5cclxuICAgIC8vIDQuIFZvdGVIYW5kbGVyOiBMw7NnaWNhIFN0b3Atb24tTWF0Y2hcclxuICAgIHRoaXMuX3ZvdGVIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVm90ZUhhbmRsZXInLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktdm90ZS0ke3N0YWdlfWAsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICBoYW5kbGVyOiAndm90ZS5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9saWIvaGFuZGxlcnMnKSksXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQZXJtaXNvczogUlcgZW4gVm90ZXNUYWJsZSB5IFJvb21zVGFibGUsIFJlYWQgZW4gUm9vbU1lbWJlcnNUYWJsZSwgUlcgZW4gVXNlclZvdGVzVGFibGVcclxuICAgIHRoaXMuX3ZvdGVzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuX3ZvdGVIYW5kbGVyKTtcclxuICAgIHRoaXMuX3Jvb21zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuX3ZvdGVIYW5kbGVyKTtcclxuICAgIHRoaXMuX3Jvb21NZW1iZXJzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLl92b3RlSGFuZGxlcik7XHJcbiAgICB0aGlzLl91c2VyVm90ZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5fdm90ZUhhbmRsZXIpO1xyXG5cclxuICAgIC8vIDUuIEFJSGFuZGxlcjogQ2hhdCBDb250ZXh0dWFsIGNvbiBTYWxhbWFuZHJhXHJcbiAgICB0aGlzLl9haUhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBSUhhbmRsZXInLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktYWktJHtzdGFnZX1gLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ2FpLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xpYi9oYW5kbGVycycpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgLi4uY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICAgICAgSEZfQVBJX1RPS0VOOiBwcm9jZXNzLmVudi5IRl9BUElfVE9LRU4gfHwgJycsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA2LiBSZWFsdGltZUhhbmRsZXI6IEFwcFN5bmMgU3Vic2NyaXB0aW9uc1xyXG4gICAgdGhpcy5fcmVhbHRpbWVIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVhbHRpbWVIYW5kbGVyJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmluaXR5LXJlYWx0aW1lLSR7c3RhZ2V9YCxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIGhhbmRsZXI6ICdyZWFsdGltZS5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9saWIvaGFuZGxlcnMnKSksXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQZXJtaXNvcyBwYXJhIFJlYWx0aW1lSGFuZGxlcjogUmVhZCBlbiBSb29tTWVtYmVyc1RhYmxlIHBhcmEgdmFsaWRhY2nDs24gZGUgYWNjZXNvXHJcbiAgICB0aGlzLl9yb29tTWVtYmVyc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5fcmVhbHRpbWVIYW5kbGVyKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlQXBwU3luY0FQSShzdGFnZTogc3RyaW5nKSB7XHJcbiAgICAvLyBHcmFwaFFMIEFQSSBjb24gZGVmaW5pY2nDs24gZGVzZGUgYXJjaGl2b1xyXG4gICAgdGhpcy5fYXBpID0gbmV3IGFwcHN5bmMuR3JhcGhxbEFwaSh0aGlzLCAnVHJpbml0eUdyYXBoUUxBcGknLCB7XHJcbiAgICAgIG5hbWU6IGB0cmluaXR5LWFwaS0ke3N0YWdlfWAsXHJcbiAgICAgIGRlZmluaXRpb246IGFwcHN5bmMuRGVmaW5pdGlvbi5mcm9tRmlsZShcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vc2NoZW1hLmdyYXBocWwnKVxyXG4gICAgICApLFxyXG4gICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XHJcbiAgICAgICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcclxuICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLlVTRVJfUE9PTCxcclxuICAgICAgICAgIHVzZXJQb29sQ29uZmlnOiB7XHJcbiAgICAgICAgICAgIHVzZXJQb29sOiB0aGlzLl91c2VyUG9vbCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZGRpdGlvbmFsQXV0aG9yaXphdGlvbk1vZGVzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcHBzeW5jLkF1dGhvcml6YXRpb25UeXBlLkFQSV9LRVksXHJcbiAgICAgICAgICAgIGFwaUtleUNvbmZpZzoge1xyXG4gICAgICAgICAgICAgIGV4cGlyZXM6IGNkay5FeHBpcmF0aW9uLmFmdGVyKGNkay5EdXJhdGlvbi5kYXlzKDM2NSkpLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgICBsb2dDb25maWc6IHtcclxuICAgICAgICBmaWVsZExvZ0xldmVsOiBhcHBzeW5jLkZpZWxkTG9nTGV2ZWwuRVJST1IsXHJcbiAgICAgIH0sXHJcbiAgICAgIHhyYXlFbmFibGVkOiBmYWxzZSwgLy8gT3B0aW1pemFjacOzbiBGcmVlIFRpZXJcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWFyIDYgTGFtYmRhIERhdGEgU291cmNlc1xyXG4gICAgY29uc3QgYXV0aERhdGFTb3VyY2UgPSB0aGlzLl9hcGkuYWRkTGFtYmRhRGF0YVNvdXJjZSgnQXV0aERhdGFTb3VyY2UnLCB0aGlzLl9hdXRoSGFuZGxlcik7XHJcbiAgICBjb25zdCByb29tRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdSb29tRGF0YVNvdXJjZScsIHRoaXMuX3Jvb21IYW5kbGVyKTtcclxuICAgIGNvbnN0IG1vdmllRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdNb3ZpZURhdGFTb3VyY2UnLCB0aGlzLl9tb3ZpZUhhbmRsZXIpO1xyXG4gICAgY29uc3Qgdm90ZURhdGFTb3VyY2UgPSB0aGlzLl9hcGkuYWRkTGFtYmRhRGF0YVNvdXJjZSgnVm90ZURhdGFTb3VyY2UnLCB0aGlzLl92b3RlSGFuZGxlcik7XHJcbiAgICBjb25zdCBhaURhdGFTb3VyY2UgPSB0aGlzLl9hcGkuYWRkTGFtYmRhRGF0YVNvdXJjZSgnQUlEYXRhU291cmNlJywgdGhpcy5fYWlIYW5kbGVyKTtcclxuICAgIGNvbnN0IHJlYWx0aW1lRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdSZWFsdGltZURhdGFTb3VyY2UnLCB0aGlzLl9yZWFsdGltZUhhbmRsZXIpO1xyXG5cclxuICAgIC8vIERlZmluaXIgUmVzb2x2ZXJzIHNlZ8O6biBlbCBzY2hlbWFcclxuICAgIFxyXG4gICAgLy8gUXVlcmllc1xyXG4gICAgbW92aWVEYXRhU291cmNlLmNyZWF0ZVJlc29sdmVyKCdHZXRNb3ZpZXNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldE1vdmllcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBhaURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0dldENoYXRSZWNvbW1lbmRhdGlvbnNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0dldE15SGlzdG9yeVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0TXlIaXN0b3J5JyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE11dGF0aW9uc1xyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0NyZWF0ZVJvb21SZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2NyZWF0ZVJvb20nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0pvaW5Sb29tUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdqb2luUm9vbScsXHJcbiAgICB9KTtcclxuXHJcbiAgICB2b3RlRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignVm90ZVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAndm90ZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZWFsLXRpbWUgZXZlbnQgcHVibGlzaGluZyByZXNvbHZlcnNcclxuICAgIHJlYWx0aW1lRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFJvb21FdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaFJvb21FdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICByZWFsdGltZURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hWb3RlRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hWb3RlRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmVhbHRpbWVEYXRhU291cmNlLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoTWF0Y2hFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaE1hdGNoRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmVhbHRpbWVEYXRhU291cmNlLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoTWVtYmVyRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hNZW1iZXJFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICByZWFsdGltZURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hSb2xlRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hSb2xlRXZlbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmVhbHRpbWVEYXRhU291cmNlLmNyZWF0ZVJlc29sdmVyKCdQdWJsaXNoTW9kZXJhdGlvbkV2ZW50UmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdwdWJsaXNoTW9kZXJhdGlvbkV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIHJlYWx0aW1lRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFNjaGVkdWxlRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hTY2hlZHVsZUV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIHJlYWx0aW1lRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFRoZW1lRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hUaGVtZUV2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIHJlYWx0aW1lRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaFNldHRpbmdzRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hTZXR0aW5nc0V2ZW50JyxcclxuICAgIH0pO1xyXG5cclxuICAgIHJlYWx0aW1lRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignUHVibGlzaENoYXRFdmVudFJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAncHVibGlzaENoYXRFdmVudCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICByZWFsdGltZURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ1B1Ymxpc2hTdWdnZXN0aW9uRXZlbnRSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ3B1Ymxpc2hTdWdnZXN0aW9uRXZlbnQnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZU91dHB1dHMoKSB7XHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR3JhcGhRTEFwaVVybCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX2FwaS5ncmFwaHFsVXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBkZSBsYSBBUEkgR3JhcGhRTCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR3JhcGhRTEFwaUlkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fYXBpLmFwaUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIGRlIGxhIEFQSSBHcmFwaFFMJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fdXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdJRCBkZWwgVXNlciBQb29sIGRlIENvZ25pdG8nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1JlZ2lvbicsIHtcclxuICAgICAgdmFsdWU6IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVnacOzbiBkZSBBV1MnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTm9tYnJlcyBkZSBsYXMgZnVuY2lvbmVzIExhbWJkYVxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F1dGhIYW5kbGVyTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX2F1dGhIYW5kbGVyLmZ1bmN0aW9uTmFtZSxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSb29tSGFuZGxlck5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl9yb29tSGFuZGxlci5mdW5jdGlvbk5hbWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTW92aWVIYW5kbGVyTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX21vdmllSGFuZGxlci5mdW5jdGlvbk5hbWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVm90ZUhhbmRsZXJOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fdm90ZUhhbmRsZXIuZnVuY3Rpb25OYW1lLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FJSGFuZGxlck5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl9haUhhbmRsZXIuZnVuY3Rpb25OYW1lLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1JlYWx0aW1lSGFuZGxlck5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl9yZWFsdGltZUhhbmRsZXIuZnVuY3Rpb25OYW1lLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59Il19