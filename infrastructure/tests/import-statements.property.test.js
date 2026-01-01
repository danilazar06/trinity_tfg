/**
 * Property-Based Test for Import Statement Correctness
 * Property 4: Import Statement Correctness
 * Validates: Requirements 2.4, 4.1, 4.4
 * 
 * Feature: graphql-errors-fix, Property 4: For any Lambda function code, 
 * all import/require statements should use correct paths and be compatible with Node.js runtime
 */

const fs = require('fs');
const path = require('path');

describe('Import Statement Correctness Property Tests', () => {
  const handlerPath = path.join(__dirname, '..', 'lib', 'handlers', 'room.js');
  const metricsPath = path.join(__dirname, '..', 'lib', 'utils', 'metrics.js');
  
  // Expected import patterns for CommonJS compatibility
  const validImportPatterns = [
    /const\s+\w+\s*=\s*require\(['"]\@aws-sdk\/[\w-]+['"]\)/,  // AWS SDK imports
    /const\s+\w+\s*=\s*require\(['"]\w+['"]\)/,                // Standard npm packages
    /const\s+\w+\s*=\s*require\(['"]\.\.?\/[\w\/\.-]+['"]\)/   // Relative imports
  ];

  beforeAll(() => {
    // Ensure the compiled files exist
    expect(fs.existsSync(handlerPath)).toBe(true);
    expect(fs.existsSync(metricsPath)).toBe(true);
  });

  /**
   * Property 4: Import Statement Correctness
   * For any Lambda function code, all import/require statements should use correct paths
   */
  describe('Property 4: Import Statement Correctness', () => {
    test('should use CommonJS require statements in handler', () => {
      // Property: All imports should use CommonJS require() syntax
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Verify no ES6 import statements
      expect(handlerContent).not.toMatch(/^import\s+/m);
      expect(handlerContent).not.toMatch(/from\s+['"]/);
      
      // Verify CommonJS require statements are present
      expect(handlerContent).toMatch(/require\(['"]/);
      
      // Verify specific required imports
      expect(handlerContent).toContain('require("@aws-sdk/client-dynamodb")');
      expect(handlerContent).toContain('require("@aws-sdk/lib-dynamodb")');
      expect(handlerContent).toContain('require("uuid")');
      expect(handlerContent).toContain('require("../utils/metrics")');
    });

    test('should use CommonJS require statements in metrics', () => {
      // Property: All imports should use CommonJS require() syntax
      const metricsContent = fs.readFileSync(metricsPath, 'utf8');
      
      // Verify no ES6 import statements
      expect(metricsContent).not.toMatch(/^import\s+/m);
      expect(metricsContent).not.toMatch(/from\s+['"]/);
      
      // Verify CommonJS exports are present
      expect(metricsContent).toContain('exports.');
    });

    test('should have correct relative import paths', () => {
      // Property: Relative imports should use correct paths that exist
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Extract relative import paths
      const relativeImportMatch = handlerContent.match(/require\(['"](\.\.[^'"]+)['"]\)/);
      
      if (relativeImportMatch) {
        const relativePath = relativeImportMatch[1];
        const resolvedPath = path.resolve(path.dirname(handlerPath), relativePath);
        
        // Check if the imported file exists (with .js extension if not specified)
        const possiblePaths = [
          resolvedPath,
          resolvedPath + '.js',
          path.join(resolvedPath, 'index.js')
        ];
        
        const pathExists = possiblePaths.some(p => fs.existsSync(p));
        expect(pathExists).toBe(true);
      }
    });

    test('should have valid module resolution for all imports', () => {
      // Property: All imported modules should be resolvable
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Extract all require statements
      const requireMatches = handlerContent.match(/require\(['"]([^'"]+)['"]\)/g);
      
      expect(requireMatches).toBeTruthy();
      expect(requireMatches.length).toBeGreaterThan(0);
      
      requireMatches.forEach(requireStatement => {
        const moduleMatch = requireStatement.match(/require\(['"]([^'"]+)['"]\)/);
        if (moduleMatch) {
          const moduleName = moduleMatch[1];
          
          // Verify module name format is valid
          if (moduleName.startsWith('.')) {
            // Relative import - should be valid path
            expect(moduleName).toMatch(/^\.\.?\/[\w\/\.-]+$/);
          } else if (moduleName.startsWith('@')) {
            // Scoped package - should be valid format
            expect(moduleName).toMatch(/^@[\w-]+\/[\w-]+$/);
          } else {
            // Regular package - should be valid name
            expect(moduleName).toMatch(/^[\w-]+$/);
          }
        }
      });
    });

    test('should use strict mode for Node.js compatibility', () => {
      // Property: All JavaScript files should use strict mode
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      const metricsContent = fs.readFileSync(metricsPath, 'utf8');
      
      expect(handlerContent).toContain('"use strict"');
      expect(metricsContent).toContain('"use strict"');
    });

    test('should have proper CommonJS exports', () => {
      // Property: All modules should export using CommonJS format
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      const metricsContent = fs.readFileSync(metricsPath, 'utf8');
      
      // Handler should export the handler function
      expect(handlerContent).toMatch(/exports\.handler\s*=/);
      
      // Metrics should export utility functions
      expect(metricsContent).toMatch(/exports\.\w+\s*=/);
    });
  });

  describe('Node.js Runtime Compatibility', () => {
    test('should not use browser-specific APIs', () => {
      // Property: Code should not use browser-specific APIs
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      const metricsContent = fs.readFileSync(metricsPath, 'utf8');
      
      const browserAPIs = ['window', 'document', 'localStorage', 'sessionStorage', 'fetch'];
      
      browserAPIs.forEach(api => {
        expect(handlerContent).not.toContain(api);
        expect(metricsContent).not.toContain(api);
      });
    });

    test('should use Node.js compatible patterns', () => {
      // Property: Code should use Node.js compatible patterns
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Should use process.env for environment variables
      expect(handlerContent).toMatch(/process\.env\./);
      
      // Should use console for logging (Node.js compatible)
      expect(handlerContent).toMatch(/console\.(log|error|warn)/);
    });

    test('should handle async/await correctly', () => {
      // Property: Async functions should be properly declared
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Main handler should be async
      expect(handlerContent).toMatch(/const handler\s*=\s*async/);
      
      // Should use await for async operations
      expect(handlerContent).toMatch(/await\s+\w+/);
    });
  });

  describe('Import Path Validation', () => {
    test('should validate all import paths exist', () => {
      // Property: All imported files should exist in the file system
      const files = [handlerPath, metricsPath];
      
      files.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        const requireMatches = content.match(/require\(['"](\.[^'"]+)['"]\)/g);
        
        if (requireMatches) {
          requireMatches.forEach(requireStatement => {
            const pathMatch = requireStatement.match(/require\(['"](\.[^'"]+)['"]\)/);
            if (pathMatch) {
              const relativePath = pathMatch[1];
              const resolvedPath = path.resolve(path.dirname(filePath), relativePath);
              
              // Check various possible file extensions
              const possiblePaths = [
                resolvedPath,
                resolvedPath + '.js',
                resolvedPath + '.ts',
                path.join(resolvedPath, 'index.js')
              ];
              
              const pathExists = possiblePaths.some(p => fs.existsSync(p));
              expect(pathExists).toBe(true);
            }
          });
        }
      });
    });

    test('should use consistent import style', () => {
      // Property: All imports should follow consistent style
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // All require statements should use consistent quote style
      const requireStatements = handlerContent.match(/require\(['"]/g);
      if (requireStatements && requireStatements.length > 1) {
        const firstQuoteStyle = requireStatements[0].includes('"') ? '"' : "'";
        
        requireStatements.forEach(statement => {
          expect(statement).toContain(firstQuoteStyle);
        });
      }
    });
  });

  describe('TypeScript Compilation Validation', () => {
    test('should produce valid JavaScript from TypeScript', () => {
      // Property: Compiled JavaScript should be syntactically valid
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Should not contain TypeScript-specific syntax
      expect(handlerContent).not.toMatch(/:\s*\w+\s*=/); // Type annotations
      expect(handlerContent).not.toMatch(/interface\s+\w+/); // Interface declarations
      expect(handlerContent).not.toMatch(/enum\s+\w+/); // Enum declarations
      
      // Should contain compiled JavaScript patterns
      expect(handlerContent).toContain('Object.defineProperty(exports');
    });

    test('should maintain proper function signatures', () => {
      // Property: Function signatures should be preserved correctly
      const handlerContent = fs.readFileSync(handlerPath, 'utf8');
      
      // Main handler should have correct signature
      expect(handlerContent).toMatch(/const handler\s*=\s*async\s*\(\s*event\s*\)\s*=>/);
      
      // Helper functions should be properly declared
      expect(handlerContent).toMatch(/async function \w+\(/);
    });
  });
});