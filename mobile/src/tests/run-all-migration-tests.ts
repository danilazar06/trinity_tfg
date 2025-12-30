/**
 * Master Test Runner for AWS Cognito Authentication Migration
 * 
 * Executes all property tests and integration tests for the complete
 * migration from legacy NestJS authentication to AWS Cognito with AppSync.
 */

import { loggingService } from '../services/loggingService';

// Property Tests
import { runCognitoAuthIntegrationTests } from './property-test-cognito-auth-integration';
import { runTokenLifecycleTests } from './property-test-token-lifecycle';
import { runUserDataConsistencyTests } from './property-test-user-data-consistency';
import { runAuthStatePropagationPropertyTests } from './property-test-auth-state-propagation';
import { runGraphQLAPIMigrationTests } from './property-test-graphql-api-migration';
import { runRealtimeSubscriptionTests } from './property-test-realtime-subscriptions';
import { runSubscriptionCleanupTests } from './property-test-subscription-cleanup';
import { runConnectionResilienceTests } from './property-test-connection-resilience';
import { runComprehensiveErrorHandlingTests } from './property-test-comprehensive-error-handling';
import { runMigrationTokenCleanupTests } from './property-test-migration-token-cleanup';
import { runNetworkResilienceTests } from './property-test-network-resilience';
import { runSecureLoggingTests } from './property-test-secure-logging';
import { runEndToEndFunctionalityPropertyTests } from './property-test-end-to-end-functionality';

// Integration Tests
import { runAuthStatePropagationTests } from './integration-auth-state-propagation';
import { runEndToEndWorkflowTests } from './integration-end-to-end-workflow';
import { runComprehensiveErrorScenarioTests } from './integration-comprehensive-error-scenarios';

interface TestSuite {
  name: string;
  description: string;
  type: 'property' | 'integration';
  execute: () => Promise<boolean> | boolean;
  requirements: string[];
  critical: boolean; // Whether failure should stop the entire test run
}

interface TestResult {
  suiteName: string;
  success: boolean;
  duration: number;
  error?: string;
  type: 'property' | 'integration';
  requirements: string[];
}

interface TestSummary {
  totalSuites: number;
  passedSuites: number;
  failedSuites: number;
  propertyTests: { passed: number; total: number };
  integrationTests: { passed: number; total: number };
  criticalFailures: number;
  totalDuration: number;
  overallSuccess: boolean;
  requirementsCoverage: Record<string, { tested: boolean; passed: boolean }>;
}

/**
 * All test suites for the Cognito migration
 */
