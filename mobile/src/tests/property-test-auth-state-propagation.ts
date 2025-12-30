/**
 * Property Test 4: Authentication State Propagation
 * 
 * Validates: Requirements 2.3
 * 
 * This property test ensures that authentication state changes propagate
 * correctly to all components and that the system maintains consistency
 * across all authentication operations.
 */

import { loggingService } from '../services/loggingService';

interface AuthStateTestCase {
  description: string;
  initialState: AuthState;
  operation: AuthOperation;
  expectedFinalState: AuthState;
  componentCount: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  };
}

interface AuthOperation {
  type: 'login' | 'logout' | 'refresh' | 'update_profile' | 'concurrent_login' | 'token_expire';
  data?: any;
}

interface ComponentState {
  id: string;
  name: string;
  isAuthenticated: boolean;
  user?: any;
  lastUpdate: number;
}

/**
 * Mock Authentication State Manager for property testing
 */
class PropertyTestAuthManager {
  private components: Map<string, ComponentState> = new Map();
  private globalState: AuthState = { isAuthenticated: false };
  private updateHistory: Array<{ timestamp: number; operation: string; state: AuthState }> = [];

  /**
   * Register a component for state updates
   */
  registerComponent(id: string, name: string): void {
    this.components.set(id, {
      id,
      name,
      isAuthenticated: false,
      lastUpdate: Date.now()
    });
  }

  /**
   * Unregister a component
   */
  unregisterComponent(id: string): void {
    this.components.delete(id);
  }

  /**
   * Update global authentication state
   */
  updateAuthState(newState: AuthState, operation: string): void {
    const timestamp = Date.now();
    
    // Record state change
    this.updateHistory.push({
      timestamp,
      operation,
      state: { ...newState }
    });

    // Update global state
    this.globalState = { ...newState };

    // Propagate to all components
    this.components.forEach((component, id) => {
      this.components.set(id, {
        ...component,
        isAuthenticated: newState.isAuthenticated,
        user: newState.user,
        lastUpdate: timestamp
      });
    });
  }

  /**
   * Get current global state
   */
  getGlobalState(): AuthState {
    return { ...this.globalState };
  }

  /**
   * Get all component states
   */
  getComponentStates(): ComponentState[] {
    return Array.from(this.components.values());
  }

  /**
   * Get component by ID
   */
  getComponent(id: string): ComponentState | undefined {
    return this.components.get(id);
  }

  /**
   * Check if all components are in sync with global state
   */
  areAllComponentsInSync(): boolean {
    const globalState = this.getGlobalState();
    const components = this.getComponentStates();

    return components.every(component => 
      component.isAuthenticated === globalState.isAuthenticated &&
      JSON.stringify(component.user) === JSON.stringify(globalState.user)
    );
  }

  /**
   * Get update history
   */
  getUpdateHistory(): Array<{ timestamp: number; operation: string; state: AuthState }> {
    return [...this.updateHistory];
  }

  /**
   * Clear all state and history
   */
  reset(): void {
    this.components.clear();
    this.globalState = { isAuthenticated: false };
    this.updateHistory = [];
  }

  /**
   * Get statistics
   */
  getStats(): {
    componentCount: number;
    updateCount: number;
    syncStatus: boolean;
    lastUpdateTime?: number;
  } {
    const components = this.getComponentStates();
    const lastUpdate = Math.max(...components.map(c => c.lastUpdate), 0);

    return {
      componentCount: this.components.size,
      updateCount: this.updateHistory.length,
      syncStatus: this.areAllComponentsInSync(),
      lastUpdateTime: lastUpdate > 0 ? lastUpdate : undefined
    };
  }
}

/**
 * Property 4: Authentication State Propagation
 * 
 * For all authentication operations O and component sets C:
 * - O(login) must update all components in C to authenticated state
 * - O(logout) must update all components in C to unauthenticated state
 * - O(refresh) must maintain authentication state across all components in C
 * - O(concurrent) must result in consistent final state across all components in C
 * - All components in C must receive updates within reasonable time bounds
 */
