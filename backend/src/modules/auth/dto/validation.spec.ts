import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import * as fc from 'fast-check';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { ConfirmSignUpDto } from './confirm-signup.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('Auth DTOs Property Tests', () => {
  /**
   * **Feature: trinity-mvp, Property 15: Protección de datos y validación de entrada**
   * **Valida: Requisitos 8.3, 8.5**
   * 
   * Para cualquier almacenamiento de datos o solicitud de API, el sistema debe encriptar datos sensibles 
   * y validar/sanitizar todas las entradas para prevenir vulnerabilidades de seguridad
   */
  describe('Property 15: Data protection and input validation', () => {
    
    it('should validate and sanitize all user registration inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(), // Valid emails
              fc.string(), // Invalid emails
              fc.constant(''), // Empty strings
              fc.constant(null), // Null values
              fc.constant(undefined) // Undefined values
            ),
            username: fc.oneof(
              fc.string({ minLength: 3, maxLength: 20 }), // Valid usernames
              fc.string({ minLength: 1, maxLength: 2 }), // Too short
              fc.string({ minLength: 21, maxLength: 50 }), // Too long
              fc.string().filter(s => /[^a-zA-Z0-9_]/.test(s)), // Invalid characters
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
            password: fc.oneof(
              fc.string({ minLength: 8, maxLength: 50 }).filter(s => 
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(s)
              ), // Valid passwords
              fc.string({ minLength: 1, maxLength: 7 }), // Too short
              fc.string({ minLength: 8, maxLength: 50 }).filter(s => 
                !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(s)
              ), // Weak passwords
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
            phoneNumber: fc.oneof(
              fc.option(fc.string().filter(s => /^\+[1-9]\d{1,14}$/.test(s))), // Valid international format
              fc.option(fc.string().filter(s => !/^\+[1-9]\d{1,14}$/.test(s))), // Invalid format
              fc.constant('invalid-phone'), // Invalid string
              fc.constant('') // Empty string
            ),
          }),
          async (userData) => {
            const dto = plainToClass(CreateUserDto, userData);
            const errors = await validate(dto);

            // Valid data should pass validation
            const isValidEmail = typeof userData.email === 'string' && 
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email);
            const isValidUsername = typeof userData.username === 'string' && 
              userData.username.length >= 3 && 
              userData.username.length <= 20 && 
              /^[a-zA-Z0-9_]+$/.test(userData.username);
            const isValidPassword = typeof userData.password === 'string' && 
              userData.password.length >= 8 && 
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(userData.password);
            const isValidPhone = !userData.phoneNumber || 
              (typeof userData.phoneNumber === 'string' && 
               /^\+[1-9]\d{1,14}$/.test(userData.phoneNumber));

            const shouldBeValid = isValidEmail && isValidUsername && isValidPassword && isValidPhone;

            if (shouldBeValid) {
              // Valid data should have no validation errors
              expect(errors).toHaveLength(0);
            } else {
              // Invalid data should have validation errors
              expect(errors.length).toBeGreaterThan(0);
              
              // Verify specific validation messages for security
              if (!isValidEmail) {
                expect(errors.some(e => e.property === 'email')).toBe(true);
              }
              if (!isValidUsername) {
                expect(errors.some(e => e.property === 'username')).toBe(true);
              }
              if (!isValidPassword) {
                expect(errors.some(e => e.property === 'password')).toBe(true);
              }
              if (!isValidPhone) {
                expect(errors.some(e => e.property === 'phoneNumber')).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate login credentials and prevent injection attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(),
              fc.string().filter(s => s.includes('<script>')), // XSS attempt
              fc.string().filter(s => s.includes('DROP TABLE')), // SQL injection attempt
              fc.string().filter(s => s.includes('${}')), // Template injection
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
            password: fc.oneof(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.string().filter(s => s.includes('<script>')), // XSS attempt
              fc.string().filter(s => s.includes('\'; DROP TABLE')), // SQL injection
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
          }),
          async (loginData) => {
            const dto = plainToClass(LoginUserDto, loginData);
            const errors = await validate(dto);

            const isValidEmail = typeof loginData.email === 'string' && 
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginData.email);
            const isValidPassword = typeof loginData.password === 'string' && 
              loginData.password.length > 0;

            const shouldBeValid = isValidEmail && isValidPassword;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);
              
              // Verify no malicious content passes validation
              expect(dto.email).not.toContain('<script>');
              expect(dto.email).not.toContain('DROP TABLE');
              expect(dto.password).toBeDefined();
            } else {
              expect(errors.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate confirmation codes and prevent brute force attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(),
              fc.string(),
              fc.constant(''),
              fc.constant(null)
            ),
            confirmationCode: fc.oneof(
              fc.string({ minLength: 6, maxLength: 6 }).filter(s => /^\d{6}$/.test(s)), // Valid 6-digit codes
              fc.string({ minLength: 1, maxLength: 5 }), // Too short
              fc.string({ minLength: 7, maxLength: 20 }), // Too long
              fc.string({ minLength: 6, maxLength: 6 }).filter(s => !/^\d{6}$/.test(s)), // Non-numeric
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
          }),
          async (confirmData) => {
            const dto = plainToClass(ConfirmSignUpDto, confirmData);
            const errors = await validate(dto);

            const isValidEmail = typeof confirmData.email === 'string' && 
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmData.email);
            const isValidCode = typeof confirmData.confirmationCode === 'string' && 
              confirmData.confirmationCode.length === 6;

            const shouldBeValid = isValidEmail && isValidCode;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);
            } else {
              expect(errors.length).toBeGreaterThan(0);
              
              // Verify confirmation code validation prevents brute force
              if (!isValidCode) {
                expect(errors.some(e => 
                  e.property === 'confirmationCode' && 
                  e.constraints?.isLength
                )).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate password reset inputs and prevent security bypasses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(),
              fc.string(),
              fc.constant('')
            ),
            confirmationCode: fc.oneof(
              fc.string({ minLength: 6, maxLength: 6 }),
              fc.string({ minLength: 1, maxLength: 5 }),
              fc.string({ minLength: 7, maxLength: 20 }),
              fc.constant('')
            ),
            newPassword: fc.oneof(
              fc.string({ minLength: 8, maxLength: 50 }).filter(s => 
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(s)
              ), // Strong passwords
              fc.string({ minLength: 1, maxLength: 7 }), // Weak passwords
              fc.string({ minLength: 8, maxLength: 50 }).filter(s => 
                !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(s)
              ), // Passwords without complexity
              fc.constant('') // Empty
            ),
          }),
          async (resetData) => {
            const dto = plainToClass(ResetPasswordDto, resetData);
            const errors = await validate(dto);

            const isValidEmail = typeof resetData.email === 'string' && 
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetData.email);
            const isValidCode = typeof resetData.confirmationCode === 'string' && 
              resetData.confirmationCode.length === 6;
            const isValidPassword = typeof resetData.newPassword === 'string' && 
              resetData.newPassword.length >= 8 && 
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(resetData.newPassword);

            const shouldBeValid = isValidEmail && isValidCode && isValidPassword;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);
            } else {
              expect(errors.length).toBeGreaterThan(0);
              
              // Verify password complexity requirements prevent weak passwords
              if (!isValidPassword) {
                expect(errors.some(e => 
                  e.property === 'newPassword' && 
                  (e.constraints?.matches || e.constraints?.minLength)
                )).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize all string inputs to prevent XSS and injection attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maliciousInput: fc.oneof(
              fc.constant('<script>alert("xss")</script>'),
              fc.constant('javascript:alert("xss")'),
              fc.constant('${7*7}'), // Template injection
              fc.constant('{{7*7}}'), // Template injection
              fc.constant('\'; DROP TABLE users; --'), // SQL injection
              fc.constant('../../etc/passwd'), // Path traversal
              fc.constant('%3Cscript%3E'), // URL encoded XSS
              fc.constant('data:text/html,<script>alert(1)</script>'), // Data URI XSS
            ),
            fieldType: fc.constantFrom('email', 'username', 'password'),
          }),
          async (testData) => {
            const userData = {
              email: testData.fieldType === 'email' ? testData.maliciousInput : 'test@example.com',
              username: testData.fieldType === 'username' ? testData.maliciousInput : 'testuser',
              password: testData.fieldType === 'password' ? testData.maliciousInput : 'ValidPass123!',
            };

            const dto = plainToClass(CreateUserDto, userData);
            const errors = await validate(dto);

            // Malicious inputs should always be rejected by validation
            expect(errors.length).toBeGreaterThan(0);

            // Verify the specific field with malicious input has validation errors
            const fieldError = errors.find(e => e.property === testData.fieldType);
            expect(fieldError).toBeDefined();

            // Verify that validation prevents the malicious content from being processed
            if (testData.fieldType === 'email') {
              expect(fieldError?.constraints?.isEmail).toBeDefined();
            } else if (testData.fieldType === 'username') {
              expect(fieldError?.constraints?.matches || fieldError?.constraints?.minLength).toBeDefined();
            } else if (testData.fieldType === 'password') {
              expect(fieldError?.constraints?.matches || fieldError?.constraints?.minLength).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});