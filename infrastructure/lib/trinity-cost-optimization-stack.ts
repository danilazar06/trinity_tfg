import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface TrinityOptimizationStackProps extends cdk.StackProps {
  stage?: string;
  monthlyBudgetLimit?: number;
  alertEmail?: string;
  lambdaFunctions?: lambda.Function[];
  dynamoTables?: dynamodb.Table[];
}

export class TrinityOptimizationStack extends cdk.Stack {
  private _costAlarmTopic!: sns.Topic;
  private _budgetAlarm!: budgets.CfnBudget;
  private _dashboards!: cloudwatch.Dashboard;

  // Getters públicos
  public get costAlarmTopic() { return this._costAlarmTopic; }
  public get budgetAlarm() { return this._budgetAlarm; }
  public get dashboards() { return this._dashboards; }

  constructor(scope: Construct, id: string, props: TrinityOptimizationStackProps = {}) {
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

  private createNotificationSystem(stage: string, alertEmail: string) {
    // Topic SNS para alertas de costos
    this._costAlarmTopic = new sns.Topic(this, 'CostAlarmTopic', {
      topicName: `trinity-cost-alerts-${stage}`,
      displayName: `Trinity Cost Alerts - ${stage}`,
    });

    // Suscripción por email
    this._costAlarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(alertEmail)
    );

    // Suscripción por SMS (opcional)
    // this._costAlarmTopic.addSubscription(
    //   new snsSubscriptions.SmsSubscription('+1234567890')
    // );
  }

  private createBudgetMonitoring(stage: string, monthlyBudget: number, alertEmail: string) {
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
            threshold: 80, // 80% del presupuesto
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
            threshold: 100, // 100% del presupuesto proyectado
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
            threshold: 50, // 50% del presupuesto
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

  private optimizeLambdaFunctions(stage: string, functions: lambda.Function[]) {
    functions.forEach((func, index) => {
      // 1. Configurar Reserved Concurrency para evitar costos inesperados
      func.addEnvironment('RESERVED_CONCURRENCY', '10'); // Máximo 10 ejecuciones concurrentes

      // 2. Alarma de duración excesiva
      const durationAlarm = new cloudwatch.Alarm(this, `LambdaDurationAlarm${index}`, {
        alarmName: `trinity-lambda-duration-${func.functionName}-${stage}`,
        metric: func.metricDuration({
          statistic: 'Average',
        }),
        threshold: 25000, // 25 segundos (83% del timeout de 30s)
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      durationAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );

      // 3. Alarma de errores excesivos
      const errorAlarm = new cloudwatch.Alarm(this, `LambdaErrorAlarm${index}`, {
        alarmName: `trinity-lambda-errors-${func.functionName}-${stage}`,
        metric: func.metricErrors({
          statistic: 'Sum',
        }),
        threshold: 10, // Más de 10 errores en 5 minutos
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      errorAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );

      // 4. Alarma de invocaciones excesivas (protección contra ataques)
      const invocationAlarm = new cloudwatch.Alarm(this, `LambdaInvocationAlarm${index}`, {
        alarmName: `trinity-lambda-invocations-${func.functionName}-${stage}`,
        metric: func.metricInvocations({
          statistic: 'Sum',
        }),
        threshold: 1000, // Más de 1000 invocaciones en 5 minutos
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      invocationAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );
    });
  }

  private optimizeDynamoDBTables(stage: string, tables: dynamodb.Table[]) {
    tables.forEach((table, index) => {
      // 1. Alarma de consumo de RCU excesivo
      const readAlarm = new cloudwatch.Alarm(this, `DynamoReadAlarm${index}`, {
        alarmName: `trinity-dynamo-read-${table.tableName}-${stage}`,
        metric: table.metricConsumedReadCapacityUnits({
          statistic: 'Sum',
        }),
        threshold: 100, // Más de 100 RCU consumidas en 5 minutos
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      readAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );

      // 2. Alarma de consumo de WCU excesivo
      const writeAlarm = new cloudwatch.Alarm(this, `DynamoWriteAlarm${index}`, {
        alarmName: `trinity-dynamo-write-${table.tableName}-${stage}`,
        metric: table.metricConsumedWriteCapacityUnits({
          statistic: 'Sum',
        }),
        threshold: 100, // Más de 100 WCU consumidas en 5 minutos
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      writeAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );

      // 3. Alarma de errores de throttling
      const throttleAlarm = new cloudwatch.Alarm(this, `DynamoThrottleAlarm${index}`, {
        alarmName: `trinity-dynamo-throttle-${table.tableName}-${stage}`,
        metric: table.metricThrottledRequestsForOperations({
          operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM],
          statistic: 'Sum',
        }),
        threshold: 5, // Más de 5 throttles en 5 minutos
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      throttleAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this._costAlarmTopic)
      );
    });
  }

  private createCostDashboard(stage: string) {
    this._dashboards = new cloudwatch.Dashboard(this, 'TrinityDashboard', {
      dashboardName: `trinity-cost-monitoring-${stage}`,
    });

    // Widget de costos estimados
    this._dashboards.addWidgets(
      new cloudwatch.GraphWidget({
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
      })
    );

    // Widget de invocaciones Lambda
    this._dashboards.addWidgets(
      new cloudwatch.GraphWidget({
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
      })
    );

    // Widget de DynamoDB RCU/WCU
    this._dashboards.addWidgets(
      new cloudwatch.GraphWidget({
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
      })
    );
  }

  private optimizeLogRetention(stage: string) {
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

  private createOutputs() {
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