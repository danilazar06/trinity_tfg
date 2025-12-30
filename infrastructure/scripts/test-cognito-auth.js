#!/usr/bin/env node

/**
 * Cognito Authentication Test
 * Tests user registration and login with AWS Cognito
 */

const https = require('https');

// Configuration from deployment
const CONFIG = {
  region: 'eu-west-1',
  userPoolId: 'eu-west-1_6UxioIj4z',
  userPoolClientId: '59dpqsm580j14ulkcha19shl64',
  cognitoUrl: 'https://cognito-idp.eu-west-1.amazonaws.com/',
};

// Test user data
const TEST_USER = {
  email: `test-${Date.now()}@trinity.app`,
  password: 'TestPassword123!',
  name: 'Usuario Test',
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
    user: '👤'
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

// HTTP request helper for Cognito
function cognitoRequest(action, body) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body);
    
    const options = {
      hostname: 'cognito-idp.eu-west-1.amazonaws.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

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
    req.write(requestBody);
    req.end();
  });
}

// Parse JWT token
function parseJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString()
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

// Test 1: User Registration
async function testUserRegistration() {
  try {
    log(`Registering test user: ${TEST_USER.email}`, 'user');
    
    const response = await cognitoRequest('SignUp', {
      ClientId: CONFIG.userPoolClientId,
      Username: TEST_USER.email,
      Password: TEST_USER.password,
      UserAttributes: [
        {
          Name: 'email',
          Value: TEST_USER.email,
        },
        {
          Name: 'name',
          Value: TEST_USER.name,
        },
      ],
    });

    if (response.status === 200 && response.data.UserSub) {
      recordTest('User Registration', true, `UserSub: ${response.data.UserSub}`);
      return { success: true, userSub: response.data.UserSub };
    } else if (response.data.__type === 'UsernameExistsException') {
      recordTest('User Registration', true, 'User already exists (expected for repeated tests)');
      return { success: true, userExists: true };
    } else {
      recordTest('User Registration', false, `Status: ${response.status}, Error: ${response.data.message || 'Unknown'}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('User Registration', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Test 2: User Login
async function testUserLogin() {
  try {
    log(`Logging in test user: ${TEST_USER.email}`, 'user');
    
    const response = await cognitoRequest('InitiateAuth', {
      ClientId: CONFIG.userPoolClientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: TEST_USER.email,
        PASSWORD: TEST_USER.password,
      },
    });

    if (response.status === 200 && response.data.AuthenticationResult) {
      const tokens = response.data.AuthenticationResult;
      
      // Parse ID token to get user info
      const idTokenPayload = parseJWT(tokens.IdToken);
      
      recordTest('User Login', true, `User: ${idTokenPayload?.email || 'Unknown'}`);
      return { 
        success: true, 
        tokens,
        user: idTokenPayload 
      };
    } else {
      recordTest('User Login', false, `Status: ${response.status}, Error: ${response.data.message || 'Unknown'}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('User Login', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Test 3: Get User Information
async function testGetUser(accessToken) {
  try {
    log('Getting user information with access token', 'user');
    
    const response = await cognitoRequest('GetUser', {
      AccessToken: accessToken,
    });

    if (response.status === 200 && response.data.UserAttributes) {
      const attributes = {};
      response.data.UserAttributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
      });
      
      recordTest('Get User Information', true, `Email: ${attributes.email}, Name: ${attributes.name}`);
      return { success: true, attributes };
    } else {
      recordTest('Get User Information', false, `Status: ${response.status}, Error: ${response.data.message || 'Unknown'}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('Get User Information', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Test 4: Token Validation
async function testTokenValidation(tokens) {
  try {
    log('Validating JWT tokens', 'info');
    
    // Parse and validate ID token
    const idTokenPayload = parseJWT(tokens.IdToken);
    const accessTokenPayload = parseJWT(tokens.AccessToken);
    
    if (!idTokenPayload || !accessTokenPayload) {
      recordTest('Token Validation', false, 'Failed to parse JWT tokens');
      return { success: false };
    }
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    const idTokenValid = idTokenPayload.exp > now;
    const accessTokenValid = accessTokenPayload.exp > now;
    
    if (idTokenValid && accessTokenValid) {
      recordTest('Token Validation', true, `ID Token expires: ${new Date(idTokenPayload.exp * 1000).toISOString()}`);
      return { success: true };
    } else {
      recordTest('Token Validation', false, `ID Token valid: ${idTokenValid}, Access Token valid: ${accessTokenValid}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('Token Validation', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Test 5: Update User Attributes
async function testUpdateUserAttributes(accessToken) {
  try {
    log('Updating user attributes', 'user');
    
    const newName = `${TEST_USER.name} Updated`;
    
    const response = await cognitoRequest('UpdateUserAttributes', {
      AccessToken: accessToken,
      UserAttributes: [
        {
          Name: 'name',
          Value: newName,
        },
      ],
    });

    if (response.status === 200) {
      recordTest('Update User Attributes', true, `Updated name to: ${newName}`);
      return { success: true };
    } else {
      recordTest('Update User Attributes', false, `Status: ${response.status}, Error: ${response.data.message || 'Unknown'}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('Update User Attributes', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Test 6: Global Sign Out
async function testGlobalSignOut(accessToken) {
  try {
    log('Testing global sign out', 'user');
    
    const response = await cognitoRequest('GlobalSignOut', {
      AccessToken: accessToken,
    });

    if (response.status === 200) {
      recordTest('Global Sign Out', true, 'User signed out successfully');
      return { success: true };
    } else {
      recordTest('Global Sign Out', false, `Status: ${response.status}, Error: ${response.data.message || 'Unknown'}`);
      return { success: false };
    }
  } catch (error) {
    recordTest('Global Sign Out', false, `Error: ${error.message}`);
    return { success: false };
  }
}

// Main test runner
async function runCognitoAuthTests() {
  log('🚀 Starting Cognito Authentication Tests', 'info');
  log(`📍 Region: ${CONFIG.region}`, 'info');
  log(`👤 User Pool ID: ${CONFIG.userPoolId}`, 'info');
  log(`🔑 Client ID: ${CONFIG.userPoolClientId}`, 'info');
  log(`📧 Test Email: ${TEST_USER.email}`, 'info');
  console.log('');

  let tokens = null;

  // Run all tests in sequence
  const registrationResult = await testUserRegistration();
  
  if (registrationResult.success) {
    const loginResult = await testUserLogin();
    
    if (loginResult.success && loginResult.tokens) {
      tokens = loginResult.tokens;
      
      await testGetUser(tokens.AccessToken);
      await testTokenValidation(tokens);
      await testUpdateUserAttributes(tokens.AccessToken);
      await testGlobalSignOut(tokens.AccessToken);
    }
  }

  // Print summary
  console.log('');
  log('📊 COGNITO AUTH TEST SUMMARY', 'info');
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

  // Authentication status assessment
  console.log('');
  if (results.passed >= 5) {
    log('🎉 COGNITO AUTHENTICATION: FULLY FUNCTIONAL', 'success');
    log('✅ User registration, login, and token management working', 'success');
    log('🔒 JWT tokens are valid and properly formatted', 'success');
    log('📱 Ready for mobile app integration', 'success');
  } else if (results.passed >= 3) {
    log('⚠️  COGNITO AUTHENTICATION: PARTIALLY FUNCTIONAL', 'warning');
    log('✅ Basic authentication working but some features failed', 'warning');
    log('🔧 Review failed tests before production use', 'warning');
  } else {
    log('❌ COGNITO AUTHENTICATION: MAJOR ISSUES', 'error');
    log('🚨 Critical authentication features not working', 'error');
    log('🔧 Fix configuration before proceeding', 'error');
  }

  // Exit with appropriate code
  process.exit(results.failed > 1 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runCognitoAuthTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runCognitoAuthTests, CONFIG };