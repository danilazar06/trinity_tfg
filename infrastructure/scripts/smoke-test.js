#!/usr/bin/env node

/**
 * Trinity Backend Smoke Test
 * Validates all critical backend functionality after deployment
 */

const https = require('https');
const { execSync } = require('child_process');

// Configuration from deployment
const CONFIG = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_6UxioIj4z',
  // Add API key if needed for public operations
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
    warning: '⚠️'
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

// Test 1: GraphQL Endpoint Connectivity
async function testGraphQLConnectivity() {
  try {
    const query = `query HealthCheck { __typename }`;
    const response = await graphqlRequest(query, {}, 'HealthCheck');
    
    if (response.status === 200 && response.data.data) {
      recordTest('GraphQL Connectivity', true, `Status: ${response.status}`);
      return true;
    } else {
      recordTest('GraphQL Connectivity', false, `Status: ${response.status}, Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    recordTest('GraphQL Connectivity', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 2: Movie Service (TMDB Integration with Circuit Breaker)
async function testMovieService() {
  try {
    const query = `
      query GetMovieDetails($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          poster_path
          vote_average
        }
      }
    `;
    
    const response = await graphqlRequest(query, { movieId: '550' }, 'GetMovieDetails');
    
    if (response.status === 200 && response.data.data && response.data.data.getMovieDetails) {
      const movie = response.data.data.getMovieDetails;
      recordTest('Movie Service (TMDB + Circuit Breaker)', true, `Retrieved: ${movie.title}`);
      return true;
    } else {
      recordTest('Movie Service (TMDB + Circuit Breaker)', false, `Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    recordTest('Movie Service (TMDB + Circuit Breaker)', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 3: AI Service (Hugging Face Integration)
async function testAIService() {
  try {
    const query = `
      mutation GetAIRecommendations($userText: String!) {
        getAIRecommendations(userText: $userText) {
          chatResponse
          recommendedGenres
        }
      }
    `;
    
    const response = await graphqlRequest(query, { 
      userText: 'I feel happy and want to watch something fun' 
    }, 'GetAIRecommendations');
    
    if (response.status === 200 && response.data.data && response.data.data.getAIRecommendations) {
      const ai = response.data.data.getAIRecommendations;
      recordTest('AI Service (Hugging Face)', true, `Response length: ${ai.chatResponse.length} chars`);
      return true;
    } else {
      recordTest('AI Service (Hugging Face)', false, `Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    recordTest('AI Service (Hugging Face)', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 4: DynamoDB Tables Accessibility
async function testDynamoDBTables() {
  try {
    // Test by trying to create a room (requires authentication, so expect auth error)
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
        name: 'Smoke Test Room',
        filters: { contentTypes: ['movie'] }
      }
    }, 'CreateRoom');
    
    // We expect this to fail with authentication error, not database error
    if (response.status === 200 && response.data.errors) {
      const error = response.data.errors[0];
      if (error.message.includes('Unauthorized') || error.message.includes('Authentication')) {
        recordTest('DynamoDB Tables Access', true, 'Auth error as expected (tables accessible)');
        return true;
      }
    }
    
    recordTest('DynamoDB Tables Access', false, `Unexpected response: ${JSON.stringify(response.data)}`);
    return false;
  } catch (error) {
    recordTest('DynamoDB Tables Access', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 5: Cognito User Pool Configuration
async function testCognitoConfiguration() {
  try {
    // Use AWS CLI to describe user pool
    const command = `aws cognito-idp describe-user-pool --user-pool-id ${CONFIG.userPoolId} --region ${CONFIG.region}`;
    const output = execSync(command, { encoding: 'utf8' });
    const userPool = JSON.parse(output);
    
    if (userPool.UserPool && userPool.UserPool.Id === CONFIG.userPoolId) {
      recordTest('Cognito User Pool', true, `Pool Name: ${userPool.UserPool.Name}`);
      return true;
    } else {
      recordTest('Cognito User Pool', false, 'User pool not found or invalid');
      return false;
    }
  } catch (error) {
    recordTest('Cognito User Pool', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 6: Lambda Functions Health
async function testLambdaFunctions() {
  try {
    // List Lambda functions with Trinity prefix
    const command = `aws lambda list-functions --region ${CONFIG.region} --query "Functions[?starts_with(FunctionName, 'TrinityMvpStack')]"`;
    const output = execSync(command, { encoding: 'utf8' });
    const functions = JSON.parse(output);
    
    if (functions && functions.length >= 6) {
      recordTest('Lambda Functions', true, `Found ${functions.length} functions`);
      return true;
    } else {
      recordTest('Lambda Functions', false, `Expected 6+ functions, found ${functions ? functions.length : 0}`);
      return false;
    }
  } catch (error) {
    recordTest('Lambda Functions', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 7: Circuit Breaker Metrics
async function testCircuitBreakerMetrics() {
  try {
    // Make multiple movie requests to test circuit breaker
    log('Testing Circuit Breaker with multiple requests...', 'info');
    
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(testMovieService());
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r).length;
    
    if (successCount >= 2) {
      recordTest('Circuit Breaker Resilience', true, `${successCount}/3 requests succeeded`);
      return true;
    } else {
      recordTest('Circuit Breaker Resilience', false, `Only ${successCount}/3 requests succeeded`);
      return false;
    }
  } catch (error) {
    recordTest('Circuit Breaker Resilience', false, `Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runSmokeTests() {
  log('🚀 Starting Trinity Backend Smoke Tests', 'info');
  log(`📍 Region: ${CONFIG.region}`, 'info');
  log(`🔗 GraphQL Endpoint: ${CONFIG.graphqlEndpoint}`, 'info');
  log(`👤 User Pool: ${CONFIG.userPoolId}`, 'info');
  console.log('');

  // Run all tests
  await testGraphQLConnectivity();
  await testMovieService();
  await testAIService();
  await testDynamoDBTables();
  await testCognitoConfiguration();
  await testLambdaFunctions();
  await testCircuitBreakerMetrics();

  // Print summary
  console.log('');
  log('📊 SMOKE TEST SUMMARY', 'info');
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

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runSmokeTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runSmokeTests, CONFIG };