import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
export interface TrinityOptimizationStackProps extends cdk.StackProps {
    stage?: string;
    monthlyBudgetLimit?: number;
    alertEmail?: string;
    lambdaFunctions?: lambda.Function[];
    dynamoTables?: dynamodb.Table[];
}
export declare class TrinityOptimizationStack extends cdk.Stack {
    private _costAlarmTopic;
    private _budgetAlarm;
    private _dashboards;
    get costAlarmTopic(): cdk.aws_sns.Topic;
    get budgetAlarm(): cdk.aws_budgets.CfnBudget;
    get dashboards(): cdk.aws_cloudwatch.Dashboard;
    constructor(scope: Construct, id: string, props?: TrinityOptimizationStackProps);
    private createNotificationSystem;
    private createBudgetMonitoring;
    private optimizeLambdaFunctions;
    private optimizeDynamoDBTables;
    private createCostDashboard;
    private optimizeLogRetention;
    private createOutputs;
}
