import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface TrinityDatabaseStackProps extends cdk.StackProps {
  stage: string;
}

export class TrinityDatabaseStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly roomsTable: dynamodb.Table;
  public readonly roomMembersTable: dynamodb.Table;
  public readonly votesTable: dynamodb.Table;
  public readonly moviesCacheTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: TrinityDatabaseStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // Trinity_Users Table
    this.usersTable = new dynamodb.Table(this, 'TrinityUsersTable', {
      tableName: `Trinity_Users_${stage}`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Para desarrollo
      pointInTimeRecovery: false, // Optimización Free Tier
    });

    // Trinity_Rooms Table
    this.roomsTable = new dynamodb.Table(this, 'TrinityRoomsTable', {
      tableName: `Trinity_Rooms_${stage}`,
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // Trinity_RoomMembers Table con GSI para historial de usuario
    this.roomMembersTable = new dynamodb.Table(this, 'TrinityRoomMembersTable', {
      tableName: `Trinity_RoomMembers_${stage}`,
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // GSI para obtener historial de salas de un usuario
    this.roomMembersTable.addGlobalSecondaryIndex({
      indexName: 'UserHistoryIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'joinedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Trinity_Votes Table (Contadores por película)
    this.votesTable = new dynamodb.Table(this, 'TrinityVotesTable', {
      tableName: `Trinity_Votes_${stage}`,
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'movieId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // Trinity_MoviesCache Table (Circuit Breaker con TTL)
    this.moviesCacheTable = new dynamodb.Table(this, 'TrinityMoviesCacheTable', {
      tableName: `Trinity_MoviesCache_${stage}`,
      partitionKey: {
        name: 'tmdbId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
      // TTL habilitado para 30 días (optimización de costos)
      timeToLiveAttribute: 'ttl',
    });

    // Outputs para referencia
    new cdk.CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      description: 'Nombre de la tabla de usuarios',
    });

    new cdk.CfnOutput(this, 'RoomsTableName', {
      value: this.roomsTable.tableName,
      description: 'Nombre de la tabla de salas',
    });

    new cdk.CfnOutput(this, 'RoomMembersTableName', {
      value: this.roomMembersTable.tableName,
      description: 'Nombre de la tabla de miembros de sala',
    });

    new cdk.CfnOutput(this, 'VotesTableName', {
      value: this.votesTable.tableName,
      description: 'Nombre de la tabla de votos',
    });

    new cdk.CfnOutput(this, 'MoviesCacheTableName', {
      value: this.moviesCacheTable.tableName,
      description: 'Nombre de la tabla de caché de películas',
    });
  }
}