import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface TrinityStackProps extends cdk.StackProps {
    stage?: string;
}
export declare class TrinityStack extends cdk.Stack {
    private _api;
    private _userPool;
    private _usersTable;
    private _roomsTable;
    private _roomMembersTable;
    private _votesTable;
    private _userVotesTable;
    private _moviesCacheTable;
    private _authHandler;
    private _roomHandler;
    private _movieHandler;
    private _voteHandler;
    private _aiHandler;
    private _realtimeHandler;
    get api(): cdk.aws_appsync.GraphqlApi;
    get userPool(): cdk.aws_cognito.UserPool;
    get usersTable(): cdk.aws_dynamodb.Table;
    get roomsTable(): cdk.aws_dynamodb.Table;
    get roomMembersTable(): cdk.aws_dynamodb.Table;
    get votesTable(): cdk.aws_dynamodb.Table;
    get userVotesTable(): cdk.aws_dynamodb.Table;
    get moviesCacheTable(): cdk.aws_dynamodb.Table;
    get authHandler(): cdk.aws_lambda.Function;
    get roomHandler(): cdk.aws_lambda.Function;
    get movieHandler(): cdk.aws_lambda.Function;
    get voteHandler(): cdk.aws_lambda.Function;
    get aiHandler(): cdk.aws_lambda.Function;
    get realtimeHandler(): cdk.aws_lambda.Function;
    constructor(scope: Construct, id: string, props?: TrinityStackProps);
    private createDynamoDBTables;
    private createCognitoAuth;
    private createLambdaFunctions;
    private createAppSyncAPI;
    private createOutputs;
}
