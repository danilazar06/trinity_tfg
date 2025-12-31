/**
 * Master Test Runner for Google Sign-In
 * Executes all Google Sign-In related tests and generates comprehensive report
 */

import { spawn } from 'cross-spawn';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  testSuite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: number;
  errors: string[];
}

interface TestReport {
  timestamp: string;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDuration: number;
  overallCoverage: number;
  testResults: TestResult[];
  requirements: RequirementCoverage[];
  summary: string;
}

interface RequirementCoverage {
  id: string;
  description: string;
  covered: boolean;
  testFiles: string[];
}

class GoogleSignInTestRunner {
  private testSuites = [
    {
      name: 'Unit Tests - Google Sign-In Properties',
      pattern: 'src/tests/properties/googleSignInProperties.test.ts',
      description: 'Property-based tests for Google Sign-In universal properties',
    },
    {
      name: 'Unit Tests - Authentication Flow Properties',
      pattern: 'src/tests/properties/authenticationFlowProperties.test.ts',
      description: 'Property-based tests for authentication flow consistency',
    },
    {
      name: 'Integration Tests - Google Sign-In',
      pattern: 'src/tests/googleSignInIntegration.test.ts',
      description: 'Integration tests for Google Sign-In functionality',
    },
    {
      name: 'Integration Tests - Environment Detection',
      pattern: 'src/tests/environmentDetection.test.ts',
      description: 'Tests for environment detection and adaptation',
    },
    {
      name: 'Integration Tests - Configuration Validation',
      pattern: 'src/tests/configurationValidation.test.ts',
      description: 'Tests for configuration file validation',
    },
    {
      name: 'Automated Tests - Environment Behavior',
      pattern: 'src/tests/automated/environmentBehavior.test.ts',
      description: 'Automated tests for environment-specific behavior',
    },
    {
      name: 'Automated Tests - Configuration Scenarios',
      pattern: 'src/tests/automated/configurationScenarios.test.ts',
      description: 'Automated tests for various configuration scenarios',
    },
    {
      name: 'E2E Tests - Google Sign-In Flow',
      pattern: 'src/tests/e2e/googleSignInFlow.test.ts',
      description: 'End-to-end tests for complete Google Sign-In flows',
    },
    {
      name: 'E2E Tests - Authentication Integration',
      pattern: 'src/tests/e2e/authenticationIntegration.test.ts',
      description: 'End-to-end tests for authentication system integration',
    },
  ];

  private requirements = [
    {
      id: 'REQ-1',
      description: 'Configurar Google Services Files',
      testFiles: [
        'configurationValidation.test.ts',
        'configurationScenarios.test.ts',
      ],
    },
    {
      id: 'REQ-2',
      description: 'Handle Expo Go Limitations',
      testFiles: [
        'environmentDetection.test.ts',
        'environmentBehavior.test.ts',
        'googleSignInProperties.test.ts',
      ],
    },
    {
      id: 'REQ-3',
      description: 'Create Development Build Configuration',
      testFiles: [
        'environmentBehavior.test.ts',
        'configurationScenarios.test.ts',
      ],
    },
    {
      id: 'REQ-4',
      description: 'Implement Graceful Fallback',
      testFiles: [
        'googleSignInProperties.test.ts',
        'authenticationFlowProperties.test.ts',
        'googleSignInFlow.test.ts',
      ],
    },
    {
      id: 'REQ-5',
      description: 'Update Documentation and Guides',
      testFiles: [
        'googleSignInIntegration.test.ts',
      ],
    },
    {
      id: 'REQ-6',
      description: 'Environment Detection and Configuration',
      testFiles: [
        'environmentDetection.test.ts',
        'environmentBehavior.test.ts',
        'googleSignInProperties.test.ts',
      ],
    },
    {
      id: 'REQ-7',
      description: 'Testing and Validation',
      testFiles: [
        'googleSignInProperties.test.ts',
        'authenticationFlowProperties.test.ts',
        'googleSignInFlow.test.ts',
        'authenticationIntegration.test.ts',
      ],
    },
  ];

