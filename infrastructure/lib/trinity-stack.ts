import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface TrinityStackProps extends cdk.StackProps {
  stage?: string;
}

export class TrinityStack extends cdk.Stack {
  private _api!: appsync.GraphqlApi;
  private _userPool!: cognito.UserPool;
  
  // DynamoDB Tables
  private _usersTable!: dynamodb.Table;
  private _roomsTable!: dynamodb.Table;
  private _roomMembersTable!: dynamodb.Table;
  private _votesTable!: dynamodb.Table;
  private _moviesCacheTable!: dynamodb.Table;
  
  // Lambda Functions
  private _authHandler!: lambda.NodejsFunction;
  private _roomHandler!: lambda.NodejsFunction;
  private _movieHandler!: lambda.NodejsFunction;
  private _voteHandler!: lambda.NodejsFunction;
  private _aiHandler!: lambda.NodejsFunction;

  // Getters para acceso público
  public get api() { return this._api; }
  public get userPool() { return this._userPool; }
  public get usersTable() { return this._usersTable; }
  public get roomsTable() { return this._roomsTable; }
  public get roomMembersTable() { return this._roomMembersTable; }
  public get votesTable() { return this._votesTable; }
  public get moviesCacheTable() { return this._moviesCacheTable; }
  public get authHandler() { return this._authHandler; }
  public get roomHandler() { return this._roomHandler; }
  public get movieHandler() { return this._movieHandler; }
  public get voteHandler() { return this._voteHandler; }
  public get aiHandler() { return this._aiHandler; }

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

    // 5. MoviesCacheTable: PK: tmdbId + TTL
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

  private createLambdaFunctions(stage: string) {
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
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnvironment,
    });

    // Configurar Post Confirmation Trigger
    this._userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, this._authHandler);

    // Permisos: Write en UsersTable
    this._usersTable.grantWriteData(this._authHandler);

    // 2. RoomHandler: Gestiona salas
    this._roomHandler = new lambda.NodejsFunction(this, 'RoomHandler', {
      functionName: `trinity-room-${stage}`,
      entry: path.join(__dirname, '../src/handlers/room.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // Permisos: RW en RoomsTable y RoomMembersTable
    this._roomsTable.grantReadWriteData(this._roomHandler);
    this._roomMembersTable.grantReadWriteData(this._roomHandler);

    // 3. MovieHandler: Circuit Breaker + Cache
    this._movieHandler = new lambda.NodejsFunction(this, 'MovieHandler', {
      functionName: `trinity-movie-${stage}`,
      entry: path.join(__dirname, '../src/handlers/movie.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
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
    this._voteHandler = new lambda.NodejsFunction(this, 'VoteHandler', {
      functionName: `trinity-vote-${stage}`,
      entry: path.join(__dirname, '../src/handlers/vote.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // Permisos: RW en VotesTable y RoomsTable, Read en RoomMembersTable
    this._votesTable.grantReadWriteData(this._voteHandler);
    this._roomsTable.grantReadWriteData(this._voteHandler);
    this._roomMembersTable.grantReadData(this._voteHandler);

    // 5. AIHandler: Chat Contextual con Salamandra
    this._aiHandler = new lambda.NodejsFunction(this, 'AIHandler', {
      functionName: `trinity-ai-${stage}`,
      entry: path.join(__dirname, '../src/handlers/ai.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...commonEnvironment,
        HF_API_TOKEN: process.env.HF_API_TOKEN || '',
      },
    });
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