#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TrinityStack } from '../lib/trinity-stack';
import { TrinityOptimizationStack } from '../lib/trinity-cost-optimization-stack';

const app = new cdk.App();

// Stack principal con toda la funcionalidad
const mainStack = new TrinityStack(app, 'TrinityMvpStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Trinity MVP - Aplicación para consensuar contenido multimedia en grupo',
});

// Stack de optimización de costos
new TrinityOptimizationStack(app, 'TrinityOptimizationStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Trinity Cost Optimization - Monitoreo y optimización automática de costos AWS',
  stage: process.env.STAGE || 'dev',
  monthlyBudgetLimit: parseFloat(process.env.MONTHLY_BUDGET_LIMIT || '50'),
  alertEmail: process.env.ALERT_EMAIL || 'admin@trinity.com',
  lambdaFunctions: [
    mainStack.authHandler,
    mainStack.roomHandler,
    mainStack.movieHandler,
    mainStack.voteHandler,
    mainStack.aiHandler,
  ],
  dynamoTables: [
    mainStack.usersTable,
    mainStack.roomsTable,
    mainStack.roomMembersTable,
    mainStack.votesTable,
    mainStack.moviesCacheTable,
  ],
});