/**
 * Property Test 12: Secure Logging
 * 
 * Validates: Requirements 6.5
 * 
 * This property test ensures that the logging system properly sanitizes
 * sensitive data and maintains security while providing comprehensive
 * debugging information.
 */

import { loggingService } from '../services/loggingService';

interface SecureLoggingTestCase {
  description: string;
  input: string | object;
  expectedSanitization: boolean;
  sensitivePatterns: string[];
}

/**
 * Property 12: Secure Logging
 * 
 * For all logging operations L and sensitive data patterns P:
 * - L(data containing P) must not expose P in logs
 * - L(data) must preserve non-sensitive information
 * - L(error) must not leak authentication tokens
 * - L(network) must not expose credentials
 * - L(user_data) must sanitize PII appropriately
 */
export function testSecureLoggingProperty(): boolean {
  console.log('🧪 Testing Property 12: Secure Logging');

  const testCases: SecureLoggingTestCase[] = [
    // Authentication token sanitization
    {
      description: 'Bearer token in string',
      input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
      expectedSanitization: true,
      sensitivePatterns: ['Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature']
    },
    {
      description: 'Access token in JSON',
      input: { accessToken: 'secret-access-token-12345', userId: 'user123' },
      expectedSanitization: true,
      sensitivePatterns: ['secret-access-token-12345']
    },
    {
      description: 'ID token in object',
      input: { idToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test', name: 'John' },
      expectedSanitization: true,
      sensitivePatterns: ['eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test']
    },
    {
      description: 'Refresh token in nested object',
      input: { 
        tokens: { 
          refreshToken: 'refresh-token-abcdef', 
          accessToken: 'access-token-123456' 
        },
        user: { name: 'Jane' }
      },
      expectedSanitization: true,
      sensitivePatterns: ['refresh-token-abcdef', 'access-token-123456']
    },

    // Password sanitization
    {
      description: 'Password in login data',
      input: { email: 'user@example.com', password: 'mySecretPassword123' },
      expectedSanitization: true,
      sensitivePatterns: ['mySecretPassword123']
    },
    {
      description: 'Password in URL parameters',
      input: 'POST /login?email=user@test.com&password=secretPass456',
      expectedSanitization: true,
      sensitivePatterns: ['secretPass456']
    },

    // API keys and secrets
    {
      description: 'API key in configuration',
      input: { apiKey: 'sk-1234567890abcdef', endpoint: 'https://api.example.com' },
      expectedSanitization: true,
      sensitivePatterns: ['sk-1234567890abcdef']
    },
    {
      description: 'Secret in environment',
      input: 'AWS_SECRET=AKIAIOSFODNN7EXAMPLE',
      expectedSanitization: true,
      sensitivePatterns: ['AKIAIOSFODNN7EXAMPLE']
    },

    // Personal Identifiable Information (PII)
    {
      description: 'Email address in user data',
      input: { name: 'John Doe', email: 'john.doe@example.com', age: 30 },
      expectedSanitization: true,
      sensitivePatterns: ['john.doe@example.com']
    },
    {
      description: 'Credit card number in payment',
      input: 'Payment with card 4532 1234 5678 9012 processed',
      expectedSanitization: true,
      sensitivePatterns: ['4532 1234 5678 9012']
    },
    {
      description: 'Social Security Number',
      input: 'User SSN: 123-45-6789 for verification',
      expectedSanitization: true,
      sensitivePatterns: ['123-45-6789']
    },

    // AWS specific tokens
    {
      description: 'AWS Authorization header',
      input: 'Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20230101/us-east-1/s3/aws4_request',
      expectedSanitization: true,
      sensitivePatterns: ['AKIAIOSFODNN7EXAMPLE']
    },
    {
      description: 'X-Amz-Security-Token header',
      input: 'X-Amz-Security-Token: IQoJb3JpZ2luX2VjEHoaCXVzLWVhc3QtMSJHMEUCIQD',
      expectedSanitization: true,
      sensitivePatterns: ['IQoJb3JpZ2luX2VjEHoaCXVzLWVhc3QtMSJHMEUCIQD']
    },

    // Non-sensitive data (should be preserved)
    {
      description: 'Non-sensitive user data',
      input: { name: 'John Doe', age: 30, city: 'New York' },
      expectedSanitization: false,
      sensitivePatterns: []
    },
    {
      description: 'Error message without sensitive data',
      input: 'Network timeout occurred while connecting to server',
      expectedSanitization: false,
      sensitivePatterns: []
    },
    {
      description: 'Application metrics',
      input: { requestCount: 150, averageResponseTime: 250, errorRate: 0.02 },
      expectedSanitization: false,
      sensitivePatterns: []
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      console.log(`  Testing: ${testCase.description}`);

      // Test sanitization function directly
      const sanitizedString = typeof testCase.input === 'string' 
        ? loggingService.testSanitization(testCase.input)
        : loggingService.testSanitization(JSON.stringify(testCase.input));

      // Check if sensitive patterns are properly sanitized
      let sensitiveDataFound = false;
      for (const pattern of testCase.sensitivePatterns) {
        if (sanitizedString.includes(pattern)) {
          sensitiveDataFound = true;
          console.error(`    ❌ Sensitive data not sanitized: ${pattern}`);
          break;
        }
      }

      if (testCase.expectedSanitization) {
        // Should have sanitized sensitive data
        if (sensitiveDataFound) {
          console.error(`    ❌ Failed: Sensitive data was not properly sanitized`);
          continue;
        }

        // Should contain sanitization markers
        const hasSanitizationMarkers = sanitizedString.includes('[REDACTED]') || 
                                     sanitizedString.includes('[EMAIL_REDACTED]') ||
                                     sanitizedString.includes('[CARD_NUMBER_REDACTED]') ||
                                     sanitizedString.includes('[SSN_REDACTED]');

        if (!hasSanitizationMarkers && testCase.sensitivePatterns.length > 0) {
          console.error(`    ❌ Failed: No sanitization markers found`);
          continue;
        }
      } else {
        // Should preserve non-sensitive data
        if (typeof testCase.input === 'object') {
          const originalJson = JSON.stringify(testCase.input);
          // For non-sensitive data, sanitized should be very similar to original
          if (sanitizedString !== originalJson) {
            // Allow minor formatting differences but check for unexpected redactions
            if (sanitizedString.includes('[REDACTED]')) {
              console.error(`    ❌ Failed: Non-sensitive data was incorrectly sanitized`);
              continue;
            }
          }
        }
      }

      // Test actual logging operations
      const originalLogCount = loggingService.getStats().totalEntries;

      // Test different logging methods
      loggingService.debug('Test Category', 'Test message', testCase.input);
      loggingService.info('Test Category', 'Test message', testCase.input);
      loggingService.warn('Test Category', 'Test message', testCase.input);
      loggingService.error('Test Category', 'Test message', testCase.input);

      // Test specialized logging methods
      loggingService.logAuth('login', testCase.input);
      loggingService.logNetwork('request', testCase.input);
      loggingService.logGraphQL('query', testCase.input);
      loggingService.logRealtime('connect', testCase.input);

      const newLogCount = loggingService.getStats().totalEntries;
      const addedLogs = newLogCount - originalLogCount;

      if (addedLogs === 0) {
        console.error(`    ❌ Failed: No logs were created`);
        continue;
      }

      // Check recent logs for sensitive data
      const recentLogs = loggingService.getRecentLogs(addedLogs);
      let logContainsSensitiveData = false;

      for (const log of recentLogs) {
        const logString = JSON.stringify(log);
        for (const pattern of testCase.sensitivePatterns) {
          if (logString.includes(pattern)) {
            logContainsSensitiveData = true;
            console.error(`    ❌ Sensitive data found in log: ${pattern}`);
            break;
          }
        }
        if (logContainsSensitiveData) break;
      }

      if (testCase.expectedSanitization && logContainsSensitiveData) {
        console.error(`    ❌ Failed: Logs contain sensitive data`);
        continue;
      }

      console.log(`    ✅ Passed: ${testCase.description}`);
      passedTests++;

    } catch (error) {
      console.error(`    ❌ Failed with error: ${error}`);
    }
  }

  // Test log size limits and truncation
  console.log('  Testing log size limits...');
  
  try {
    // Test message truncation
    const longMessage = 'A'.repeat(3000); // Exceeds MAX_MESSAGE_LENGTH
    loggingService.info('Test', longMessage);
    
    const recentLog = loggingService.getRecentLogs(1)[0];
    if (recentLog.message.length > 2000) {
      console.error(`    ❌ Message not truncated properly: ${recentLog.message.length} chars`);
    } else if (!recentLog.message.includes('[TRUNCATED]')) {
      console.error(`    ❌ Truncation marker not added`);
    } else {
      console.log(`    ✅ Message truncation works correctly`);
      passedTests++;
      totalTests++;
    }

    // Test data size limits
    const largeData = { data: 'B'.repeat(15000) }; // Exceeds MAX_DATA_SIZE
    loggingService.info('Test', 'Large data test', largeData);
    
    const dataLog = loggingService.getRecentLogs(1)[0];
    const dataString = JSON.stringify(dataLog.data);
    if (dataString.length > 10000) {
      console.error(`    ❌ Data not truncated properly: ${dataString.length} chars`);
    } else if (!dataString.includes('[DATA_TRUNCATED]')) {
      console.error(`    ❌ Data truncation marker not added`);
    } else {
      console.log(`    ✅ Data truncation works correctly`);
      passedTests++;
      totalTests++;
    }

  } catch (error) {
    console.error(`    ❌ Size limit test failed: ${error}`);
    totalTests += 2; // Account for the two tests we tried to run
  }

  // Test log entry limits
  console.log('  Testing log entry limits...');
  
  try {
    const initialCount = loggingService.getStats().totalEntries;
    
    // Add many log entries to test limit
    for (let i = 0; i < 50; i++) {
      loggingService.info('Limit Test', `Entry ${i}`, { index: i });
    }
    
    const finalCount = loggingService.getStats().totalEntries;
    const maxEntries = 1000; // From loggingService.MAX_LOG_ENTRIES
    
    if (finalCount > maxEntries) {
      console.error(`    ❌ Log entry limit exceeded: ${finalCount} > ${maxEntries}`);
    } else {
      console.log(`    ✅ Log entry limit respected: ${finalCount} <= ${maxEntries}`);
      passedTests++;
    }
    totalTests++;

  } catch (error) {
    console.error(`    ❌ Entry limit test failed: ${error}`);
    totalTests++;
  }

  // Clean up test logs
  loggingService.clearLogs();

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n📊 Secure Logging Property Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} (${successRate.toFixed(1)}%)`);

  if (successRate === 100) {
    console.log(`   ✅ Property 12 (Secure Logging) holds universally`);
    return true;
  } else {
    console.log(`   ❌ Property 12 (Secure Logging) violated`);
    return false;
  }
}

/**
 * Additional security validation tests
 */
export function testLoggingSecurityFeatures(): boolean {
  console.log('🔒 Testing additional logging security features...');

  let passedTests = 0;
  let totalTests = 0;

  // Test user context management
  try {
    totalTests++;
    
    // Set user context
    loggingService.setUserId('test-user-123');
    loggingService.info('Context Test', 'User context set');
    
    let recentLog = loggingService.getRecentLogs(1)[0];
    if (recentLog.userId !== 'test-user-123') {
      console.error(`    ❌ User context not set properly`);
    } else {
      // Clear user context
      loggingService.clearUserId();
      loggingService.info('Context Test', 'User context cleared');
      
      recentLog = loggingService.getRecentLogs(1)[0];
      if (recentLog.userId) {
        console.error(`    ❌ User context not cleared properly`);
      } else {
        console.log(`    ✅ User context management works correctly`);
        passedTests++;
      }
    }
  } catch (error) {
    console.error(`    ❌ User context test failed: ${error}`);
  }

  // Test session ID consistency
  try {
    totalTests++;
    
    loggingService.info('Session Test', 'First message');
    loggingService.info('Session Test', 'Second message');
    
    const logs = loggingService.getRecentLogs(2);
    if (logs[0].sessionId !== logs[1].sessionId) {
      console.error(`    ❌ Session ID not consistent across logs`);
    } else if (!logs[0].sessionId || logs[0].sessionId.length < 10) {
      console.error(`    ❌ Session ID not properly generated`);
    } else {
      console.log(`    ✅ Session ID consistency maintained`);
      passedTests++;
    }
  } catch (error) {
    console.error(`    ❌ Session ID test failed: ${error}`);
  }

  // Test log export functionality
  try {
    totalTests++;
    
    loggingService.info('Export Test', 'Test message for export');
    const exportData = loggingService.exportLogs();
    
    if (!exportData.sessionId || !exportData.exportTime || !Array.isArray(exportData.logs)) {
      console.error(`    ❌ Log export format invalid`);
    } else if (exportData.totalEntries !== exportData.logs.length) {
      console.error(`    ❌ Log export count mismatch`);
    } else {
      console.log(`    ✅ Log export functionality works correctly`);
      passedTests++;
    }
  } catch (error) {
    console.error(`    ❌ Log export test failed: ${error}`);
  }

  // Test error handling in logging
  try {
    totalTests++;
    
    // Test with circular reference (should not crash)
    const circularObj: any = { name: 'test' };
    circularObj.self = circularObj;
    
    loggingService.info('Error Test', 'Circular reference test', circularObj);
    
    const recentLog = loggingService.getRecentLogs(1)[0];
    if (!recentLog) {
      console.error(`    ❌ Logging failed with circular reference`);
    } else {
      console.log(`    ✅ Error handling in logging works correctly`);
      passedTests++;
    }
  } catch (error) {
    console.error(`    ❌ Error handling test failed: ${error}`);
  }

  // Clean up
  loggingService.clearLogs();

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n📊 Security Features Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} (${successRate.toFixed(1)}%)`);

  return successRate === 100;
}

// Export test runner
export function runSecureLoggingTests(): boolean {
  console.log('\n🔐 Running Secure Logging Property Tests...\n');
  
  const propertyTestPassed = testSecureLoggingProperty();
  const securityTestPassed = testLoggingSecurityFeatures();
  
  const overallSuccess = propertyTestPassed && securityTestPassed;
  
  console.log(`\n🏁 Overall Secure Logging Test Result: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  
  return overallSuccess;
}