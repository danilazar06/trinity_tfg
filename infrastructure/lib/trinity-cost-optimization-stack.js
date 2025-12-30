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
exports.TrinityOptimizationStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const budgets = __importStar(require("aws-cdk-lib/aws-budgets"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class TrinityOptimizationStack extends cdk.Stack {
    // Getters públicos
    get costAlarmTopic() { return this._costAlarmTopic; }
    get budgetAlarm() { return this._budgetAlarm; }
    get dashboards() { return this._dashboards; }
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        const stage = props.stage || 'dev';
        const monthlyBudget = props.monthlyBudgetLimit || 50; // $50 por defecto
        const alertEmail = props.alertEmail || 'admin@trinity.com';
        // A. Sistema de Notificaciones
        this.createNotificationSystem(stage, alertEmail);
        // B. Monitoreo de Presupuesto
        this.createBudgetMonitoring(stage, monthlyBudget, alertEmail);
        // C. Optimización de Lambda
        if (props.lambdaFunctions) {
            this.optimizeLambdaFunctions(stage, props.lambdaFunctions);
        }
        // D. Optimización de DynamoDB
        if (props.dynamoTables) {
            this.optimizeDynamoDBTables(stage, props.dynamoTables);
        }
        // E. Dashboard de Costos
        this.createCostDashboard(stage);
        // F. Políticas de Retención de Logs
        this.optimizeLogRetention(stage);
        // Outputs
        this.createOutputs();
    }
    createNotificationSystem(stage, alertEmail) {
        // Topic SNS para alertas de costos
        this._costAlarmTopic = new sns.Topic(this, 'CostAlarmTopic', {
            topicName: `trinity-cost-alerts-${stage}`,
            displayName: `Trinity Cost Alerts - ${stage}`,
        });
        // Suscripción por email
        this._costAlarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(alertEmail));
        // Suscripción por SMS (opcional)
        // this._costAlarmTopic.addSubscription(
        //   new snsSubscriptions.SmsSubscription('+1234567890')
        // );
    }
    createBudgetMonitoring(stage, monthlyBudget, alertEmail) {
        // Budget con múltiples alertas
        this._budgetAlarm = new budgets.CfnBudget(this, 'TrinityBudget', {
            budget: {
                budgetName: `trinity-monthly-budget-${stage}`,
                budgetLimit: {
                    amount: monthlyBudget,
                    unit: 'USD',
                },
                timeUnit: 'MONTHLY',
                budgetType: 'COST',
                costFilters: {
                    // Filtrar solo recursos de Trinity
                    TagKey: ['Project'],
                    TagValue: ['Trinity'],
                },
            },
            notificationsWithSubscribers: [
                {
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 80,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'EMAIL',
                            address: alertEmail,
                        },
                    ],
                },
                {
                    notification: {
                        notificationType: 'FORECASTED',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 100,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'EMAIL',
                            address: alertEmail,
                        },
                    ],
                },
                {
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 50,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'EMAIL',
                            address: alertEmail,
                        },
                    ],
                },
            ],
        });
    }
    optimizeLambdaFunctions(stage, functions) {
        functions.forEach((func, index) => {
            // 1. Configurar Reserved Concurrency para evitar costos inesperados
            func.addEnvironment('RESERVED_CONCURRENCY', '10'); // Máximo 10 ejecuciones concurrentes
            // 2. Alarma de duración excesiva
            const durationAlarm = new cloudwatch.Alarm(this, `LambdaDurationAlarm${index}`, {
                alarmName: `trinity-lambda-duration-${func.functionName}-${stage}`,
                metric: func.metricDuration({
                    statistic: 'Average',
                }),
                threshold: 25000,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
            // 3. Alarma de errores excesivos
            const errorAlarm = new cloudwatch.Alarm(this, `LambdaErrorAlarm${index}`, {
                alarmName: `trinity-lambda-errors-${func.functionName}-${stage}`,
                metric: func.metricErrors({
                    statistic: 'Sum',
                }),
                threshold: 10,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
            // 4. Alarma de invocaciones excesivas (protección contra ataques)
            const invocationAlarm = new cloudwatch.Alarm(this, `LambdaInvocationAlarm${index}`, {
                alarmName: `trinity-lambda-invocations-${func.functionName}-${stage}`,
                metric: func.metricInvocations({
                    statistic: 'Sum',
                }),
                threshold: 1000,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            invocationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
        });
    }
    optimizeDynamoDBTables(stage, tables) {
        tables.forEach((table, index) => {
            // 1. Alarma de consumo de RCU excesivo
            const readAlarm = new cloudwatch.Alarm(this, `DynamoReadAlarm${index}`, {
                alarmName: `trinity-dynamo-read-${table.tableName}-${stage}`,
                metric: table.metricConsumedReadCapacityUnits({
                    statistic: 'Sum',
                }),
                threshold: 100,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            readAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
            // 2. Alarma de consumo de WCU excesivo
            const writeAlarm = new cloudwatch.Alarm(this, `DynamoWriteAlarm${index}`, {
                alarmName: `trinity-dynamo-write-${table.tableName}-${stage}`,
                metric: table.metricConsumedWriteCapacityUnits({
                    statistic: 'Sum',
                }),
                threshold: 100,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            writeAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
            // 3. Alarma de errores de throttling
            const throttleAlarm = new cloudwatch.Alarm(this, `DynamoThrottleAlarm${index}`, {
                alarmName: `trinity-dynamo-throttle-${table.tableName}-${stage}`,
                metric: table.metricThrottledRequestsForOperations({
                    operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM],
                    statistic: 'Sum',
                }),
                threshold: 5,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });
            throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this._costAlarmTopic));
        });
    }
    createCostDashboard(stage) {
        this._dashboards = new cloudwatch.Dashboard(this, 'TrinityDashboard', {
            dashboardName: `trinity-cost-monitoring-${stage}`,
        });
        // Widget de costos estimados
        this._dashboards.addWidgets(new cloudwatch.GraphWidget({
            title: 'Estimated Monthly Costs',
            left: [
                new cloudwatch.Metric({
                    namespace: 'AWS/Billing',
                    metricName: 'EstimatedCharges',
                    dimensionsMap: {
                        Currency: 'USD',
                    },
                    statistic: 'Maximum',
                }),
            ],
            width: 12,
            height: 6,
        }));
        // Widget de invocaciones Lambda
        this._dashboards.addWidgets(new cloudwatch.GraphWidget({
            title: 'Lambda Invocations',
            left: [
                new cloudwatch.Metric({
                    namespace: 'AWS/Lambda',
                    metricName: 'Invocations',
                    statistic: 'Sum',
                }),
            ],
            width: 12,
            height: 6,
        }));
        // Widget de DynamoDB RCU/WCU
        this._dashboards.addWidgets(new cloudwatch.GraphWidget({
            title: 'DynamoDB Capacity Units',
            left: [
                new cloudwatch.Metric({
                    namespace: 'AWS/DynamoDB',
                    metricName: 'ConsumedReadCapacityUnits',
                    statistic: 'Sum',
                }),
            ],
            right: [
                new cloudwatch.Metric({
                    namespace: 'AWS/DynamoDB',
                    metricName: 'ConsumedWriteCapacityUnits',
                    statistic: 'Sum',
                }),
            ],
            width: 12,
            height: 6,
        }));
    }
    optimizeLogRetention(stage) {
        // Configurar retención de logs para diferentes stages
        const retentionDays = stage === 'prod'
            ? logs.RetentionDays.ONE_MONTH
            : logs.RetentionDays.ONE_WEEK;
        // Crear política de retención para todos los log groups de Lambda
        // Esto se aplicará automáticamente a las funciones Lambda creadas
        new logs.LogGroup(this, 'DefaultLogRetention', {
            logGroupName: `/aws/lambda/trinity-default-${stage}`,
            retention: retentionDays,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
    createOutputs() {
        new cdk.CfnOutput(this, 'CostAlarmTopicArn', {
            value: this._costAlarmTopic.topicArn,
            description: 'ARN del topic SNS para alertas de costos',
        });
        new cdk.CfnOutput(this, 'DashboardUrl', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this._dashboards.dashboardName}`,
            description: 'URL del dashboard de monitoreo de costos',
        });
        new cdk.CfnOutput(this, 'BudgetName', {
            value: `trinity-monthly-budget-${this.node.tryGetContext('stage') || 'dev'}`,
            description: 'Nombre del presupuesto configurado',
        });
    }
}
exports.TrinityOptimizationStack = TrinityOptimizationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1jb3N0LW9wdGltaXphdGlvbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaW5pdHktY29zdC1vcHRpbWl6YXRpb24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdUVBQXlEO0FBQ3pELHNGQUF3RTtBQUN4RSx5REFBMkM7QUFDM0Msb0ZBQXNFO0FBQ3RFLGlFQUFtRDtBQUduRCxtRUFBcUQ7QUFDckQsMkRBQTZDO0FBVzdDLE1BQWEsd0JBQXlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLckQsbUJBQW1CO0lBQ25CLElBQVcsY0FBYyxLQUFLLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7SUFDNUQsSUFBVyxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN0RCxJQUFXLFVBQVUsS0FBSyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRXBELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsUUFBdUMsRUFBRTtRQUNqRixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQztRQUNuQyxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsa0JBQWtCLElBQUksRUFBRSxDQUFDLENBQUMsa0JBQWtCO1FBQ3hFLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLElBQUksbUJBQW1CLENBQUM7UUFFM0QsK0JBQStCO1FBQy9CLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFakQsOEJBQThCO1FBQzlCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsYUFBYSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FB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LFdBQVcsRUFBRSwwQ0FBMEM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLHlEQUF5RCxJQUFJLENBQUMsTUFBTSxvQkFBb0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUU7WUFDL0gsV0FBVyxFQUFFLDBDQUEwQztTQUN4RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsMEJBQTBCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssRUFBRTtZQUM1RSxXQUFXLEVBQUUsb0NBQW9DO1NBQ2xELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWxVRCw0REFrVUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcclxuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XHJcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcclxuaW1wb3J0ICogYXMgc25zU3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xyXG5pbXBvcnQgKiBhcyBidWRnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1idWRnZXRzJztcclxuaW1wb3J0ICogYXMgYXBwbGljYXRpb25hdXRvc2NhbGluZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmluaXR5T3B0aW1pemF0aW9uU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBzdGFnZT86IHN0cmluZztcclxuICBtb250aGx5QnVkZ2V0TGltaXQ/OiBudW1iZXI7XHJcbiAgYWxlcnRFbWFpbD86IHN0cmluZztcclxuICBsYW1iZGFGdW5jdGlvbnM/OiBsYW1iZGEuRnVuY3Rpb25bXTtcclxuICBkeW5hbW9UYWJsZXM/OiBkeW5hbW9kYi5UYWJsZVtdO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJpbml0eU9wdGltaXphdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwcml2YXRlIF9jb3N0QWxhcm1Ub3BpYyE6IHNucy5Ub3BpYztcclxuICBwcml2YXRlIF9idWRnZXRBbGFybSE6IGJ1ZGdldHMuQ2ZuQnVkZ2V0O1xyXG4gIHByaXZhdGUgX2Rhc2hib2FyZHMhOiBjbG91ZHdhdGNoLkRhc2hib2FyZDtcclxuXHJcbiAgLy8gR2V0dGVycyBww7pibGljb3NcclxuICBwdWJsaWMgZ2V0IGNvc3RBbGFybVRvcGljKCkgeyByZXR1cm4gdGhpcy5fY29zdEFsYXJtVG9waWM7IH1cclxuICBwdWJsaWMgZ2V0IGJ1ZGdldEFsYXJtKCkgeyByZXR1cm4gdGhpcy5fYnVkZ2V0QWxhcm07IH1cclxuICBwdWJsaWMgZ2V0IGRhc2hib2FyZHMoKSB7IHJldHVybiB0aGlzLl9kYXNoYm9hcmRzOyB9XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmluaXR5T3B0aW1pemF0aW9uU3RhY2tQcm9wcyA9IHt9KSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCBzdGFnZSA9IHByb3BzLnN0YWdlIHx8ICdkZXYnO1xyXG4gICAgY29uc3QgbW9udGhseUJ1ZGdldCA9IHByb3BzLm1vbnRobHlCdWRnZXRMaW1pdCB8fCA1MDsgLy8gJDUwIHBvciBkZWZlY3RvXHJcbiAgICBjb25zdCBhbGVydEVtYWlsID0gcHJvcHMuYWxlcnRFbWFpbCB8fCAnYWRtaW5AdHJpbml0eS5jb20nO1xyXG5cclxuICAgIC8vIEEuIFNpc3RlbWEgZGUgTm90aWZpY2FjaW9uZXNcclxuICAgIHRoaXMuY3JlYXRlTm90aWZpY2F0aW9uU3lzdGVtKHN0YWdlLCBhbGVydEVtYWlsKTtcclxuXHJcbiAgICAvLyBCLiBNb25pdG9yZW8gZGUgUHJlc3VwdWVzdG9cclxuICAgIHRoaXMuY3JlYXRlQnVkZ2V0TW9uaXRvcmluZyhzdGFnZSwgbW9udGhseUJ1ZGdldCwgYWxlcnRFbWFpbCk7XHJcblxyXG4gICAgLy8gQy4gT3B0aW1pemFjacOzbiBkZSBMYW1iZGFcclxuICAgIGlmIChwcm9wcy5sYW1iZGFGdW5jdGlvbnMpIHtcclxuICAgICAgdGhpcy5vcHRpbWl6ZUxhbWJkYUZ1bmN0aW9ucyhzdGFnZSwgcHJvcHMubGFtYmRhRnVuY3Rpb25zKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBELiBPcHRpbWl6YWNpw7NuIGRlIER5bmFtb0RCXHJcbiAgICBpZiAocHJvcHMuZHluYW1vVGFibGVzKSB7XHJcbiAgICAgIHRoaXMub3B0aW1pemVEeW5hbW9EQlRhYmxlcyhzdGFnZSwgcHJvcHMuZHluYW1vVGFibGVzKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFLiBEYXNoYm9hcmQgZGUgQ29zdG9zXHJcbiAgICB0aGlzLmNyZWF0ZUNvc3REYXNoYm9hcmQoc3RhZ2UpO1xyXG5cclxuICAgIC8vIEYuIFBvbMOtdGljYXMgZGUgUmV0ZW5jacOzbiBkZSBMb2dzXHJcbiAgICB0aGlzLm9wdGltaXplTG9nUmV0ZW50aW9uKHN0YWdlKTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICB0aGlzLmNyZWF0ZU91dHB1dHMoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlTm90aWZpY2F0aW9uU3lzdGVtKHN0YWdlOiBzdHJpbmcsIGFsZXJ0RW1haWw6IHN0cmluZykge1xyXG4gICAgLy8gVG9waWMgU05TIHBhcmEgYWxlcnRhcyBkZSBjb3N0b3NcclxuICAgIHRoaXMuX2Nvc3RBbGFybVRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQ29zdEFsYXJtVG9waWMnLCB7XHJcbiAgICAgIHRvcGljTmFtZTogYHRyaW5pdHktY29zdC1hbGVydHMtJHtzdGFnZX1gLFxyXG4gICAgICBkaXNwbGF5TmFtZTogYFRyaW5pdHkgQ29zdCBBbGVydHMgLSAke3N0YWdlfWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTdXNjcmlwY2nDs24gcG9yIGVtYWlsXHJcbiAgICB0aGlzLl9jb3N0QWxhcm1Ub3BpYy5hZGRTdWJzY3JpcHRpb24oXHJcbiAgICAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKGFsZXJ0RW1haWwpXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFN1c2NyaXBjacOzbiBwb3IgU01TIChvcGNpb25hbClcclxuICAgIC8vIHRoaXMuX2Nvc3RBbGFybVRvcGljLmFkZFN1YnNjcmlwdGlvbihcclxuICAgIC8vICAgbmV3IHNuc1N1YnNjcmlwdGlvbnMuU21zU3Vic2NyaXB0aW9uKCcrMTIzNDU2Nzg5MCcpXHJcbiAgICAvLyApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjcmVhdGVCdWRnZXRNb25pdG9yaW5nKHN0YWdlOiBzdHJpbmcsIG1vbnRobHlCdWRnZXQ6IG51bWJlciwgYWxlcnRFbWFpbDogc3RyaW5nKSB7XHJcbiAgICAvLyBCdWRnZXQgY29uIG3Dumx0aXBsZXMgYWxlcnRhc1xyXG4gICAgdGhpcy5fYnVkZ2V0QWxhcm0gPSBuZXcgYnVkZ2V0cy5DZm5CdWRnZXQodGhpcywgJ1RyaW5pdHlCdWRnZXQnLCB7XHJcbiAgICAgIGJ1ZGdldDoge1xyXG4gICAgICAgIGJ1ZGdldE5hbWU6IGB0cmluaXR5LW1vbnRobHktYnVkZ2V0LSR7c3RhZ2V9YCxcclxuICAgICAgICBidWRnZXRMaW1pdDoge1xyXG4gICAgICAgICAgYW1vdW50OiBtb250aGx5QnVkZ2V0LFxyXG4gICAgICAgICAgdW5pdDogJ1VTRCcsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0aW1lVW5pdDogJ01PTlRITFknLFxyXG4gICAgICAgIGJ1ZGdldFR5cGU6ICdDT1NUJyxcclxuICAgICAgICBjb3N0RmlsdGVyczoge1xyXG4gICAgICAgICAgLy8gRmlsdHJhciBzb2xvIHJlY3Vyc29zIGRlIFRyaW5pdHlcclxuICAgICAgICAgIFRhZ0tleTogWydQcm9qZWN0J10sXHJcbiAgICAgICAgICBUYWdWYWx1ZTogWydUcmluaXR5J10sXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgbm90aWZpY2F0aW9uc1dpdGhTdWJzY3JpYmVyczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIG5vdGlmaWNhdGlvbjoge1xyXG4gICAgICAgICAgICBub3RpZmljYXRpb25UeXBlOiAnQUNUVUFMJyxcclxuICAgICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiAnR1JFQVRFUl9USEFOJyxcclxuICAgICAgICAgICAgdGhyZXNob2xkOiA4MCwgLy8gODAlIGRlbCBwcmVzdXB1ZXN0b1xyXG4gICAgICAgICAgICB0aHJlc2hvbGRUeXBlOiAnUEVSQ0VOVEFHRScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvblR5cGU6ICdFTUFJTCcsXHJcbiAgICAgICAgICAgICAgYWRkcmVzczogYWxlcnRFbWFpbCxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcclxuICAgICAgICAgICAgbm90aWZpY2F0aW9uVHlwZTogJ0ZPUkVDQVNURUQnLFxyXG4gICAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6ICdHUkVBVEVSX1RIQU4nLFxyXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDEwMCwgLy8gMTAwJSBkZWwgcHJlc3VwdWVzdG8gcHJveWVjdGFkb1xyXG4gICAgICAgICAgICB0aHJlc2hvbGRUeXBlOiAnUEVSQ0VOVEFHRScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvblR5cGU6ICdFTUFJTCcsXHJcbiAgICAgICAgICAgICAgYWRkcmVzczogYWxlcnRFbWFpbCxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcclxuICAgICAgICAgICAgbm90aWZpY2F0aW9uVHlwZTogJ0FDVFVBTCcsXHJcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXHJcbiAgICAgICAgICAgIHRocmVzaG9sZDogNTAsIC8vIDUwJSBkZWwgcHJlc3VwdWVzdG9cclxuICAgICAgICAgICAgdGhyZXNob2xkVHlwZTogJ1BFUkNFTlRBR0UnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHN1YnNjcmliZXJzOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25UeXBlOiAnRU1BSUwnLFxyXG4gICAgICAgICAgICAgIGFkZHJlc3M6IGFsZXJ0RW1haWwsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgb3B0aW1pemVMYW1iZGFGdW5jdGlvbnMoc3RhZ2U6IHN0cmluZywgZnVuY3Rpb25zOiBsYW1iZGEuRnVuY3Rpb25bXSkge1xyXG4gICAgZnVuY3Rpb25zLmZvckVhY2goKGZ1bmMsIGluZGV4KSA9PiB7XHJcbiAgICAgIC8vIDEuIENvbmZpZ3VyYXIgUmVzZXJ2ZWQgQ29uY3VycmVuY3kgcGFyYSBldml0YXIgY29zdG9zIGluZXNwZXJhZG9zXHJcbiAgICAgIGZ1bmMuYWRkRW52aXJvbm1lbnQoJ1JFU0VSVkVEX0NPTkNVUlJFTkNZJywgJzEwJyk7IC8vIE3DoXhpbW8gMTAgZWplY3VjaW9uZXMgY29uY3VycmVudGVzXHJcblxyXG4gICAgICAvLyAyLiBBbGFybWEgZGUgZHVyYWNpw7NuIGV4Y2VzaXZhXHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgTGFtYmRhRHVyYXRpb25BbGFybSR7aW5kZXh9YCwge1xyXG4gICAgICAgIGFsYXJtTmFtZTogYHRyaW5pdHktbGFtYmRhLWR1cmF0aW9uLSR7ZnVuYy5mdW5jdGlvbk5hbWV9LSR7c3RhZ2V9YCxcclxuICAgICAgICBtZXRyaWM6IGZ1bmMubWV0cmljRHVyYXRpb24oe1xyXG4gICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgdGhyZXNob2xkOiAyNTAwMCwgLy8gMjUgc2VndW5kb3MgKDgzJSBkZWwgdGltZW91dCBkZSAzMHMpXHJcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXHJcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgZHVyYXRpb25BbGFybS5hZGRBbGFybUFjdGlvbihcclxuICAgICAgICBuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuX2Nvc3RBbGFybVRvcGljKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gMy4gQWxhcm1hIGRlIGVycm9yZXMgZXhjZXNpdm9zXHJcbiAgICAgIGNvbnN0IGVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgTGFtYmRhRXJyb3JBbGFybSR7aW5kZXh9YCwge1xyXG4gICAgICAgIGFsYXJtTmFtZTogYHRyaW5pdHktbGFtYmRhLWVycm9ycy0ke2Z1bmMuZnVuY3Rpb25OYW1lfS0ke3N0YWdlfWAsXHJcbiAgICAgICAgbWV0cmljOiBmdW5jLm1ldHJpY0Vycm9ycyh7XHJcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHRocmVzaG9sZDogMTAsIC8vIE3DoXMgZGUgMTAgZXJyb3JlcyBlbiA1IG1pbnV0b3NcclxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcclxuICAgICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBlcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKFxyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5fY29zdEFsYXJtVG9waWMpXHJcbiAgICAgICk7XHJcblxyXG4gICAgICAvLyA0LiBBbGFybWEgZGUgaW52b2NhY2lvbmVzIGV4Y2VzaXZhcyAocHJvdGVjY2nDs24gY29udHJhIGF0YXF1ZXMpXHJcbiAgICAgIGNvbnN0IGludm9jYXRpb25BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGBMYW1iZGFJbnZvY2F0aW9uQWxhcm0ke2luZGV4fWAsIHtcclxuICAgICAgICBhbGFybU5hbWU6IGB0cmluaXR5LWxhbWJkYS1pbnZvY2F0aW9ucy0ke2Z1bmMuZnVuY3Rpb25OYW1lfS0ke3N0YWdlfWAsXHJcbiAgICAgICAgbWV0cmljOiBmdW5jLm1ldHJpY0ludm9jYXRpb25zKHtcclxuICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgdGhyZXNob2xkOiAxMDAwLCAvLyBNw6FzIGRlIDEwMDAgaW52b2NhY2lvbmVzIGVuIDUgbWludXRvc1xyXG4gICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxyXG4gICAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGludm9jYXRpb25BbGFybS5hZGRBbGFybUFjdGlvbihcclxuICAgICAgICBuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuX2Nvc3RBbGFybVRvcGljKVxyXG4gICAgICApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9wdGltaXplRHluYW1vREJUYWJsZXMoc3RhZ2U6IHN0cmluZywgdGFibGVzOiBkeW5hbW9kYi5UYWJsZVtdKSB7XHJcbiAgICB0YWJsZXMuZm9yRWFjaCgodGFibGUsIGluZGV4KSA9PiB7XHJcbiAgICAgIC8vIDEuIEFsYXJtYSBkZSBjb25zdW1vIGRlIFJDVSBleGNlc2l2b1xyXG4gICAgICBjb25zdCByZWFkQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgRHluYW1vUmVhZEFsYXJtJHtpbmRleH1gLCB7XHJcbiAgICAgICAgYWxhcm1OYW1lOiBgdHJpbml0eS1keW5hbW8tcmVhZC0ke3RhYmxlLnRhYmxlTmFtZX0tJHtzdGFnZX1gLFxyXG4gICAgICAgIG1ldHJpYzogdGFibGUubWV0cmljQ29uc3VtZWRSZWFkQ2FwYWNpdHlVbml0cyh7XHJcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHRocmVzaG9sZDogMTAwLCAvLyBNw6FzIGRlIDEwMCBSQ1UgY29uc3VtaWRhcyBlbiA1IG1pbnV0b3NcclxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcclxuICAgICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICByZWFkQWxhcm0uYWRkQWxhcm1BY3Rpb24oXHJcbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLl9jb3N0QWxhcm1Ub3BpYylcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIDIuIEFsYXJtYSBkZSBjb25zdW1vIGRlIFdDVSBleGNlc2l2b1xyXG4gICAgICBjb25zdCB3cml0ZUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYER5bmFtb1dyaXRlQWxhcm0ke2luZGV4fWAsIHtcclxuICAgICAgICBhbGFybU5hbWU6IGB0cmluaXR5LWR5bmFtby13cml0ZS0ke3RhYmxlLnRhYmxlTmFtZX0tJHtzdGFnZX1gLFxyXG4gICAgICAgIG1ldHJpYzogdGFibGUubWV0cmljQ29uc3VtZWRXcml0ZUNhcGFjaXR5VW5pdHMoe1xyXG4gICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICB9KSxcclxuICAgICAgICB0aHJlc2hvbGQ6IDEwMCwgLy8gTcOhcyBkZSAxMDAgV0NVIGNvbnN1bWlkYXMgZW4gNSBtaW51dG9zXHJcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXHJcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgd3JpdGVBbGFybS5hZGRBbGFybUFjdGlvbihcclxuICAgICAgICBuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuX2Nvc3RBbGFybVRvcGljKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gMy4gQWxhcm1hIGRlIGVycm9yZXMgZGUgdGhyb3R0bGluZ1xyXG4gICAgICBjb25zdCB0aHJvdHRsZUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYER5bmFtb1Rocm90dGxlQWxhcm0ke2luZGV4fWAsIHtcclxuICAgICAgICBhbGFybU5hbWU6IGB0cmluaXR5LWR5bmFtby10aHJvdHRsZS0ke3RhYmxlLnRhYmxlTmFtZX0tJHtzdGFnZX1gLFxyXG4gICAgICAgIG1ldHJpYzogdGFibGUubWV0cmljVGhyb3R0bGVkUmVxdWVzdHNGb3JPcGVyYXRpb25zKHtcclxuICAgICAgICAgIG9wZXJhdGlvbnM6IFtkeW5hbW9kYi5PcGVyYXRpb24uUFVUX0lURU0sIGR5bmFtb2RiLk9wZXJhdGlvbi5HRVRfSVRFTV0sXHJcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHRocmVzaG9sZDogNSwgLy8gTcOhcyBkZSA1IHRocm90dGxlcyBlbiA1IG1pbnV0b3NcclxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcclxuICAgICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aHJvdHRsZUFsYXJtLmFkZEFsYXJtQWN0aW9uKFxyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5fY29zdEFsYXJtVG9waWMpXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlQ29zdERhc2hib2FyZChzdGFnZTogc3RyaW5nKSB7XHJcbiAgICB0aGlzLl9kYXNoYm9hcmRzID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdUcmluaXR5RGFzaGJvYXJkJywge1xyXG4gICAgICBkYXNoYm9hcmROYW1lOiBgdHJpbml0eS1jb3N0LW1vbml0b3JpbmctJHtzdGFnZX1gLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gV2lkZ2V0IGRlIGNvc3RvcyBlc3RpbWFkb3NcclxuICAgIHRoaXMuX2Rhc2hib2FyZHMuYWRkV2lkZ2V0cyhcclxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgIHRpdGxlOiAnRXN0aW1hdGVkIE1vbnRobHkgQ29zdHMnLFxyXG4gICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9CaWxsaW5nJyxcclxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0VzdGltYXRlZENoYXJnZXMnLFxyXG4gICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7XHJcbiAgICAgICAgICAgICAgQ3VycmVuY3k6ICdVU0QnLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdNYXhpbXVtJyxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgIGhlaWdodDogNixcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gV2lkZ2V0IGRlIGludm9jYWNpb25lcyBMYW1iZGFcclxuICAgIHRoaXMuX2Rhc2hib2FyZHMuYWRkV2lkZ2V0cyhcclxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgIHRpdGxlOiAnTGFtYmRhIEludm9jYXRpb25zJyxcclxuICAgICAgICBsZWZ0OiBbXHJcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcclxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0ludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgIGhlaWdodDogNixcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gV2lkZ2V0IGRlIER5bmFtb0RCIFJDVS9XQ1VcclxuICAgIHRoaXMuX2Rhc2hib2FyZHMuYWRkV2lkZ2V0cyhcclxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgIHRpdGxlOiAnRHluYW1vREIgQ2FwYWNpdHkgVW5pdHMnLFxyXG4gICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXHJcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb25zdW1lZFJlYWRDYXBhY2l0eVVuaXRzJyxcclxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmlnaHQ6IFtcclxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXHJcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb25zdW1lZFdyaXRlQ2FwYWNpdHlVbml0cycsXHJcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHdpZHRoOiAxMixcclxuICAgICAgICBoZWlnaHQ6IDYsXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvcHRpbWl6ZUxvZ1JldGVudGlvbihzdGFnZTogc3RyaW5nKSB7XHJcbiAgICAvLyBDb25maWd1cmFyIHJldGVuY2nDs24gZGUgbG9ncyBwYXJhIGRpZmVyZW50ZXMgc3RhZ2VzXHJcbiAgICBjb25zdCByZXRlbnRpb25EYXlzID0gc3RhZ2UgPT09ICdwcm9kJyBcclxuICAgICAgPyBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIFxyXG4gICAgICA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSztcclxuXHJcbiAgICAvLyBDcmVhciBwb2zDrXRpY2EgZGUgcmV0ZW5jacOzbiBwYXJhIHRvZG9zIGxvcyBsb2cgZ3JvdXBzIGRlIExhbWJkYVxyXG4gICAgLy8gRXN0byBzZSBhcGxpY2Fyw6EgYXV0b23DoXRpY2FtZW50ZSBhIGxhcyBmdW5jaW9uZXMgTGFtYmRhIGNyZWFkYXNcclxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdEZWZhdWx0TG9nUmV0ZW50aW9uJywge1xyXG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS90cmluaXR5LWRlZmF1bHQtJHtzdGFnZX1gLFxyXG4gICAgICByZXRlbnRpb246IHJldGVudGlvbkRheXMsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlT3V0cHV0cygpIHtcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb3N0QWxhcm1Ub3BpY0FybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuX2Nvc3RBbGFybVRvcGljLnRvcGljQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBkZWwgdG9waWMgU05TIHBhcmEgYWxlcnRhcyBkZSBjb3N0b3MnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rhc2hib2FyZFVybCcsIHtcclxuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHt0aGlzLl9kYXNoYm9hcmRzLmRhc2hib2FyZE5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgZGVsIGRhc2hib2FyZCBkZSBtb25pdG9yZW8gZGUgY29zdG9zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWRnZXROYW1lJywge1xyXG4gICAgICB2YWx1ZTogYHRyaW5pdHktbW9udGhseS1idWRnZXQtJHt0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnc3RhZ2UnKSB8fCAnZGV2J31gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05vbWJyZSBkZWwgcHJlc3VwdWVzdG8gY29uZmlndXJhZG8nLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59Il19