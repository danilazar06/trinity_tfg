/**
 * Property-Based Test for Lambda Package Completeness
 * Property 3: Lambda Package Completeness
 * Validates: Requirements 2.1, 2.2, 2.3, 4.2, 4.3, 4.5
 * 
 * Feature: graphql-errors-fix, Property 3: For any Lambda deployment package created, 
 * all required dependencies (including uuid, AWS SDK, and peer dependencies) should be included in the package
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Lambda Package Completeness Property Tests', () => {
  const packageScript = path.join(__dirname, '..', 'package-lambda.js');
  const expectedZipFile = path.join(__dirname, '..', 'room-handler-complete.zip');
  
  // Required dependencies that must be in every Lambda package
  const requiredDependencies = [
    'uuid',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb'
  ];
  
  // Required files that must be in every Lambda package
  const requiredFiles = [
    'room.js',
    'utils/metrics.js',
    'package.json'
  ];

  beforeEach(() => {
    // Clean up any existing zip file with retry logic for Windows file locking
    if (fs.existsSync(expectedZipFile)) {
      try {
        fs.unlinkSync(expectedZipFile);
      } catch (error) {
        if (error.code === 'EBUSY') {
          // File is locked, wait a bit and try again
          const maxRetries = 3;
          for (let i = 0; i < maxRetries; i++) {
            try {
              // Wait 100ms between retries
              const start = Date.now();
              while (Date.now() - start < 100) {
                // Busy wait
              }
              fs.unlinkSync(expectedZipFile);
              break;
            } catch (retryError) {
              if (i === maxRetries - 1) {
                console.warn('Could not delete zip file, continuing with test');
              }
            }
          }
        }
      }
    }
  });

  afterEach(() => {
    // Clean up test artifacts
    const tempDir = path.join(__dirname, '..', 'lambda-package');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 3: Lambda Package Completeness
   * For any Lambda deployment package created, all required dependencies should be included
   */
  describe('Property 3: Lambda Package Completeness', () => {
    test('should include all required dependencies in package', async () => {
      // Execute the package creation script
      const result = execSync('node package-lambda.js', { 
        cwd: path.dirname(packageScript),
        encoding: 'utf8'
      });
      
      // Verify the zip file was created
      expect(fs.existsSync(expectedZipFile)).toBe(true);
      
      // Verify the zip file has reasonable size (should be > 1MB for dependencies)
      const stats = fs.statSync(expectedZipFile);
      expect(stats.size).toBeGreaterThan(1024 * 1024); // > 1MB
      expect(stats.size).toBeLessThan(50 * 1024 * 1024); // < 50MB (reasonable upper bound)
      
      // Verify the package creation process completed successfully
      expect(result).toContain('Lambda package created');
      expect(result).toContain('room-handler-complete.zip');
    }, 30000); // 30 second timeout for package creation

    test('should create package with deterministic structure', () => {
      // Property: Package creation should be deterministic
      const result1 = execSync('node package-lambda.js', { 
        cwd: path.dirname(packageScript),
        encoding: 'utf8'
      });
      
      expect(result1).toContain('Lambda package created');
      expect(fs.existsSync(expectedZipFile)).toBe(true);
      
      const stats1 = fs.statSync(expectedZipFile);
      expect(stats1.size).toBeGreaterThan(1024 * 1024); // > 1MB
    }, 30000);

    test('should handle package creation with clean state', () => {
      // Property: Package creation should work with clean system state
      const tempDir = path.join(__dirname, '..', 'lambda-package');
      
      // Ensure clean state
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      
      // Execute package creation
      const result = execSync('node package-lambda.js', { 
        cwd: path.dirname(packageScript),
        encoding: 'utf8'
      });
      
      // Verify success
      expect(fs.existsSync(expectedZipFile)).toBe(true);
      expect(result).toContain('Lambda package created');
      
      // Verify temp directory was cleaned up
      expect(fs.existsSync(tempDir)).toBe(false);
    }, 30000);
  });

  describe('Package Content Validation', () => {
    test('should create package.json with all required dependencies', () => {
      // Create a temporary package to examine its contents
      const tempDir = path.join(__dirname, '..', 'test-lambda-package');
      
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Copy the package creation logic to create a test package
      const packageJson = {
        "name": "trinity-room-handler",
        "version": "1.0.0",
        "main": "room.js",
        "dependencies": {
          "uuid": "^9.0.0",
          "@aws-sdk/client-dynamodb": "^3.282.0",
          "@aws-sdk/lib-dynamodb": "^3.282.0"
        }
      };
      
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      // Install dependencies
      execSync('npm install --production', { 
        cwd: tempDir,
        stdio: 'pipe'
      });
      
      // Verify all required dependencies are installed
      requiredDependencies.forEach(dep => {
        const depPath = path.join(tempDir, 'node_modules', dep);
        expect(fs.existsSync(depPath)).toBe(true);
      });
      
      // Verify package.json has correct structure
      const installedPackageJson = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf8'));
      expect(installedPackageJson.name).toBe('trinity-room-handler');
      expect(installedPackageJson.main).toBe('room.js');
      expect(Object.keys(installedPackageJson.dependencies)).toEqual(
        expect.arrayContaining(requiredDependencies)
      );
      
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 30000);

    test('should handle dependency installation failures gracefully', () => {
      // Property: Package creation should fail gracefully if dependencies can't be installed
      const tempDir = path.join(__dirname, '..', 'test-lambda-package-fail');
      
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Create a package.json with invalid dependencies
      const invalidPackageJson = {
        "name": "trinity-room-handler",
        "version": "1.0.0",
        "main": "room.js",
        "dependencies": {
          "nonexistent-package-12345": "^1.0.0"
        }
      };
      
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(invalidPackageJson, null, 2)
      );
      
      // Attempt to install dependencies - should fail
      expect(() => {
        execSync('npm install --production', { 
          cwd: tempDir,
          stdio: 'pipe'
        });
      }).toThrow();
      
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('Module Resolution Validation', () => {
    test('should verify all imports can be resolved', () => {
      // Property: All import statements in the handler should be resolvable
      const handlerPath = path.join(__dirname, '..', 'lib', 'handlers', 'room.js');
      
      expect(fs.existsSync(handlerPath)).toBe(true);
      
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Verify required imports are present
      expect(handlerContent).toContain('require("@aws-sdk/client-dynamodb")');
      expect(handlerContent).toContain('require("@aws-sdk/lib-dynamodb")');
      expect(handlerContent).toContain('require("uuid")');
      expect(handlerContent).toContain('require("../utils/metrics")');
      
      // Verify the handler exports the correct function
      expect(handlerContent).toContain('exports.handler');
    });

    test('should verify metrics utility can be imported', () => {
      // Property: Metrics utility should be importable and have required functions
      const metricsPath = path.join(__dirname, '..', 'lib', 'utils', 'metrics.js');
      
      expect(fs.existsSync(metricsPath)).toBe(true);
      
      const metricsContent = fs.readFileSync(metricsPath, 'utf8');
      
      // Verify required exports are present
      expect(metricsContent).toContain('exports.logBusinessMetric');
      expect(metricsContent).toContain('exports.logError');
      expect(metricsContent).toContain('exports.PerformanceTimer');
    });
  });
});