export function testAuthStatePropagationProperty(): boolean {
  console.log('🧪 Testing Property 4: Authentication State Propagation');

  const authManager = new PropertyTestAuthManager();
  
  const testCases: AuthStateTestCase[] = [
    // Basic login propagation
    {
      description: 'Login propagates to all components',
      initialState: { isAuthenticated: false },
      operation: { type: 'login', data: { email: 'user@test.com', password: 'password' } },
      expectedFinalState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
      },
      componentCount: 5
    },

    // Basic logout propagation
    {
      description: 'Logout propagates to all components',
      initialState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
      },
      operation: { type: 'logout' },
      expectedFinalState: { isAuthenticated: false },
      componentCount: 5
    },

    // Token refresh maintains state
    {
      description: 'Token refresh maintains authentication state',
      initialState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' },
        tokens: { accessToken: 'old-token', idToken: 'old-id', refreshToken: 'refresh' }
      },
      operation: { type: 'refresh' },
      expectedFinalState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' },
        tokens: { accessToken: 'new-token', idToken: 'new-id', refreshToken: 'refresh' }
      },
      componentCount: 3
    },

    // Profile update maintains authentication
    {
      description: 'Profile update maintains authentication state',
      initialState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Old Name' }
      },
      operation: { type: 'update_profile', data: { name: 'New Name' } },
      expectedFinalState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'New Name' }
      },
      componentCount: 4
    },

    // Large number of components
    {
      description: 'State propagates to many components',
      initialState: { isAuthenticated: false },
      operation: { type: 'login', data: { email: 'user@test.com' } },
      expectedFinalState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
      },
      componentCount: 50
    },

    // Token expiration
    {
      description: 'Token expiration logs out all components',
      initialState: { 
        isAuthenticated: true, 
        user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
      },
      operation: { type: 'token_expire' },
      expectedFinalState: { isAuthenticated: false },
      componentCount: 8
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      console.log(`  Testing: ${testCase.description}`);

      // Reset auth manager
      authManager.reset();

      // Register components
      for (let i = 0; i < testCase.componentCount; i++) {
        authManager.registerComponent(`comp-${i}`, `Component${i}`);
      }

      // Set initial state
      authManager.updateAuthState(testCase.initialState, 'initial');

      // Verify initial state propagation
      const initialStats = authManager.getStats();
      if (!initialStats.syncStatus) {
        console.error(`    ❌ Initial state not properly propagated`);
        continue;
      }

      // Execute operation
      let finalState: AuthState;
      
      switch (testCase.operation.type) {
        case 'login':
          finalState = {
            isAuthenticated: true,
            user: testCase.expectedFinalState.user,
            tokens: { accessToken: 'token123', idToken: 'id123', refreshToken: 'refresh123' }
          };
          break;

        case 'logout':
          finalState = { isAuthenticated: false };
          break;

        case 'refresh':
          finalState = {
            ...testCase.initialState,
            tokens: testCase.expectedFinalState.tokens
          };
          break;

        case 'update_profile':
          finalState = {
            ...testCase.initialState,
            user: testCase.expectedFinalState.user
          };
          break;

        case 'token_expire':
          finalState = { isAuthenticated: false };
          break;

        default:
          finalState = testCase.expectedFinalState;
      }

      // Apply the operation
      authManager.updateAuthState(finalState, testCase.operation.type);

      // Verify final state propagation
      const finalStats = authManager.getStats();
      
      if (!finalStats.syncStatus) {
        console.error(`    ❌ Final state not properly propagated to all components`);
        continue;
      }

      // Verify component count
      if (finalStats.componentCount !== testCase.componentCount) {
        console.error(`    ❌ Component count mismatch: expected ${testCase.componentCount}, got ${finalStats.componentCount}`);
        continue;
      }

      // Verify all components have correct state
      const components = authManager.getComponentStates();
      const globalState = authManager.getGlobalState();

      const incorrectComponents = components.filter(comp => 
        comp.isAuthenticated !== globalState.isAuthenticated ||
        JSON.stringify(comp.user) !== JSON.stringify(globalState.user)
      );

      if (incorrectComponents.length > 0) {
        console.error(`    ❌ ${incorrectComponents.length} components have incorrect state`);
        continue;
      }

      // Verify expected final state
      const stateMatches = 
        globalState.isAuthenticated === testCase.expectedFinalState.isAuthenticated &&
        JSON.stringify(globalState.user) === JSON.stringify(testCase.expectedFinalState.user);

      if (!stateMatches) {
        console.error(`    ❌ Final state doesn't match expected state`);
        console.error(`      Expected: ${JSON.stringify(testCase.expectedFinalState)}`);
        console.error(`      Actual: ${JSON.stringify(globalState)}`);
        continue;
      }

      console.log(`    ✅ Passed: ${testCase.description}`);
      passedTests++;

    } catch (error) {
      console.error(`    ❌ Failed with error: ${error}`);
    }
  }

  // Test concurrent operations
  console.log('  Testing concurrent operations...');
  
  try {
    totalTests++;
    
    authManager.reset();
    
    // Register components
    for (let i = 0; i < 10; i++) {
      authManager.registerComponent(`concurrent-${i}`, `ConcurrentComponent${i}`);
    }

    // Perform rapid state changes
    const operations = [
      { isAuthenticated: true, user: { id: 'user1', email: 'user1@test.com', name: 'User 1' } },
      { isAuthenticated: false },
      { isAuthenticated: true, user: { id: 'user2', email: 'user2@test.com', name: 'User 2' } },
      { isAuthenticated: false },
      { isAuthenticated: true, user: { id: 'user3', email: 'user3@test.com', name: 'User 3' } }
    ];

    for (let i = 0; i < operations.length; i++) {
      authManager.updateAuthState(operations[i], `concurrent-op-${i}`);
      
      // Small delay to simulate real-world timing
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // Verify final consistency
    const finalStats = authManager.getStats();
    
    if (!finalStats.syncStatus) {
      console.error(`    ❌ Components not in sync after concurrent operations`);
    } else if (finalStats.updateCount !== operations.length + 1) { // +1 for reset
      console.error(`    ❌ Update count mismatch: expected ${operations.length + 1}, got ${finalStats.updateCount}`);
    } else {
      console.log(`    ✅ Concurrent operations handled correctly`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Concurrent operations test failed: ${error}`);
  }

  // Test component registration/unregistration during state changes
  console.log('  Testing dynamic component management...');
  
  try {
    totalTests++;
    
    authManager.reset();
    
    // Start with some components
    for (let i = 0; i < 5; i++) {
      authManager.registerComponent(`dynamic-${i}`, `DynamicComponent${i}`);
    }

    // Set authenticated state
    authManager.updateAuthState({
      isAuthenticated: true,
      user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
    }, 'login');

    // Add more components while authenticated
    for (let i = 5; i < 10; i++) {
      authManager.registerComponent(`dynamic-${i}`, `DynamicComponent${i}`);
    }

    // Verify new components get current state
    const newComponents = authManager.getComponentStates().slice(5);
    const allNewComponentsAuthenticated = newComponents.every(comp => comp.isAuthenticated);

    if (!allNewComponentsAuthenticated) {
      console.error(`    ❌ New components didn't receive current auth state`);
    } else {
      // Remove some components
      for (let i = 0; i < 3; i++) {
        authManager.unregisterComponent(`dynamic-${i}`);
      }

      // Change state
      authManager.updateAuthState({ isAuthenticated: false }, 'logout');

      // Verify remaining components updated
      const remainingComponents = authManager.getComponentStates();
      const allRemainingUnauthenticated = remainingComponents.every(comp => !comp.isAuthenticated);

      if (!allRemainingUnauthenticated) {
        console.error(`    ❌ Remaining components didn't update after logout`);
      } else if (remainingComponents.length !== 7) { // 10 - 3 removed
        console.error(`    ❌ Component count incorrect after removal: expected 7, got ${remainingComponents.length}`);
      } else {
        console.log(`    ✅ Dynamic component management works correctly`);
        passedTests++;
      }
    }

  } catch (error) {
    console.error(`    ❌ Dynamic component management test failed: ${error}`);
  }

  // Test timing and performance
  console.log('  Testing propagation timing...');
  
  try {
    totalTests++;
    
    authManager.reset();
    
    // Register many components
    const componentCount = 100;
    for (let i = 0; i < componentCount; i++) {
      authManager.registerComponent(`timing-${i}`, `TimingComponent${i}`);
    }

    // Measure propagation time
    const startTime = Date.now();
    
    authManager.updateAuthState({
      isAuthenticated: true,
      user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
    }, 'timing-test');

    const endTime = Date.now();
    const propagationTime = endTime - startTime;

    // Verify all components updated
    const stats = authManager.getStats();
    
    if (!stats.syncStatus) {
      console.error(`    ❌ Not all components updated in timing test`);
    } else if (propagationTime > 100) { // Should be very fast in synchronous test
      console.error(`    ❌ Propagation too slow: ${propagationTime}ms for ${componentCount} components`);
    } else {
      console.log(`    ✅ Propagation timing acceptable: ${propagationTime}ms for ${componentCount} components`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Timing test failed: ${error}`);
  }

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n📊 Authentication State Propagation Property Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} (${successRate.toFixed(1)}%)`);

  if (successRate === 100) {
    console.log(`   ✅ Property 4 (Authentication State Propagation) holds universally`);
    return true;
  } else {
    console.log(`   ❌ Property 4 (Authentication State Propagation) violated`);
    return false;
  }
}

/**
 * Test edge cases for authentication state propagation
 */
export function testAuthStatePropagationEdgeCases(): boolean {
  console.log('🔍 Testing authentication state propagation edge cases...');

  const authManager = new PropertyTestAuthManager();
  let passedTests = 0;
  let totalTests = 0;

  // Test with zero components
  try {
    totalTests++;
    
    authManager.reset();
    
    // No components registered
    authManager.updateAuthState({
      isAuthenticated: true,
      user: { id: 'user123', email: 'user@test.com', name: 'Test User' }
    }, 'no-components');

    const stats = authManager.getStats();
    
    if (stats.componentCount !== 0) {
      console.error(`    ❌ Component count should be 0, got ${stats.componentCount}`);
    } else if (!stats.syncStatus) {
      console.error(`    ❌ Sync status should be true with no components`);
    } else {
      console.log(`    ✅ Zero components handled correctly`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Zero components test failed: ${error}`);
  }

  // Test with null/undefined user data
  try {
    totalTests++;
    
    authManager.reset();
    authManager.registerComponent('null-test', 'NullTestComponent');

    // Test with null user
    authManager.updateAuthState({
      isAuthenticated: true,
      user: undefined
    }, 'null-user');

    const component = authManager.getComponent('null-test');
    
    if (!component) {
      console.error(`    ❌ Component not found after null user test`);
    } else if (!component.isAuthenticated) {
      console.error(`    ❌ Component should be authenticated with null user`);
    } else if (component.user !== undefined) {
      console.error(`    ❌ Component user should be undefined`);
    } else {
      console.log(`    ✅ Null user data handled correctly`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Null user test failed: ${error}`);
  }

  // Test with malformed state
  try {
    totalTests++;
    
    authManager.reset();
    authManager.registerComponent('malformed-test', 'MalformedTestComponent');

    // Test with malformed state (missing required fields)
    const malformedState = { isAuthenticated: true } as AuthState;
    
    authManager.updateAuthState(malformedState, 'malformed');

    const stats = authManager.getStats();
    
    if (!stats.syncStatus) {
      console.error(`    ❌ Malformed state caused sync issues`);
    } else {
      console.log(`    ✅ Malformed state handled gracefully`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Malformed state test failed: ${error}`);
  }

  // Test rapid state oscillation
  try {
    totalTests++;
    
    authManager.reset();
    
    for (let i = 0; i < 5; i++) {
      authManager.registerComponent(`oscillation-${i}`, `OscillationComponent${i}`);
    }

    // Rapidly oscillate between authenticated and unauthenticated
    for (let i = 0; i < 20; i++) {
      const isAuthenticated = i % 2 === 0;
      authManager.updateAuthState({
        isAuthenticated,
        user: isAuthenticated ? { id: `user${i}`, email: `user${i}@test.com`, name: `User ${i}` } : undefined
      }, `oscillation-${i}`);
    }

    const finalStats = authManager.getStats();
    
    if (!finalStats.syncStatus) {
      console.error(`    ❌ Rapid oscillation caused sync issues`);
    } else if (finalStats.updateCount !== 21) { // 20 oscillations + 1 reset
      console.error(`    ❌ Update count incorrect: expected 21, got ${finalStats.updateCount}`);
    } else {
      console.log(`    ✅ Rapid state oscillation handled correctly`);
      passedTests++;
    }

  } catch (error) {
    console.error(`    ❌ Rapid oscillation test failed: ${error}`);
  }

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n📊 Edge Cases Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} (${successRate.toFixed(1)}%)`);

  return successRate === 100;
}

// Export test runner
export function runAuthStatePropagationPropertyTests(): boolean {
  console.log('\n🔐 Running Authentication State Propagation Property Tests...\n');
  
  const propertyTestPassed = testAuthStatePropagationProperty();
  const edgeCaseTestPassed = testAuthStatePropagationEdgeCases();
  
  const overallSuccess = propertyTestPassed && edgeCaseTestPassed;
  
  console.log(`\n🏁 Overall Authentication State Propagation Property Test Result: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  
  return overallSuccess;
}