const TEST_SUITES: TestSuite[] = [
  // Phase 1: Core Authentication Migration Property Tests
  {
    name: 'Cognito Authentication Integration',
    description: 'Property 1: Validates Cognito authentication integration correctness',
    type: 'property',
    execute: runCognitoAuthIntegrationTests,
    requirements: ['1.2', '1.3', '7.1', '7.2'],
    critical: true
  },
  {
    name: 'Token Lifecycle Management',
    description: 'Property 2: Validates token lifecycle management correctness',
    type: 'property',
    execute: runTokenLifecycleTests,
    requirements: ['1.4'],
    critical: true
  },
  {
    name: 'User Data Format Consistency',
    description: 'Property 3: Validates user data format consistency',
    type: 'property',
    execute: runUserDataConsistencyTests,
    requirements: ['2.2', '5.4'],
    critical: false
  },

  // Phase 2: Backend Operations Migration Property Tests
  {
    name: 'GraphQL API Migration',
    description: 'Property 5: Validates GraphQL API migration correctness',
    type: 'property',
    execute: runGraphQLAPIMigrationTests,
    requirements: ['3.1', '3.2', '3.4'],
    critical: true
  },
  {
    name: 'Comprehensive Error Handling',
    description: 'Property 9: Validates comprehensive error handling',
    type: 'property',
    execute: runComprehensiveErrorHandlingTests,
    requirements: ['2.5', '3.5', '6.3', '7.5'],
    critical: false
  },

  // Phase 3: Real-time Features Property Tests
  {
    name: 'Real-time Subscription Management',
    description: 'Property 6: Validates real-time subscription management',
    type: 'property',
    execute: runRealtimeSubscriptionTests,
    requirements: ['4.1', '4.2', '4.3'],
    critical: false
  },
  {
    name: 'Subscription Cleanup',
    description: 'Property 7: Validates subscription cleanup correctness',
    type: 'property',
    execute: runSubscriptionCleanupTests,
    requirements: ['4.4'],
    critical: false
  },
  {
    name: 'Connection Resilience',
    description: 'Property 8: Validates connection resilience',
    type: 'property',
    execute: runConnectionResilienceTests,
    requirements: ['4.5'],
    critical: false
  },

  // Phase 4: Migration Edge Cases Property Tests
  {
    name: 'Migration Token Cleanup',
    description: 'Property 10: Validates migration token cleanup',
    type: 'property',
    execute: runMigrationTokenCleanupTests,
    requirements: ['6.1'],
    critical: false
  },
  {
    name: 'Network Resilience',
    description: 'Property 11: Validates network resilience',
    type: 'property',
    execute: runNetworkResilienceTests,
    requirements: ['6.2', '6.4'],
    critical: false
  },
  {
    name: 'Secure Logging',
    description: 'Property 12: Validates secure logging',
    type: 'property',
    execute: runSecureLoggingTests,
    requirements: ['6.5'],
    critical: false
  },

  // Phase 6: Integration Testing
  {
    name: 'Authentication State Propagation',
    description: 'Property 4: Validates authentication state propagation',
    type: 'property',
    execute: runAuthStatePropagationPropertyTests,
    requirements: ['2.3'],
    critical: true
  },
  {
    name: 'End-to-End Functionality',
    description: 'Property 13: Validates end-to-end functionality',
    type: 'property',
    execute: runEndToEndFunctionalityPropertyTests,
    requirements: ['7.3', '7.4'],
    critical: true
  },

  // Integration Tests
  {
    name: 'Authentication State Propagation Integration',
    description: 'Integration test for authentication state management',
    type: 'integration',
    execute: runAuthStatePropagationTests,
    requirements: ['2.3'],
    critical: false
  },
  {
    name: 'End-to-End Workflow Integration',
    description: 'Integration test for complete user workflows',
    type: 'integration',
    execute: runEndToEndWorkflowTests,
    requirements: ['7.3', '7.4'],
    critical: false
  },
  {
    name: 'Comprehensive Error Scenarios',
    description: 'Integration test for error handling and recovery',
    type: 'integration',
    execute: runComprehensiveErrorScenarioTests,
    requirements: ['6.3', '7.5'],
    critical: false
  }
];

/**
 * Execute all migration tests
 */
