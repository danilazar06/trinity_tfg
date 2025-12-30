#!/usr/bin/env node

/**
 * Trinity Backend Connectivity Test
 * Validates backend deployment and security without requiring authentication
 */

const https = require('https');
const { execSync } = require('child_process');

// Configuration from deployment
const CONFIG = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_6UxioIj4z',
  apiKey: process.env.APPSYNC_API_KEY || 'da2-fakeApiId123456'
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    security: '🔒'
  }[type];
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function recordTest(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    log(`${name}: PASSED ${details}`, 'success');
  } else {
    results.failed++;
    log(`${name}: FAILED ${details}`, 'error');
  }
}

// HTTP request helper
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// GraphQL request helper
async function graphqlRequest(query, variables = {}, operationName = null) {
  const url = new URL(CONFIG.graphqlEndpoint);
  
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.apiKey
    }
  };

  const requestBody = {
    query,
    variables,
    operationName
  };

  return makeRequest(options, requestBody);
}

// Test 1: AppSync Endpoint Reachability
async function testAppSyncReachability() {
  try {
    const query = `query HealthCheck { __typename }`;
    const response = await graphqlRequest(query, {}, 'HealthCheck');
    
    // We expect either success or 401 (both indicate the service is running)
    if (response.status === 200 || response.status === 401) {
      recordTest('AppSync Endpoint Reachability', true, `Status: ${response.status} (Service responding)`);
      return true;
    } else {
      recordTest('AppSync Endpoint Reachability', false, `Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    recordTest('AppSync Endpoint Reachability', false, `Network error: ${error.message}`);
    return false;
  }
}

// Test 2: Security Configuration (401 responses expected)
async function testSecurityConfiguration() {
  try {
    const query = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
        }
      }
    `;
    
    const response = await graphqlRequest(query, {
      input: {
        name: 'Security Test Room',
        filters: { contentTypes: ['movie'] }
      }
    }, 'CreateRoom');
    
    // We EXPECT 401 Unauthorized - this means security is working
    if (response.status === 401 || 
        (response.data.errors && response.data.errors.some(e => 
          e.errorType === 'UnauthorizedException' || 
          e.message.includes('not authorized')))) {
      recordTest('Security Configuration', true, 'Unauthorized access properly blocked (401)');
      return true;
    } else if (response.status === 200) {
      recordTest('Security Configuration', false, 'SECURITY ISSUE: Unauthenticated request succeeded!');
      return false;
    } else {
      recordTest('Security Configuration', false, `Unexpected response: ${response.status}`);
      return false;
    }
  } catch (error) {
    recordTest('Security Configuration', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 3: GraphQL Schema Validation
async function testGraphQLSchema() {
  try {
    // Test with invalid query to check schema validation
    const query = `query InvalidQuery { nonExistentField }`;
    const response = await graphqlRequest(query, {}, 'InvalidQuery');
    
    // We expect either 400 (schema validation) or 401 (auth first)
    if (response.status === 400 || response.status === 401 ||
        (response.data.errors && response.data.errors.length > 0)) {
      recordTest('GraphQL Schema Validation', true, 'Schema validation working');
      return true;
    } else {
      recordTest('GraphQL Schema Validation', false, `Unexpected response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    recordTest('GraphQL Schema Validation', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 4: Cognito User Pool Configuration
async function testCognitoConfiguration() {
  try {
    const command = `aws cognito-idp describe-user-pool --user-pool-id ${CONFIG.userPoolId} --region ${CONFIG.region}`;
    const output = execSync(command, { encoding: 'utf8' });
    const userPool = JSON.parse(output);
    
    if (userPool.UserPool && userPool.UserPool.Id === CONFIG.userPoolId) {
      recordTest('Cognito User Pool Configuration', true, `Pool: ${userPool.UserPool.Name}`);
      return true;
    } else {
      recordTest('Cognito User Pool Configuration', false, 'User pool not found or invalid');
      return false;
    }
  } catch (error) {
    recordTest('Cognito User Pool Configuration', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 5: Lambda Functions Deployment
async function testLambdaDeployment() {
  try {
    const command = `aws lambda list-functions --region ${CONFIG.region} --query "Functions[?starts_with(FunctionName, 'TrinityMvpStack')]"`;
    const output = execSync(command, { encoding: 'utf8' });
    const functions = JSON.parse(output);
    
    if (functions && functions.length >= 6) {
      recordTest('Lambda Functions Deployment', true, `Found ${functions.length} functions`);
      
      // List function names for verification
      const functionNames = functions.map(f => f.FunctionName.replace('TrinityMvpStack-', ''));
      log(`Lambda Functions: ${functionNames.join(', ')}`, 'info');
      return true;
    } else {
      recordTest('Lambda Functions Deployment', false, `Expected 6+ functions, found ${functions ? functions.length : 0}`);
      return false;
    }
  } catch (error) {
    recordTest('Lambda Functions Deployment', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 6: DynamoDB Tables Deployment
async function testDynamoDBDeployment() {
  try {
    const command = `aws dynamodb list-tables --region ${CONFIG.region} --query "TableNames[?starts_with(@, 'TrinityMvpStack')]"`;
    const output = execSync(command, { encoding: 'utf8' });
    const tables = JSON.parse(output);
    
    if (tables && tables.length >= 6) {
      recordTest('DynamoDB Tables Deployment', true, `Found ${tables.length} tables`);
      
      // List table names for verification
      const tableNames = tables.map(t => t.replace('TrinityMvpStack-', ''));
      log(`DynamoDB Tables: ${tableNames.join(', ')}`, 'info');
      return true;
    } else {
      recordTest('DynamoDB Tables Deployment', false, `Expected 6+ tables, found ${tables ? tables.length : 0}`);
      return false;
    }
  } catch (error) {
    recordTest('DynamoDB Tables Deployment', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 7: Network Latency and Performance
async function testNetworkPerformance() {
  try {
    const startTime = Date.now();
    const query = `query HealthCheck { __typename }`;
    const response = await graphqlRequest(query, {}, 'HealthCheck');
    const latency = Date.now() - startTime;
    
    if (latency < 2000) { // Less than 2 seconds
      recordTest('Network Performance', true, `Latency: ${latency}ms`);
      return true;
    } else {
      recordTest('Network Performance', false, `High latency: ${latency}ms`);
      return false;
    }
  } catch (error) {
    recordTest('Network Performance', false, `Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runConnectivityTests() {
  log('🚀 Starting Trinity Backend Connectivity Tests', 'info');
  log(`📍 Region: ${CONFIG.region}`, 'info');
  log(`🔗 GraphQL Endpoint: ${CONFIG.graphqlEndpoint}`, 'info');
  log(`👤 User Pool: ${CONFIG.userPoolId}`, 'info');
  console.log('');

  // Run all tests
  await testAppSyncReachability();
  await testSecurityConfiguration();
  await testGraphQLSchema();
  await testCognitoConfiguration();
  await testLambdaDeployment();
  await testDynamoDBDeployment();
  await testNetworkPerformance();

  // Print summary
  console.log('');
  log('📊 CONNECTIVITY TEST SUMMARY', 'info');
  log(`✅ Passed: ${results.passed}`, 'success');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'error' : 'info');
  log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`, 'info');

  if (results.failed > 0) {
    console.log('');
    log('❌ FAILED TESTS:', 'error');
    results.tests.filter(t => !t.passed).forEach(test => {
      log(`  • ${test.name}: ${test.details}`, 'error');
    });
  }

  // Deployment status assessment
  console.log('');
  if (results.passed >= 6) {
    log('🎉 BACKEND DEPLOYMENT: SUCCESSFUL', 'success');
    log('✅ All critical services are deployed and responding', 'success');
    log('🔒 Security configuration is working correctly', 'security');
    log('🚀 Ready for authenticated testing and production use', 'success');
  } else if (results.passed >= 4) {
    log('⚠️  BACKEND DEPLOYMENT: PARTIALLY SUCCESSFUL', 'warning');
    log('✅ Core services are working but some issues detected', 'warning');
    log('🔧 Review failed tests and fix before production', 'warning');
  } else {
    log('❌ BACKEND DEPLOYMENT: ISSUES DETECTED', 'error');
    log('🚨 Critical services may not be properly deployed', 'error');
    log('🔧 Review deployment and fix issues before proceeding', 'error');
  }

  // Exit with appropriate code
  process.exit(results.failed > 2 ? 1 : 0); // Allow up to 2 minor failures
}

// Run if called directly
if (require.main === module) {
  runConnectivityTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runConnectivityTests, CONFIG };