  async runAllTests(): Promise<TestReport> {
    console.log('🚀 Starting Google Sign-In Master Test Suite...\n');
    
    const startTime = Date.now();
    const testResults: TestResult[] = [];
    
    for (const suite of this.testSuites) {
      console.log(`📋 Running: ${suite.name}`);
      console.log(`   ${suite.description}`);
      
      try {
        const result = await this.runTestSuite(suite.pattern);
        testResults.push({
          testSuite: suite.name,
          ...result,
        });
        
        console.log(`   ✅ Passed: ${result.passed}, ❌ Failed: ${result.failed}, ⏭️ Skipped: ${result.skipped}`);
        console.log(`   ⏱️ Duration: ${result.duration}ms\n`);
      } catch (error) {
        console.log(`   💥 Error running test suite: ${error}\n`);
        testResults.push({
          testSuite: suite.name,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
    
    const endTime = Date.now();
    const report = this.generateReport(testResults, endTime - startTime);
    
    await this.saveReport(report);
    this.printSummary(report);
    
    return report;
  }

  private async runTestSuite(pattern: string): Promise<Omit<TestResult, 'testSuite'>> {
    const startTime = Date.now();
    
    try {
      // Run Jest with specific pattern using cross-spawn for cross-platform compatibility
      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn('npx', ['jest', `--testPathPattern=${pattern}`, '--json', '--coverage'], {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('Test execution timeout (60s)'));
        }, 60000);

        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0 || stdout.includes('"success"')) {
            resolve(stdout);
          } else {
            reject(new Error(`Jest failed with code ${code}: ${stderr}`));
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      const parsedResult = JSON.parse(result);
      const endTime = Date.now();
      
      return {
        passed: parsedResult.numPassedTests || 0,
        failed: parsedResult.numFailedTests || 0,
        skipped: parsedResult.numPendingTests || 0,
        duration: endTime - startTime,
        coverage: parsedResult.coverageMap ? this.calculateCoverage(parsedResult.coverageMap) : undefined,
        errors: parsedResult.testResults
          ?.filter((tr: any) => tr.status === 'failed')
          ?.map((tr: any) => tr.message) || [],
      };
    } catch (error) {
      const endTime = Date.now();
      
      // Try to parse Jest output even if command failed
      if (error instanceof Error && 'message' in error) {
        const errorMessage = error.message;
        if (errorMessage.includes('{') && errorMessage.includes('}')) {
          try {
            const jsonStart = errorMessage.indexOf('{');
            const jsonPart = errorMessage.substring(jsonStart);
            const result = JSON.parse(jsonPart);
            return {
              passed: result.numPassedTests || 0,
              failed: result.numFailedTests || 0,
              skipped: result.numPendingTests || 0,
              duration: endTime - startTime,
              errors: result.testResults
                ?.filter((tr: any) => tr.status === 'failed')
                ?.map((tr: any) => tr.message) || [],
            };
          } catch (parseError) {
            // Fall through to error case
          }
        }
      }
      
      throw error;
    }
  }

  private calculateCoverage(coverageMap: any): number {
    if (!coverageMap) return 0;
    
    let totalLines = 0;
    let coveredLines = 0;
    
    Object.values(coverageMap).forEach((file: any) => {
      if (file.s) {
        Object.values(file.s).forEach((count: any) => {
          totalLines++;
          if (count > 0) coveredLines++;
        });
      }
    });
    
    return totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;
  }

  private generateReport(testResults: TestResult[], totalDuration: number): TestReport {
    const totalTests = testResults.reduce((sum, result) => 
      sum + result.passed + result.failed + result.skipped, 0);
    const totalPassed = testResults.reduce((sum, result) => sum + result.passed, 0);
    const totalFailed = testResults.reduce((sum, result) => sum + result.failed, 0);
    const totalSkipped = testResults.reduce((sum, result) => sum + result.skipped, 0);
    
    const coverageValues = testResults
      .map(result => result.coverage)
      .filter(coverage => coverage !== undefined) as number[];
    const overallCoverage = coverageValues.length > 0 
      ? Math.round(coverageValues.reduce((sum, coverage) => sum + coverage, 0) / coverageValues.length)
      : 0;

    const requirementCoverage = this.calculateRequirementCoverage(testResults);
    const summary = this.generateSummary(totalTests, totalPassed, totalFailed, overallCoverage);

    return {
      timestamp: new Date().toISOString(),
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      totalDuration,
      overallCoverage,
      testResults,
      requirements: requirementCoverage,
      summary,
    };
  }

  private calculateRequirementCoverage(testResults: TestResult[]): RequirementCoverage[] {
    return this.requirements.map(req => {
      const testFiles = req.testFiles;
      const covered = testFiles.some(testFile => 
        testResults.some(result => 
          result.testSuite.toLowerCase().includes(testFile.replace('.test.ts', '')) &&
          result.passed > 0
        )
      );

      return {
        id: req.id,
        description: req.description,
        covered,
        testFiles,
      };
    });
  }

  private generateSummary(totalTests: number, totalPassed: number, totalFailed: number, coverage: number): string {
    const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    
    let summary = `Google Sign-In Test Suite Results:\n`;
    summary += `• Total Tests: ${totalTests}\n`;
    summary += `• Passed: ${totalPassed} (${passRate}%)\n`;
    summary += `• Failed: ${totalFailed}\n`;
    summary += `• Code Coverage: ${coverage}%\n\n`;
    
    if (totalFailed === 0) {
      summary += `🎉 ALL TESTS PASSED! Google Sign-In implementation is ready for production.\n`;
    } else {
      summary += `⚠️ ${totalFailed} tests failed. Review failed tests before deployment.\n`;
    }
    
    if (coverage >= 80) {
      summary += `✅ Excellent code coverage (${coverage}%).\n`;
    } else if (coverage >= 60) {
      summary += `⚠️ Good code coverage (${coverage}%), consider adding more tests.\n`;
    } else {
      summary += `❌ Low code coverage (${coverage}%), more tests needed.\n`;
    }
    
    return summary;
  }

  private async saveReport(report: TestReport): Promise<void> {
    const reportsDir = path.join(process.cwd(), 'test-reports');
    
    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Save JSON report
    const jsonPath = path.join(reportsDir, `google-signin-test-report-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    
    // Save human-readable report
    const txtPath = path.join(reportsDir, `google-signin-test-summary-${Date.now()}.txt`);
    const humanReadable = this.formatHumanReadableReport(report);
    fs.writeFileSync(txtPath, humanReadable);
    
    console.log(`📊 Reports saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Summary: ${txtPath}\n`);
  }

  private formatHumanReadableReport(report: TestReport): string {
    let output = `GOOGLE SIGN-IN TEST REPORT\n`;
    output += `Generated: ${report.timestamp}\n`;
    output += `Duration: ${report.totalDuration}ms\n\n`;
    
    output += `SUMMARY\n`;
    output += `=======\n`;
    output += report.summary + '\n\n';
    
    output += `TEST SUITES\n`;
    output += `===========\n`;
    report.testResults.forEach(result => {
      output += `${result.testSuite}\n`;
      output += `  Passed: ${result.passed}, Failed: ${result.failed}, Skipped: ${result.skipped}\n`;
      output += `  Duration: ${result.duration}ms\n`;
      if (result.coverage) {
        output += `  Coverage: ${result.coverage}%\n`;
      }
      if (result.errors.length > 0) {
        output += `  Errors:\n`;
        result.errors.forEach(error => {
          output += `    - ${error}\n`;
        });
      }
      output += '\n';
    });
    
    output += `REQUIREMENT COVERAGE\n`;
    output += `===================\n`;
    report.requirements.forEach(req => {
      const status = req.covered ? '✅' : '❌';
      output += `${status} ${req.id}: ${req.description}\n`;
      output += `   Test Files: ${req.testFiles.join(', ')}\n\n`;
    });
    
    return output;
  }

  private printSummary(report: TestReport): void {
    console.log('📊 GOOGLE SIGN-IN TEST SUITE COMPLETE\n');
    console.log('='.repeat(50));
    console.log(report.summary);
    console.log('='.repeat(50));
    
    console.log('\n📋 REQUIREMENT COVERAGE:');
    report.requirements.forEach(req => {
      const status = req.covered ? '✅' : '❌';
      console.log(`${status} ${req.id}: ${req.description}`);
    });
    
    const allRequirementsCovered = report.requirements.every(req => req.covered);
    if (allRequirementsCovered) {
      console.log('\n🎯 ALL REQUIREMENTS COVERED!');
    } else {
      const uncoveredCount = report.requirements.filter(req => !req.covered).length;
      console.log(`\n⚠️ ${uncoveredCount} requirements not fully covered.`);
    }
    
    console.log(`\n⏱️ Total execution time: ${report.totalDuration}ms`);
    console.log(`📈 Overall test coverage: ${report.overallCoverage}%`);
    
    if (report.totalFailed === 0 && allRequirementsCovered && report.overallCoverage >= 80) {
      console.log('\n🚀 GOOGLE SIGN-IN IS READY FOR PRODUCTION! 🚀');
    } else {
      console.log('\n🔧 Review failed tests and coverage before production deployment.');
    }
  }
}

// CLI execution
if (require.main === module) {
  const runner = new GoogleSignInTestRunner();
  
  runner.runAllTests()
    .then(report => {
      process.exit(report.totalFailed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
}

export default GoogleSignInTestRunner;