export async function runAllMigrationTests(options: {
  skipIntegration?: boolean;
  skipNonCritical?: boolean;
  continueOnFailure?: boolean;
} = {}): Promise<TestSummary> {
  console.log('\n🚀 Starting AWS Cognito Authentication Migration Test Suite\n');
  console.log('=' .repeat(80));
  console.log('🎯 Testing complete migration from NestJS REST API to AWS Cognito + AppSync');
  console.log('📋 Validating 13 correctness properties and integration scenarios');
  console.log('🔍 Covering authentication, real-time features, and error handling');
  console.log('=' .repeat(80));

  loggingService.info('Migration Test Suite', 'Starting complete migration test suite', {
    totalSuites: TEST_SUITES.length,
    skipIntegration: options.skipIntegration,
    skipNonCritical: options.skipNonCritical,
    continueOnFailure: options.continueOnFailure
  });

  const results: TestResult[] = [];
  const startTime = Date.now();
  let criticalFailures = 0;

  // Filter test suites based on options
  let suitesToRun = TEST_SUITES;

  if (options.skipIntegration) {
    suitesToRun = suitesToRun.filter(suite => suite.type !== 'integration');
    console.log('⚠️ Skipping integration tests as requested\n');
  }

  if (options.skipNonCritical) {
    suitesToRun = suitesToRun.filter(suite => suite.critical);
    console.log('⚠️ Running only critical tests as requested\n');
  }

  console.log(`📊 Running ${suitesToRun.length} test suites...\n`);

  // Execute test suites
  for (let i = 0; i < suitesToRun.length; i++) {
    const suite = suitesToRun[i];
    const suiteStartTime = Date.now();

    console.log(`\n[${i + 1}/${suitesToRun.length}] 🧪 ${suite.name}`);
    console.log(`📝 ${suite.description}`);
    console.log(`🎯 Requirements: ${suite.requirements.join(', ')}`);
    console.log(`${suite.critical ? '🔴 Critical' : '🟡 Non-Critical'} | ${suite.type.toUpperCase()} Test`);
    console.log('-'.repeat(60));

    try {
      const success = await suite.execute();
      const duration = Date.now() - suiteStartTime;

      results.push({
        suiteName: suite.name,
        success,
        duration,
        type: suite.type,
        requirements: suite.requirements
      });

      if (success) {
        console.log(`✅ ${suite.name} PASSED (${duration}ms)`);
        
        loggingService.info('Migration Test Suite', `${suite.name} passed`, {
          duration,
          type: suite.type,
          requirements: suite.requirements
        });
      } else {
        console.log(`❌ ${suite.name} FAILED (${duration}ms)`);
        
        loggingService.error('Migration Test Suite', `${suite.name} failed`, {
          duration,
          type: suite.type,
          requirements: suite.requirements
        });

        if (suite.critical) {
          criticalFailures++;
          console.log(`🚨 CRITICAL TEST FAILURE - This may indicate a serious migration issue`);

          if (!options.continueOnFailure) {
            console.log(`🛑 Stopping test execution due to critical failure`);
            break;
          }
        }
      }

    } catch (error) {
      const duration = Date.now() - suiteStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.log(`💥 ${suite.name} ERROR (${duration}ms): ${errorMessage}`);

      results.push({
        suiteName: suite.name,
        success: false,
        duration,
        error: errorMessage,
        type: suite.type,
        requirements: suite.requirements
      });

      loggingService.error('Migration Test Suite', `${suite.name} error`, {
        duration,
        error: errorMessage,
        type: suite.type,
        requirements: suite.requirements
      });

      if (suite.critical) {
        criticalFailures++;
        console.log(`🚨 CRITICAL TEST ERROR - This indicates a serious system issue`);

        if (!options.continueOnFailure) {
          console.log(`🛑 Stopping test execution due to critical error`);
          break;
        }
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  // Generate comprehensive summary
  const summary = generateTestSummary(results, totalDuration, criticalFailures);

  // Display results
  displayTestResults(summary, options);

  // Log final summary
  loggingService.info('Migration Test Suite', 'Test suite completed', {
    ...summary,
    options
  });

  return summary;
}

/**
 * Generate comprehensive test summary
 */
function generateTestSummary(results: TestResult[], totalDuration: number, criticalFailures: number): TestSummary {
  const totalSuites = results.length;
  const passedSuites = results.filter(r => r.success).length;
  const failedSuites = totalSuites - passedSuites;

  const propertyTests = results.filter(r => r.type === 'property');
  const integrationTests = results.filter(r => r.type === 'integration');

  // Calculate requirements coverage
  const requirementsCoverage: Record<string, { tested: boolean; passed: boolean }> = {};
  
  results.forEach(result => {
    result.requirements.forEach(req => {
      if (!requirementsCoverage[req]) {
        requirementsCoverage[req] = { tested: true, passed: result.success };
      } else {
        // If multiple tests cover the same requirement, all must pass
        requirementsCoverage[req].passed = requirementsCoverage[req].passed && result.success;
      }
    });
  });

  const overallSuccess = criticalFailures === 0 && passedSuites >= totalSuites * 0.8; // 80% pass rate

  return {
    totalSuites,
    passedSuites,
    failedSuites,
    propertyTests: {
      passed: propertyTests.filter(t => t.success).length,
      total: propertyTests.length
    },
    integrationTests: {
      passed: integrationTests.filter(t => t.success).length,
      total: integrationTests.length
    },
    criticalFailures,
    totalDuration,
    overallSuccess,
    requirementsCoverage
  };
}

/**
 * Display comprehensive test results
 */
function displayTestResults(summary: TestSummary, options: any): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 AWS COGNITO MIGRATION TEST RESULTS');
  console.log('='.repeat(80));

  // Overall Results
  console.log(`\n🎯 OVERALL RESULTS:`);
  console.log(`   Total Test Suites: ${summary.totalSuites}`);
  console.log(`   Passed: ${summary.passedSuites} ✅`);
  console.log(`   Failed: ${summary.failedSuites} ❌`);
  console.log(`   Success Rate: ${((summary.passedSuites / summary.totalSuites) * 100).toFixed(1)}%`);
  console.log(`   Critical Failures: ${summary.criticalFailures} ${summary.criticalFailures === 0 ? '✅' : '🚨'}`);

  // Test Type Breakdown
  console.log(`\n📋 TEST TYPE BREAKDOWN:`);
  console.log(`   Property Tests: ${summary.propertyTests.passed}/${summary.propertyTests.total} (${((summary.propertyTests.passed / summary.propertyTests.total) * 100).toFixed(1)}%)`);
  console.log(`   Integration Tests: ${summary.integrationTests.passed}/${summary.integrationTests.total} (${((summary.integrationTests.passed / summary.integrationTests.total) * 100).toFixed(1)}%)`);

  // Requirements Coverage
  console.log(`\n🎯 REQUIREMENTS COVERAGE:`);
  const totalRequirements = Object.keys(summary.requirementsCoverage).length;
  const passedRequirements = Object.values(summary.requirementsCoverage).filter(r => r.passed).length;
  
  console.log(`   Total Requirements: ${totalRequirements}`);
  console.log(`   Passed Requirements: ${passedRequirements} ✅`);
  console.log(`   Failed Requirements: ${totalRequirements - passedRequirements} ❌`);
  console.log(`   Coverage Rate: ${((passedRequirements / totalRequirements) * 100).toFixed(1)}%`);

  // Failed Requirements Details
  const failedRequirements = Object.entries(summary.requirementsCoverage)
    .filter(([_, status]) => !status.passed)
    .map(([req, _]) => req);

  if (failedRequirements.length > 0) {
    console.log(`\n❌ FAILED REQUIREMENTS:`);
    failedRequirements.forEach(req => {
      console.log(`   - Requirement ${req}`);
    });
  }

  // Performance Summary
  console.log(`\n⚡ PERFORMANCE SUMMARY:`);
  console.log(`   Total Execution Time: ${(summary.totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Average Test Time: ${(summary.totalDuration / summary.totalSuites / 1000).toFixed(1)}s`);

  // Migration Status
  console.log(`\n🚀 MIGRATION STATUS:`);
  if (summary.overallSuccess) {
    console.log(`   ✅ MIGRATION READY FOR PRODUCTION`);
    console.log(`   🎉 All critical tests passed`);
    console.log(`   📈 Success rate meets requirements (≥80%)`);
    console.log(`   🔒 Error handling validated`);
    console.log(`   ⚡ Real-time features operational`);
  } else {
    console.log(`   ❌ MIGRATION NOT READY FOR PRODUCTION`);
    
    if (summary.criticalFailures > 0) {
      console.log(`   🚨 ${summary.criticalFailures} critical test(s) failed`);
    }
    
    const successRate = (summary.passedSuites / summary.totalSuites) * 100;
    if (successRate < 80) {
      console.log(`   📉 Success rate below threshold: ${successRate.toFixed(1)}% < 80%`);
    }
    
    console.log(`   🔧 Review failed tests and fix issues before deployment`);
  }

  // Next Steps
  console.log(`\n📋 NEXT STEPS:`);
  if (summary.overallSuccess) {
    console.log(`   1. ✅ Deploy to staging environment`);
    console.log(`   2. ✅ Perform user acceptance testing`);
    console.log(`   3. ✅ Plan production deployment`);
    console.log(`   4. ✅ Monitor real-time metrics post-deployment`);
  } else {
    console.log(`   1. 🔧 Fix critical test failures`);
    console.log(`   2. 🔍 Investigate failed requirements`);
    console.log(`   3. 🧪 Re-run test suite`);
    console.log(`   4. 📊 Validate success rate ≥80%`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🏁 FINAL RESULT: ${summary.overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(80));
}

/**
 * Run only critical tests (for CI/CD)
 */
export async function runCriticalMigrationTests(): Promise<boolean> {
  console.log('🚨 Running Critical Migration Tests Only...\n');
  
  const summary = await runAllMigrationTests({
    skipNonCritical: true,
    continueOnFailure: false
  });
  
  return summary.overallSuccess && summary.criticalFailures === 0;
}

/**
 * Run only property tests (for development)
 */
export async function runPropertyTestsOnly(): Promise<boolean> {
  console.log('🧪 Running Property Tests Only...\n');
  
  const summary = await runAllMigrationTests({
    skipIntegration: true,
    continueOnFailure: true
  });
  
  return summary.propertyTests.passed === summary.propertyTests.total;
}

/**
 * Run quick validation (critical property tests only)
 */
export async function runQuickValidation(): Promise<boolean> {
  console.log('⚡ Running Quick Validation (Critical Property Tests)...\n');
  
  const summary = await runAllMigrationTests({
    skipIntegration: true,
    skipNonCritical: true,
    continueOnFailure: false
  });
  
  return summary.overallSuccess && summary.criticalFailures === 0;
}

// Export main test runner
export default runAllMigrationTests;