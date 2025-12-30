import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface TrinityStackProps extends cdk.StackProps {
  stage?: string;
}

export class TrinityStack extends cdk.Stack {
  private _api!: appsync.GraphqlApi;
  private _userPool!: cognito.UserPool;
  private _userPoolClient!: cognito.UserPoolClient;
  
  // DynamoDB Tables
  private _usersTable!: dynamodb.Table;
  private _roomsTable!: dynamodb.Table;
  private _roomMembersTable!: dynamodb.Table;
  private _votesTable!: dynamodb.Table;
  private _userVotesTable!: dynamodb.Table;
  private _moviesCacheTable!: dynamodb.Table;
  
  // Lambda Functions
  private _authHandler!: lambda.Function;
  private _roomHandler!: lambda.Function;
  private _movieHandler!: lambda.Function;
  private _voteHandler!: lambda.Function;
  private _aiHandler!: lambda.Function;
  private _realtimeHandler!: lambda.Function;

  // Getters para acceso público
  public get api() { return this._api; }
  public get userPool() { return this._userPool; }
  public get userPoolClient() { return this._userPoolClient; }
  public get usersTable() { return this._usersTable; }
  public get roomsTable() { return this._roomsTable; }
  public get roomMembersTable() { return this._roomMembersTable; }
  public get votesTable() { return this._votesTable; }
  public get userVotesTable() { return this._userVotesTable; }
  public get moviesCacheTable() { return this._moviesCacheTable; }
  public get authHandler() { return this._authHandler; }
  public get roomHandler() { return this._roomHandler; }
  public get movieHandler() { return this._movieHandler; }
  public get voteHandler() { return this._voteHandler; }
  public get aiHandler() { return this._aiHandler; }
  public get realtimeHandler() { return this._realtimeHandler; }

  constructor(scope: Construct, id: string, props: TrinityStackProps = {}) {
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

  private createDynamoDBTables(stage: string) {
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

  private createCognitoAuth(stage: string) {
    // User Pool con auto-verificación de email
    this._userPool = new cognito.UserPool(this, 'TrinityUserPool', {
      userPoolName: `trinity-users-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: false, // Disabled for development - users can login immediately
      },
      signInCaseSensitive: false,
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
    this._userPoolClient = this._userPool.addClient('TrinityMobileClient', {
      userPoolClientName: `trinity-mobile-${stage}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Para aplicaciones móviles
    });

    // Post Confirmation Trigger (se configurará después de crear AuthHandler)
  }

  private createLambdaFunctions(stage: string) {
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

  private createAppSyncAPI(stage: string) {
    // GraphQL API con definición desde archivo
    this._api = new appsync.GraphqlApi(this, 'TrinityGraphQLApi', {
      name: `trinity-api-${stage}`,
      definition: appsync.Definition.fromFile(
        path.join(__dirname, '../schema.graphql')
      ),
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

  private createOutputs() {
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

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this._userPoolClient.userPoolClientId,
      description: 'ID del User Pool Client para la app móvil',
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