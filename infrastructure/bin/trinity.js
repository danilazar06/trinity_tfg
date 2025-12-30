#!/usr/bin/env node
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
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const trinity_stack_1 = require("../lib/trinity-stack");
const trinity_cost_optimization_stack_1 = require("../lib/trinity-cost-optimization-stack");
const app = new cdk.App();
// Stack principal con toda la funcionalidad
const mainStack = new trinity_stack_1.TrinityStack(app, 'TrinityMvpStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'Trinity MVP - Aplicación para consensuar contenido multimedia en grupo',
});
// Stack de optimización de costos
new trinity_cost_optimization_stack_1.TrinityOptimizationStack(app, 'TrinityOptimizationStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaW5pdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLHdEQUFvRDtBQUNwRCw0RkFBa0Y7QUFFbEYsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNENBQTRDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLElBQUksNEJBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUU7SUFDekQsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7S0FDdEQ7SUFDRCxXQUFXLEVBQUUsd0VBQXdFO0NBQ3RGLENBQUMsQ0FBQztBQUVILGtDQUFrQztBQUNsQyxJQUFJLDBEQUF3QixDQUFDLEdBQUcsRUFBRSwwQkFBMEIsRUFBRTtJQUM1RCxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVztLQUN0RDtJQUNELFdBQVcsRUFBRSwrRUFBK0U7SUFDNUYsS0FBSyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLEtBQUs7SUFDakMsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUksSUFBSSxDQUFDO0lBQ3hFLFVBQVUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxtQkFBbUI7SUFDMUQsZUFBZSxFQUFFO1FBQ2YsU0FBUyxDQUFDLFdBQVc7UUFDckIsU0FBUyxDQUFDLFdBQVc7UUFDckIsU0FBUyxDQUFDLFlBQVk7UUFDdEIsU0FBUyxDQUFDLFdBQVc7UUFDckIsU0FBUyxDQUFDLFNBQVM7S0FDcEI7SUFDRCxZQUFZLEVBQUU7UUFDWixTQUFTLENBQUMsVUFBVTtRQUNwQixTQUFTLENBQUMsVUFBVTtRQUNwQixTQUFTLENBQUMsZ0JBQWdCO1FBQzFCLFNBQVMsQ0FBQyxVQUFVO1FBQ3BCLFNBQVMsQ0FBQyxnQkFBZ0I7S0FDM0I7Q0FDRixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgVHJpbml0eVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyaW5pdHktc3RhY2snO1xyXG5pbXBvcnQgeyBUcmluaXR5T3B0aW1pemF0aW9uU3RhY2sgfSBmcm9tICcuLi9saWIvdHJpbml0eS1jb3N0LW9wdGltaXphdGlvbi1zdGFjayc7XHJcblxyXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xyXG5cclxuLy8gU3RhY2sgcHJpbmNpcGFsIGNvbiB0b2RhIGxhIGZ1bmNpb25hbGlkYWRcclxuY29uc3QgbWFpblN0YWNrID0gbmV3IFRyaW5pdHlTdGFjayhhcHAsICdUcmluaXR5TXZwU3RhY2snLCB7XHJcbiAgZW52OiB7XHJcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxyXG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMScsXHJcbiAgfSxcclxuICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgTVZQIC0gQXBsaWNhY2nDs24gcGFyYSBjb25zZW5zdWFyIGNvbnRlbmlkbyBtdWx0aW1lZGlhIGVuIGdydXBvJyxcclxufSk7XHJcblxyXG4vLyBTdGFjayBkZSBvcHRpbWl6YWNpw7NuIGRlIGNvc3Rvc1xyXG5uZXcgVHJpbml0eU9wdGltaXphdGlvblN0YWNrKGFwcCwgJ1RyaW5pdHlPcHRpbWl6YXRpb25TdGFjaycsIHtcclxuICBlbnY6IHtcclxuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXHJcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcclxuICB9LFxyXG4gIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBDb3N0IE9wdGltaXphdGlvbiAtIE1vbml0b3JlbyB5IG9wdGltaXphY2nDs24gYXV0b23DoXRpY2EgZGUgY29zdG9zIEFXUycsXHJcbiAgc3RhZ2U6IHByb2Nlc3MuZW52LlNUQUdFIHx8ICdkZXYnLFxyXG4gIG1vbnRobHlCdWRnZXRMaW1pdDogcGFyc2VGbG9hdChwcm9jZXNzLmVudi5NT05USExZX0JVREdFVF9MSU1JVCB8fCAnNTAnKSxcclxuICBhbGVydEVtYWlsOiBwcm9jZXNzLmVudi5BTEVSVF9FTUFJTCB8fCAnYWRtaW5AdHJpbml0eS5jb20nLFxyXG4gIGxhbWJkYUZ1bmN0aW9uczogW1xyXG4gICAgbWFpblN0YWNrLmF1dGhIYW5kbGVyLFxyXG4gICAgbWFpblN0YWNrLnJvb21IYW5kbGVyLFxyXG4gICAgbWFpblN0YWNrLm1vdmllSGFuZGxlcixcclxuICAgIG1haW5TdGFjay52b3RlSGFuZGxlcixcclxuICAgIG1haW5TdGFjay5haUhhbmRsZXIsXHJcbiAgXSxcclxuICBkeW5hbW9UYWJsZXM6IFtcclxuICAgIG1haW5TdGFjay51c2Vyc1RhYmxlLFxyXG4gICAgbWFpblN0YWNrLnJvb21zVGFibGUsXHJcbiAgICBtYWluU3RhY2sucm9vbU1lbWJlcnNUYWJsZSxcclxuICAgIG1haW5TdGFjay52b3Rlc1RhYmxlLFxyXG4gICAgbWFpblN0YWNrLm1vdmllc0NhY2hlVGFibGUsXHJcbiAgXSxcclxufSk7Il19