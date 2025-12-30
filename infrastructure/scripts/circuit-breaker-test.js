#!/usr/bin/env node

/**
 * Circuit Breaker Testing Script
 * Tests the Circuit Breaker implementation with various failure scenarios
 */

const https = require('https');

// Configuration
const CONFIG = {
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  apiKey: process.env.APPSYNC_API_KEY || 'da2-fakeApiId123456',
  testDuration: 120000, // 2 minutes
  requestInterval: 2000, // 2 seconds between requests
};

// Test state
const testState = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  circuitOpenDetected: false,
  circuitRecoveryDetected: false,
  startTime: Date.now(),
  responses: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    circuit: '🔧'
  }[type];
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

// GraphQL request helper
function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.graphqlEndpoint);
    
    const requestBody = JSON.stringify({
      query,
      variables,
      operationName: 'TestMovieService'
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.apiKey,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const startTime = Date.now();
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const parsed = JSON.parse(body);
          resolve({ 
            status: res.statusCode, 
            data: parsed, 
            duration,
            headers: res.headers 
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: body, 
            duration,
            headers: res.headers 
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      reject({ error, duration });
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Test scenarios
const TEST_SCENARIOS = {
  // Valid movie ID - should succeed
  validMovie: {
    query: `
      query TestMovieService($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          vote_average
        }
      }
    `,
    variables: { movieId: '550' }, // Fight Club
    expectedSuccess: true
  },
  
  // Invalid movie ID - should fail and trigger circuit breaker
  invalidMovie: {
    query: `
      query TestMovieService($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          vote_average
        }
      }
    `,
    variables: { movieId: 'invalid-movie-id-12345' },
    expectedSuccess: false
  },
  
  // Non-existent movie ID - should fail
  nonExistentMovie: {
    query: `
      query TestMovieService($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          vote_average
        }
      }
    `,
    variables: { movieId: '999999999' },
    expectedSuccess: false
  }
};

// Execute a single test request
async function executeTestRequest(scenario, scenarioName) {
  testState.totalRequests++;
  
  try {
    log(`Request #${testState.totalRequests}: Testing ${scenarioName}`, 'info');
    
    const response = await makeGraphQLRequest(scenario.query, scenario.variables);
    
    // Analyze response
    const isSuccess = response.status === 200 && 
                     response.data.data && 
                     !response.data.errors;
    
    const hasCircuitBreakerError = response.data.errors && 
                                  response.data.errors.some(err => 
                                    err.message.includes('Circuit breaker is OPEN') ||
                                    err.message.includes('circuit') ||
                                    err.message.includes('OPEN')
                                  );
    
    // Record response
    testState.responses.push({
      requestNumber: testState.totalRequests,
      scenario: scenarioName,
      success: isSuccess,
      circuitOpen: hasCircuitBreakerError,
      duration: response.duration,
      status: response.status,
      timestamp: new Date().toISOString()
    });
    
    if (isSuccess) {
      testState.successfulRequests++;
      log(`✅ Success (${response.duration}ms): ${scenarioName}`, 'success');
      
      // Check for circuit recovery
      if (testState.circuitOpenDetected && !testState.circuitRecoveryDetected) {
        testState.circuitRecoveryDetected = true;
        log('🔄 Circuit Breaker RECOVERY detected!', 'circuit');
      }
    } else {
      testState.failedRequests++;
      
      if (hasCircuitBreakerError) {
        if (!testState.circuitOpenDetected) {
          testState.circuitOpenDetected = true;
          log('🚨 Circuit Breaker OPENED detected!', 'circuit');
        }
        log(`⚡ Circuit Open (${response.duration}ms): Fast fail`, 'warning');
      } else {
        log(`❌ Failed (${response.duration}ms): ${scenarioName}`, 'error');
        if (response.data.errors) {
          log(`   Error: ${response.data.errors[0].message}`, 'error');
        }
      }
    }
    
  } catch (error) {
    testState.failedRequests++;
    log(`❌ Request failed: ${error.error ? error.error.message : error}`, 'error');
    
    testState.responses.push({
      requestNumber: testState.totalRequests,
      scenario: scenarioName,
      success: false,
      circuitOpen: false,
      duration: error.duration || 0,
      status: 0,
      timestamp: new Date().toISOString(),
      error: error.error ? error.error.message : error.toString()
    });
  }
}

// Test Phase 1: Trigger Circuit Breaker with failures
async function phaseOne() {
  log('🚀 PHASE 1: Triggering Circuit Breaker with failures', 'info');
  log('Sending requests with invalid movie IDs to trigger failures...', 'info');
  
  // Send 8 requests with invalid movie IDs to trigger circuit breaker
  for (let i = 0; i < 8; i++) {
    await executeTestRequest(TEST_SCENARIOS.invalidMovie, 'InvalidMovie');
    
    // Wait between requests
    if (i < 7) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.requestInterval));
    }
  }
  
  log(`Phase 1 complete. Circuit Open Detected: ${testState.circuitOpenDetected}`, 'info');
}

// Test Phase 2: Verify circuit is open (fast failures)
async function phaseTwo() {
  log('🔧 PHASE 2: Verifying Circuit Breaker is OPEN', 'info');
  log('Testing that valid requests also fail fast when circuit is open...', 'info');
  
  // Try valid requests while circuit is open - should fail fast
  for (let i = 0; i < 3; i++) {
    await executeTestRequest(TEST_SCENARIOS.validMovie, 'ValidMovieWhileOpen');
    
    if (i < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Shorter interval
    }
  }
}

// Test Phase 3: Wait for recovery and test
async function phaseThree() {
  log('⏳ PHASE 3: Waiting for Circuit Breaker recovery', 'info');
  log('Waiting 65 seconds for circuit breaker timeout...', 'info');
  
  // Wait for circuit breaker timeout (60 seconds + buffer)
  const waitTime = 65000;
  const startWait = Date.now();
  
  while (Date.now() - startWait < waitTime) {
    const remaining = Math.ceil((waitTime - (Date.now() - startWait)) / 1000);
    process.stdout.write(`\r⏱️  Waiting... ${remaining}s remaining`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🔄 Testing circuit breaker recovery...');
  
  // Test recovery with valid requests
  for (let i = 0; i < 5; i++) {
    await executeTestRequest(TEST_SCENARIOS.validMovie, 'RecoveryTest');
    
    if (i < 4) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Generate test report
function generateReport() {
  const duration = Date.now() - testState.startTime;
  const successRate = ((testState.successfulRequests / testState.totalRequests) * 100).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  log('📊 CIRCUIT BREAKER TEST REPORT', 'info');
  console.log('='.repeat(60));
  
  console.log(`📈 Total Requests: ${testState.totalRequests}`);
  console.log(`✅ Successful: ${testState.successfulRequests}`);
  console.log(`❌ Failed: ${testState.failedRequests}`);
  console.log(`📊 Success Rate: ${successRate}%`);
  console.log(`⏱️  Total Duration: ${Math.round(duration / 1000)}s`);
  console.log(`🔧 Circuit Opened: ${testState.circuitOpenDetected ? 'YES' : 'NO'}`);
  console.log(`🔄 Circuit Recovered: ${testState.circuitRecoveryDetected ? 'YES' : 'NO'}`);
  
  // Response time analysis
  const durations = testState.responses.map(r => r.duration).filter(d => d > 0);
  if (durations.length > 0) {
    const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    console.log(`⚡ Avg Response Time: ${avgDuration}ms`);
    console.log(`⚡ Max Response Time: ${maxDuration}ms`);
    console.log(`⚡ Min Response Time: ${minDuration}ms`);
  }
  
  // Circuit breaker effectiveness
  const circuitOpenResponses = testState.responses.filter(r => r.circuitOpen);
  if (circuitOpenResponses.length > 0) {
    const avgCircuitDuration = Math.round(
      circuitOpenResponses.reduce((a, b) => a + b.duration, 0) / circuitOpenResponses.length
    );
    console.log(`⚡ Avg Circuit Open Response: ${avgCircuitDuration}ms (should be < 50ms)`);
  }
  
  // Detailed timeline
  console.log('\n📋 DETAILED TIMELINE:');
  testState.responses.forEach(response => {
    const status = response.success ? '✅' : (response.circuitOpen ? '⚡' : '❌');
    const time = new Date(response.timestamp).toLocaleTimeString();
    console.log(`${status} #${response.requestNumber} [${time}] ${response.scenario} (${response.duration}ms)`);
  });
  
  // Test validation
  console.log('\n🎯 TEST VALIDATION:');
  
  const validations = [
    {
      name: 'Circuit Breaker Opened',
      passed: testState.circuitOpenDetected,
      description: 'Circuit breaker should open after multiple failures'
    },
    {
      name: 'Fast Failure When Open',
      passed: circuitOpenResponses.length > 0 && 
              circuitOpenResponses.every(r => r.duration < 100),
      description: 'Requests should fail fast (< 100ms) when circuit is open'
    },
    {
      name: 'Circuit Recovery',
      passed: testState.circuitRecoveryDetected,
      description: 'Circuit breaker should recover after timeout'
    },
    {
      name: 'Overall Resilience',
      passed: testState.totalRequests > 15 && testState.successfulRequests > 0,
      description: 'System should handle multiple failure scenarios'
    }
  ];
  
  validations.forEach(validation => {
    const status = validation.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${validation.name}: ${validation.description}`);
  });
  
  const allPassed = validations.every(v => v.passed);
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    log('🎉 ALL CIRCUIT BREAKER TESTS PASSED!', 'success');
  } else {
    log('⚠️  SOME CIRCUIT BREAKER TESTS FAILED', 'warning');
  }
  console.log('='.repeat(60));
  
  return allPassed;
}

// Main test execution
async function runCircuitBreakerTests() {
  log('🚀 Starting Circuit Breaker Tests', 'info');
  log(`🔗 GraphQL Endpoint: ${CONFIG.graphqlEndpoint}`, 'info');
  console.log('');
  
  try {
    // Execute test phases
    await phaseOne();
    console.log('');
    
    await phaseTwo();
    console.log('');
    
    await phaseThree();
    
    // Generate report
    const allPassed = generateReport();
    
    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCircuitBreakerTests();
}

module.exports = { runCircuitBreakerTests, CONFIG, testState };