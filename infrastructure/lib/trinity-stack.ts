import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { TrinityDatabaseStack } from './trinity-database-stack';
import * as path from 'path';

export interface TrinityStackProps extends cdk.StackProps {
  stage?: string;
}

export class TrinityStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;
  public readonly userPool: cognito.UserPool;
  public readonly databaseStack: TrinityDatabaseStack;

  constructor(scope: Construct, id: string, props: TrinityStackProps = {}) {
    super(scope, id, props);

    const stage = props.stage || 'dev';

    // 1. Crear las tablas DynamoDB
    this.databaseStack = new TrinityDatabaseStack(this, 'TrinityDatabase', {
      stage,
    });

    // 2. Crear Cognito User Pool para autenticación
    this.userPool = new cognito.UserPool(this, 'TrinityUserPool', {
      userPoolName: `trinity-users-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Para desarrollo
    });

    // Cliente de Cognito para la aplicación móvil
    const userPoolClient = this.userPool.addClient('TrinityMobileClient', {
      userPoolClientName: `trinity-mobile-${stage}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Para aplicaciones móviles
    });

    // 3. Crear API GraphQL con AppSync
    this.api = new appsync.GraphqlApi(this, 'TrinityGraphQLApi', {
      name: `trinity-api-${stage}`,
      schema: appsync.SchemaFile.fromAsset(
        path.join(__dirname, '../schema.graphql')
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: this.userPool,
          },
        },
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
      xrayEnabled: false, // Optimización Free Tier
    });

    // 4. Crear función Lambda para la lógica de negocio
    const trinityLambda = new lambda.Function(this, 'TrinityBusinessLogic', {
      functionName: `trinity-business-logic-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        USERS_TABLE: this.databaseStack.usersTable.tableName,
        ROOMS_TABLE: this.databaseStack.roomsTable.tableName,
        ROOM_MEMBERS_TABLE: this.databaseStack.roomMembersTable.tableName,
        VOTES_TABLE: this.databaseStack.votesTable.tableName,
        MOVIES_CACHE_TABLE: this.databaseStack.moviesCacheTable.tableName,
        TMDB_API_KEY: process.env.TMDB_API_KEY || '',
        HF_API_TOKEN: process.env.HF_API_TOKEN || '',
        STAGE: stage,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512, // Optimizado para Free Tier
    });

    // 5. Permisos IAM mínimos necesarios para Lambda
    const dynamoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
      ],
      resources: [
        this.databaseStack.usersTable.tableArn,
        this.databaseStack.roomsTable.tableArn,
        this.databaseStack.roomMembersTable.tableArn,
        this.databaseStack.votesTable.tableArn,
        this.databaseStack.moviesCacheTable.tableArn,
        // Incluir ARNs de los GSI
        `${this.databaseStack.roomMembersTable.tableArn}/index/*`,
      ],
    });

    trinityLambda.addToRolePolicy(dynamoPolicy);

    // 6. Crear Data Sources para AppSync
    const lambdaDataSource = this.api.addLambdaDataSource(
      'TrinityLambdaDataSource',
      trinityLambda
    );

    // Data Sources directos para DynamoDB (operaciones simples)
    const usersDataSource = this.api.addDynamoDbDataSource(
      'UsersDataSource',
      this.databaseStack.usersTable
    );

    const roomsDataSource = this.api.addDynamoDbDataSource(
      'RoomsDataSource',
      this.databaseStack.roomsTable
    );

    // 7. Resolvers para las operaciones principales
    
    // Queries
    lambdaDataSource.createResolver('GetMyHistoryResolver', {
      typeName: 'Query',
      fieldName: 'getMyHistory',
    });

    lambdaDataSource.createResolver('GetRoomResolver', {
      typeName: 'Query',
      fieldName: 'getRoom',
    });

    lambdaDataSource.createResolver('GetMoviesResolver', {
      typeName: 'Query',
      fieldName: 'getMovies',
    });

    lambdaDataSource.createResolver('GetChatRecommendationsResolver', {
      typeName: 'Query',
      fieldName: 'getChatRecommendations',
    });

    // Mutations críticas (lógica de negocio compleja)
    lambdaDataSource.createResolver('CreateRoomResolver', {
      typeName: 'Mutation',
      fieldName: 'createRoom',
    });

    lambdaDataSource.createResolver('JoinRoomResolver', {
      typeName: 'Mutation',
      fieldName: 'joinRoom',
    });

    lambdaDataSource.createResolver('VoteResolver', {
      typeName: 'Mutation',
      fieldName: 'vote',
    });

    // 8. Outputs importantes
    new cdk.CfnOutput(this, 'GraphQLApiUrl', {
      value: this.api.graphqlUrl,
      description: 'URL de la API GraphQL',
    });

    new cdk.CfnOutput(this, 'GraphQLApiId', {
      value: this.api.apiId,
      description: 'ID de la API GraphQL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'ID del User Pool de Cognito',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'ID del cliente del User Pool',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: trinityLambda.functionName,
      description: 'Nombre de la función Lambda',
    });

    // 9. Configuración para CodeGen (generar tipos TypeScript)
    new cdk.CfnOutput(this, 'CodeGenConfig', {
      value: JSON.stringify({
        apiId: this.api.apiId,
        region: this.region,
        userPoolId: this.userPool.userPoolId,
        userPoolClientId: userPoolClient.userPoolClientId,
      }),
      description: 'Configuración para CodeGen de GraphQL',
    });
  }
}