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
const lambda = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const lambdaRuntime = __importStar(require("aws-cdk-lib/aws-lambda"));
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
    get moviesCacheTable() { return this._moviesCacheTable; }
    get authHandler() { return this._authHandler; }
    get roomHandler() { return this._roomHandler; }
    get movieHandler() { return this._movieHandler; }
    get voteHandler() { return this._voteHandler; }
    get aiHandler() { return this._aiHandler; }
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
        // 5. MoviesCacheTable: PK: tmdbId + TTL
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
            MOVIES_CACHE_TABLE: this._moviesCacheTable.tableName,
            STAGE: stage,
        };
        // 1. AuthHandler: Post Confirmation Trigger
        this._authHandler = new lambda.NodejsFunction(this, 'AuthHandler', {
            functionName: `trinity-auth-${stage}`,
            entry: path.join(__dirname, '../src/handlers/auth.ts'),
            runtime: lambdaRuntime.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            environment: commonEnvironment,
            bundling: {
                forceDockerBundling: false,
            },
        });
        // Configurar Post Confirmation Trigger
        this._userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, this._authHandler);
        // Permisos: Write en UsersTable
        this._usersTable.grantWriteData(this._authHandler);
        // 2. RoomHandler: Gestiona salas
        this._roomHandler = new lambda.NodejsFunction(this, 'RoomHandler', {
            functionName: `trinity-room-${stage}`,
            entry: path.join(__dirname, '../src/handlers/room.ts'),
            runtime: lambdaRuntime.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: commonEnvironment,
            bundling: {
                forceDockerBundling: false,
            },
        });
        // Permisos: RW en RoomsTable y RoomMembersTable
        this._roomsTable.grantReadWriteData(this._roomHandler);
        this._roomMembersTable.grantReadWriteData(this._roomHandler);
        // 3. MovieHandler: Circuit Breaker + Cache
        this._movieHandler = new lambda.NodejsFunction(this, 'MovieHandler', {
            functionName: `trinity-movie-${stage}`,
            entry: path.join(__dirname, '../src/handlers/movie.ts'),
            runtime: lambdaRuntime.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: {
                ...commonEnvironment,
                TMDB_API_KEY: process.env.TMDB_API_KEY || '',
            },
            bundling: {
                forceDockerBundling: false,
            },
        });
        // Permisos: RW en MoviesCacheTable
        this._moviesCacheTable.grantReadWriteData(this._movieHandler);
        // 4. VoteHandler: Lógica Stop-on-Match
        this._voteHandler = new lambda.NodejsFunction(this, 'VoteHandler', {
            functionName: `trinity-vote-${stage}`,
            entry: path.join(__dirname, '../src/handlers/vote.ts'),
            runtime: lambdaRuntime.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: commonEnvironment,
            bundling: {
                forceDockerBundling: false,
            },
        });
        // Permisos: RW en VotesTable y RoomsTable, Read en RoomMembersTable
        this._votesTable.grantReadWriteData(this._voteHandler);
        this._roomsTable.grantReadWriteData(this._voteHandler);
        this._roomMembersTable.grantReadData(this._voteHandler);
        // 5. AIHandler: Chat Contextual con Salamandra
        this._aiHandler = new lambda.NodejsFunction(this, 'AIHandler', {
            functionName: `trinity-ai-${stage}`,
            entry: path.join(__dirname, '../src/handlers/ai.ts'),
            runtime: lambdaRuntime.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: {
                ...commonEnvironment,
                HF_API_TOKEN: process.env.HF_API_TOKEN || '',
            },
            bundling: {
                forceDockerBundling: false,
            },
        });
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
        // Crear 5 Lambda Data Sources
        const authDataSource = this._api.addLambdaDataSource('AuthDataSource', this._authHandler);
        const roomDataSource = this._api.addLambdaDataSource('RoomDataSource', this._roomHandler);
        const movieDataSource = this._api.addLambdaDataSource('MovieDataSource', this._movieHandler);
        const voteDataSource = this._api.addLambdaDataSource('VoteDataSource', this._voteHandler);
        const aiDataSource = this._api.addLambdaDataSource('AIDataSource', this._aiHandler);
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
    }
}
exports.TrinityStack = TrinityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaW5pdHktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELGlFQUFtRDtBQUNuRCxzRUFBd0Q7QUFDeEQsc0VBQXdEO0FBQ3hELG1FQUFxRDtBQUVyRCwyQ0FBNkI7QUFNN0IsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFrQnpDLDhCQUE4QjtJQUM5QixJQUFXLEdBQUcsS0FBSyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLElBQVcsUUFBUSxLQUFLLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsSUFBVyxVQUFVLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNwRCxJQUFXLFVBQVUsS0FBSyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3BELElBQVcsZ0JBQWdCLEtBQUssT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLElBQVcsVUFBVSxLQUFLLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDcEQsSUFBVyxnQkFBZ0IsS0FBSyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFDaEUsSUFBVyxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN0RCxJQUFXLFdBQVcsS0FBSyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQ3RELElBQVcsWUFBWSxLQUFLLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDeEQsSUFBVyxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJ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J2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgYXBwc3luYyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwc3luYyc7XHJcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGFSdW50aW1lIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpbml0eVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgc3RhZ2U/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUcmluaXR5U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHByaXZhdGUgX2FwaSE6IGFwcHN5bmMuR3JhcGhxbEFwaTtcclxuICBwcml2YXRlIF91c2VyUG9vbCE6IGNvZ25pdG8uVXNlclBvb2w7XHJcbiAgXHJcbiAgLy8gRHluYW1vREIgVGFibGVzXHJcbiAgcHJpdmF0ZSBfdXNlcnNUYWJsZSE6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHByaXZhdGUgX3Jvb21zVGFibGUhOiBkeW5hbW9kYi5UYWJsZTtcclxuICBwcml2YXRlIF9yb29tTWVtYmVyc1RhYmxlITogZHluYW1vZGIuVGFibGU7XHJcbiAgcHJpdmF0ZSBfdm90ZXNUYWJsZSE6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHByaXZhdGUgX21vdmllc0NhY2hlVGFibGUhOiBkeW5hbW9kYi5UYWJsZTtcclxuICBcclxuICAvLyBMYW1iZGEgRnVuY3Rpb25zXHJcbiAgcHJpdmF0ZSBfYXV0aEhhbmRsZXIhOiBsYW1iZGEuTm9kZWpzRnVuY3Rpb247XHJcbiAgcHJpdmF0ZSBfcm9vbUhhbmRsZXIhOiBsYW1iZGEuTm9kZWpzRnVuY3Rpb247XHJcbiAgcHJpdmF0ZSBfbW92aWVIYW5kbGVyITogbGFtYmRhLk5vZGVqc0Z1bmN0aW9uO1xyXG4gIHByaXZhdGUgX3ZvdGVIYW5kbGVyITogbGFtYmRhLk5vZGVqc0Z1bmN0aW9uO1xyXG4gIHByaXZhdGUgX2FpSGFuZGxlciE6IGxhbWJkYS5Ob2RlanNGdW5jdGlvbjtcclxuXHJcbiAgLy8gR2V0dGVycyBwYXJhIGFjY2VzbyBww7pibGljb1xyXG4gIHB1YmxpYyBnZXQgYXBpKCkgeyByZXR1cm4gdGhpcy5fYXBpOyB9XHJcbiAgcHVibGljIGdldCB1c2VyUG9vbCgpIHsgcmV0dXJuIHRoaXMuX3VzZXJQb29sOyB9XHJcbiAgcHVibGljIGdldCB1c2Vyc1RhYmxlKCkgeyByZXR1cm4gdGhpcy5fdXNlcnNUYWJsZTsgfVxyXG4gIHB1YmxpYyBnZXQgcm9vbXNUYWJsZSgpIHsgcmV0dXJuIHRoaXMuX3Jvb21zVGFibGU7IH1cclxuICBwdWJsaWMgZ2V0IHJvb21NZW1iZXJzVGFibGUoKSB7IHJldHVybiB0aGlzLl9yb29tTWVtYmVyc1RhYmxlOyB9XHJcbiAgcHVibGljIGdldCB2b3Rlc1RhYmxlKCkgeyByZXR1cm4gdGhpcy5fdm90ZXNUYWJsZTsgfVxyXG4gIHB1YmxpYyBnZXQgbW92aWVzQ2FjaGVUYWJsZSgpIHsgcmV0dXJuIHRoaXMuX21vdmllc0NhY2hlVGFibGU7IH1cclxuICBwdWJsaWMgZ2V0IGF1dGhIYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fYXV0aEhhbmRsZXI7IH1cclxuICBwdWJsaWMgZ2V0IHJvb21IYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fcm9vbUhhbmRsZXI7IH1cclxuICBwdWJsaWMgZ2V0IG1vdmllSGFuZGxlcigpIHsgcmV0dXJuIHRoaXMuX21vdmllSGFuZGxlcjsgfVxyXG4gIHB1YmxpYyBnZXQgdm90ZUhhbmRsZXIoKSB7IHJldHVybiB0aGlzLl92b3RlSGFuZGxlcjsgfVxyXG4gIHB1YmxpYyBnZXQgYWlIYW5kbGVyKCkgeyByZXR1cm4gdGhpcy5fYWlIYW5kbGVyOyB9XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmluaXR5U3RhY2tQcm9wcyA9IHt9KSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCBzdGFnZSA9IHByb3BzLnN0YWdlIHx8ICdkZXYnO1xyXG5cclxuICAgIC8vIEEuIEJhc2UgZGUgRGF0b3MgKER5bmFtb0RCKSAtIDUgVGFibGFzXHJcbiAgICB0aGlzLmNyZWF0ZUR5bmFtb0RCVGFibGVzKHN0YWdlKTtcclxuICAgIFxyXG4gICAgLy8gQi4gQXV0ZW50aWNhY2nDs24gKENvZ25pdG8pXHJcbiAgICB0aGlzLmNyZWF0ZUNvZ25pdG9BdXRoKHN0YWdlKTtcclxuICAgIFxyXG4gICAgLy8gQy4gQ29tcHV0YWNpw7NuICg1IExhbWJkYXMgaW5kZXBlbmRpZW50ZXMpXHJcbiAgICB0aGlzLmNyZWF0ZUxhbWJkYUZ1bmN0aW9ucyhzdGFnZSk7XHJcbiAgICBcclxuICAgIC8vIEQuIEFQSSAoQXBwU3luYyBHcmFwaFFMKVxyXG4gICAgdGhpcy5jcmVhdGVBcHBTeW5jQVBJKHN0YWdlKTtcclxuICAgIFxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgdGhpcy5jcmVhdGVPdXRwdXRzKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZUR5bmFtb0RCVGFibGVzKHN0YWdlOiBzdHJpbmcpIHtcclxuICAgIC8vIDEuIFVzZXJzVGFibGU6IFBLOiB1c2VySWQgKFN0cmluZylcclxuICAgIHRoaXMuX3VzZXJzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJzVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyaW5pdHktdXNlcnMtJHtzdGFnZX1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAyLiBSb29tc1RhYmxlOiBQSzogcm9vbUlkIChTdHJpbmcpXHJcbiAgICB0aGlzLl9yb29tc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdSb29tc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmluaXR5LXJvb21zLSR7c3RhZ2V9YCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdyb29tSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMy4gUm9vbU1lbWJlcnNUYWJsZTogUEs6IHJvb21JZCwgU0s6IHVzZXJJZCArIEdTSVxyXG4gICAgdGhpcy5fcm9vbU1lbWJlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnUm9vbU1lbWJlcnNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJpbml0eS1yb29tLW1lbWJlcnMtJHtzdGFnZX1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3Jvb21JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0k6IFVzZXJIaXN0b3J5SW5kZXggKFBLOiB1c2VySWQsIFNLOiBqb2luZWRBdClcclxuICAgIHRoaXMuX3Jvb21NZW1iZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdVc2VySGlzdG9yeUluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdqb2luZWRBdCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA0LiBWb3Rlc1RhYmxlOiBQSzogcm9vbUlkLCBTSzogbW92aWVJZFxyXG4gICAgdGhpcy5fdm90ZXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVm90ZXNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJpbml0eS12b3Rlcy0ke3N0YWdlfWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncm9vbUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnbW92aWVJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA1LiBNb3ZpZXNDYWNoZVRhYmxlOiBQSzogdG1kYklkICsgVFRMXHJcbiAgICB0aGlzLl9tb3ZpZXNDYWNoZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNb3ZpZXNDYWNoZVRhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmluaXR5LW1vdmllcy1jYWNoZS0ke3N0YWdlfWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndG1kYklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlQ29nbml0b0F1dGgoc3RhZ2U6IHN0cmluZykge1xyXG4gICAgLy8gVXNlciBQb29sIGNvbiBhdXRvLXZlcmlmaWNhY2nDs24gZGUgZW1haWxcclxuICAgIHRoaXMuX3VzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1RyaW5pdHlVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiBgdHJpbml0eS11c2Vycy0ke3N0YWdlfWAsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGF1dG9WZXJpZnk6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBVc2VyIFBvb2wgQ2xpZW50IHBhcmEgYXBwIG3Ds3ZpbFxyXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSB0aGlzLl91c2VyUG9vbC5hZGRDbGllbnQoJ1RyaW5pdHlNb2JpbGVDbGllbnQnLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYHRyaW5pdHktbW9iaWxlLSR7c3RhZ2V9YCxcclxuICAgICAgYXV0aEZsb3dzOiB7XHJcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxyXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gUGFyYSBhcGxpY2FjaW9uZXMgbcOzdmlsZXNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBvc3QgQ29uZmlybWF0aW9uIFRyaWdnZXIgKHNlIGNvbmZpZ3VyYXLDoSBkZXNwdcOpcyBkZSBjcmVhciBBdXRoSGFuZGxlcilcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlTGFtYmRhRnVuY3Rpb25zKHN0YWdlOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IGNvbW1vbkVudmlyb25tZW50ID0ge1xyXG4gICAgICBVU0VSU19UQUJMRTogdGhpcy5fdXNlcnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFJPT01TX1RBQkxFOiB0aGlzLl9yb29tc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgUk9PTV9NRU1CRVJTX1RBQkxFOiB0aGlzLl9yb29tTWVtYmVyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgVk9URVNfVEFCTEU6IHRoaXMuX3ZvdGVzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBNT1ZJRVNfQ0FDSEVfVEFCTEU6IHRoaXMuX21vdmllc0NhY2hlVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBTVEFHRTogc3RhZ2UsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIDEuIEF1dGhIYW5kbGVyOiBQb3N0IENvbmZpcm1hdGlvbiBUcmlnZ2VyXHJcbiAgICB0aGlzLl9hdXRoSGFuZGxlciA9IG5ldyBsYW1iZGEuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0F1dGhIYW5kbGVyJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmluaXR5LWF1dGgtJHtzdGFnZX1gLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL3NyYy9oYW5kbGVycy9hdXRoLnRzJyksXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYVJ1bnRpbWUuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcclxuICAgICAgYnVuZGxpbmc6IHtcclxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyYXIgUG9zdCBDb25maXJtYXRpb24gVHJpZ2dlclxyXG4gICAgdGhpcy5fdXNlclBvb2wuYWRkVHJpZ2dlcihjb2duaXRvLlVzZXJQb29sT3BlcmF0aW9uLlBPU1RfQ09ORklSTUFUSU9OLCB0aGlzLl9hdXRoSGFuZGxlcik7XHJcblxyXG4gICAgLy8gUGVybWlzb3M6IFdyaXRlIGVuIFVzZXJzVGFibGVcclxuICAgIHRoaXMuX3VzZXJzVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5fYXV0aEhhbmRsZXIpO1xyXG5cclxuICAgIC8vIDIuIFJvb21IYW5kbGVyOiBHZXN0aW9uYSBzYWxhc1xyXG4gICAgdGhpcy5fcm9vbUhhbmRsZXIgPSBuZXcgbGFtYmRhLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdSb29tSGFuZGxlcicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS1yb29tLSR7c3RhZ2V9YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9zcmMvaGFuZGxlcnMvcm9vbS50cycpLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGFSdW50aW1lLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQZXJtaXNvczogUlcgZW4gUm9vbXNUYWJsZSB5IFJvb21NZW1iZXJzVGFibGVcclxuICAgIHRoaXMuX3Jvb21zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuX3Jvb21IYW5kbGVyKTtcclxuICAgIHRoaXMuX3Jvb21NZW1iZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuX3Jvb21IYW5kbGVyKTtcclxuXHJcbiAgICAvLyAzLiBNb3ZpZUhhbmRsZXI6IENpcmN1aXQgQnJlYWtlciArIENhY2hlXHJcbiAgICB0aGlzLl9tb3ZpZUhhbmRsZXIgPSBuZXcgbGFtYmRhLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdNb3ZpZUhhbmRsZXInLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktbW92aWUtJHtzdGFnZX1gLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL3NyYy9oYW5kbGVycy9tb3ZpZS50cycpLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGFSdW50aW1lLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIC4uLmNvbW1vbkVudmlyb25tZW50LFxyXG4gICAgICAgIFRNREJfQVBJX0tFWTogcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZIHx8ICcnLFxyXG4gICAgICB9LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUGVybWlzb3M6IFJXIGVuIE1vdmllc0NhY2hlVGFibGVcclxuICAgIHRoaXMuX21vdmllc0NhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuX21vdmllSGFuZGxlcik7XHJcblxyXG4gICAgLy8gNC4gVm90ZUhhbmRsZXI6IEzDs2dpY2EgU3RvcC1vbi1NYXRjaFxyXG4gICAgdGhpcy5fdm90ZUhhbmRsZXIgPSBuZXcgbGFtYmRhLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdWb3RlSGFuZGxlcicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJpbml0eS12b3RlLSR7c3RhZ2V9YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9zcmMvaGFuZGxlcnMvdm90ZS50cycpLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGFSdW50aW1lLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQZXJtaXNvczogUlcgZW4gVm90ZXNUYWJsZSB5IFJvb21zVGFibGUsIFJlYWQgZW4gUm9vbU1lbWJlcnNUYWJsZVxyXG4gICAgdGhpcy5fdm90ZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5fdm90ZUhhbmRsZXIpO1xyXG4gICAgdGhpcy5fcm9vbXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5fdm90ZUhhbmRsZXIpO1xyXG4gICAgdGhpcy5fcm9vbU1lbWJlcnNUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuX3ZvdGVIYW5kbGVyKTtcclxuXHJcbiAgICAvLyA1LiBBSUhhbmRsZXI6IENoYXQgQ29udGV4dHVhbCBjb24gU2FsYW1hbmRyYVxyXG4gICAgdGhpcy5fYWlIYW5kbGVyID0gbmV3IGxhbWJkYS5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQUlIYW5kbGVyJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmluaXR5LWFpLSR7c3RhZ2V9YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9zcmMvaGFuZGxlcnMvYWkudHMnKSxcclxuICAgICAgcnVudGltZTogbGFtYmRhUnVudGltZS5SdW50aW1lLk5PREVKU18xOF9YLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAuLi5jb21tb25FbnZpcm9ubWVudCxcclxuICAgICAgICBIRl9BUElfVE9LRU46IHByb2Nlc3MuZW52LkhGX0FQSV9UT0tFTiB8fCAnJyxcclxuICAgICAgfSxcclxuICAgICAgYnVuZGxpbmc6IHtcclxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjcmVhdGVBcHBTeW5jQVBJKHN0YWdlOiBzdHJpbmcpIHtcclxuICAgIC8vIEdyYXBoUUwgQVBJIGNvbiBkZWZpbmljacOzbiBkZXNkZSBhcmNoaXZvXHJcbiAgICB0aGlzLl9hcGkgPSBuZXcgYXBwc3luYy5HcmFwaHFsQXBpKHRoaXMsICdUcmluaXR5R3JhcGhRTEFwaScsIHtcclxuICAgICAgbmFtZTogYHRyaW5pdHktYXBpLSR7c3RhZ2V9YCxcclxuICAgICAgZGVmaW5pdGlvbjogYXBwc3luYy5EZWZpbml0aW9uLmZyb21GaWxlKFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9zY2hlbWEuZ3JhcGhxbCcpXHJcbiAgICAgICksXHJcbiAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcclxuICAgICAgICBkZWZhdWx0QXV0aG9yaXphdGlvbjoge1xyXG4gICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwcHN5bmMuQXV0aG9yaXphdGlvblR5cGUuVVNFUl9QT09MLFxyXG4gICAgICAgICAgdXNlclBvb2xDb25maWc6IHtcclxuICAgICAgICAgICAgdXNlclBvb2w6IHRoaXMuX3VzZXJQb29sLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGFkZGl0aW9uYWxBdXRob3JpemF0aW9uTW9kZXM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwcHN5bmMuQXV0aG9yaXphdGlvblR5cGUuQVBJX0tFWSxcclxuICAgICAgICAgICAgYXBpS2V5Q29uZmlnOiB7XHJcbiAgICAgICAgICAgICAgZXhwaXJlczogY2RrLkV4cGlyYXRpb24uYWZ0ZXIoY2RrLkR1cmF0aW9uLmRheXMoMzY1KSksXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGxvZ0NvbmZpZzoge1xyXG4gICAgICAgIGZpZWxkTG9nTGV2ZWw6IGFwcHN5bmMuRmllbGRMb2dMZXZlbC5FUlJPUixcclxuICAgICAgfSxcclxuICAgICAgeHJheUVuYWJsZWQ6IGZhbHNlLCAvLyBPcHRpbWl6YWNpw7NuIEZyZWUgVGllclxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXIgNSBMYW1iZGEgRGF0YSBTb3VyY2VzXHJcbiAgICBjb25zdCBhdXRoRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdBdXRoRGF0YVNvdXJjZScsIHRoaXMuX2F1dGhIYW5kbGVyKTtcclxuICAgIGNvbnN0IHJvb21EYXRhU291cmNlID0gdGhpcy5fYXBpLmFkZExhbWJkYURhdGFTb3VyY2UoJ1Jvb21EYXRhU291cmNlJywgdGhpcy5fcm9vbUhhbmRsZXIpO1xyXG4gICAgY29uc3QgbW92aWVEYXRhU291cmNlID0gdGhpcy5fYXBpLmFkZExhbWJkYURhdGFTb3VyY2UoJ01vdmllRGF0YVNvdXJjZScsIHRoaXMuX21vdmllSGFuZGxlcik7XHJcbiAgICBjb25zdCB2b3RlRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdWb3RlRGF0YVNvdXJjZScsIHRoaXMuX3ZvdGVIYW5kbGVyKTtcclxuICAgIGNvbnN0IGFpRGF0YVNvdXJjZSA9IHRoaXMuX2FwaS5hZGRMYW1iZGFEYXRhU291cmNlKCdBSURhdGFTb3VyY2UnLCB0aGlzLl9haUhhbmRsZXIpO1xyXG5cclxuICAgIC8vIERlZmluaXIgUmVzb2x2ZXJzIHNlZ8O6biBlbCBzY2hlbWFcclxuICAgIFxyXG4gICAgLy8gUXVlcmllc1xyXG4gICAgbW92aWVEYXRhU291cmNlLmNyZWF0ZVJlc29sdmVyKCdHZXRNb3ZpZXNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldE1vdmllcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBhaURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0dldENoYXRSZWNvbW1lbmRhdGlvbnNSZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdRdWVyeScsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0dldE15SGlzdG9yeVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgZmllbGROYW1lOiAnZ2V0TXlIaXN0b3J5JyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE11dGF0aW9uc1xyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0NyZWF0ZVJvb21SZXNvbHZlcicsIHtcclxuICAgICAgdHlwZU5hbWU6ICdNdXRhdGlvbicsXHJcbiAgICAgIGZpZWxkTmFtZTogJ2NyZWF0ZVJvb20nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgcm9vbURhdGFTb3VyY2UuY3JlYXRlUmVzb2x2ZXIoJ0pvaW5Sb29tUmVzb2x2ZXInLCB7XHJcbiAgICAgIHR5cGVOYW1lOiAnTXV0YXRpb24nLFxyXG4gICAgICBmaWVsZE5hbWU6ICdqb2luUm9vbScsXHJcbiAgICB9KTtcclxuXHJcbiAgICB2b3RlRGF0YVNvdXJjZS5jcmVhdGVSZXNvbHZlcignVm90ZVJlc29sdmVyJywge1xyXG4gICAgICB0eXBlTmFtZTogJ011dGF0aW9uJyxcclxuICAgICAgZmllbGROYW1lOiAndm90ZScsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlT3V0cHV0cygpIHtcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHcmFwaFFMQXBpVXJsJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fYXBpLmdyYXBocWxVcmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIGRlIGxhIEFQSSBHcmFwaFFMJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHcmFwaFFMQXBpSWQnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl9hcGkuYXBpSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgZGUgbGEgQVBJIEdyYXBoUUwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl91c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIGRlbCBVc2VyIFBvb2wgZGUgQ29nbml0bycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUmVnaW9uJywge1xyXG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcclxuICAgICAgZGVzY3JpcHRpb246ICdSZWdpw7NuIGRlIEFXUycsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBOb21icmVzIGRlIGxhcyBmdW5jaW9uZXMgTGFtYmRhXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXV0aEhhbmRsZXJOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fYXV0aEhhbmRsZXIuZnVuY3Rpb25OYW1lLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Jvb21IYW5kbGVyTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX3Jvb21IYW5kbGVyLmZ1bmN0aW9uTmFtZSxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNb3ZpZUhhbmRsZXJOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5fbW92aWVIYW5kbGVyLmZ1bmN0aW9uTmFtZSxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWb3RlSGFuZGxlck5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLl92b3RlSGFuZGxlci5mdW5jdGlvbk5hbWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQUlIYW5kbGVyTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX2FpSGFuZGxlci5mdW5jdGlvbk5hbWUsXHJcbiAgICB9KTtcclxuICB9XHJcbn0iXX0=