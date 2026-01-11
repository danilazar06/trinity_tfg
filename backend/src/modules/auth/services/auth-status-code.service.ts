import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';

/**
 * Service for handling authentication and authorization status codes consistently
 */
@Injectable()
export class AuthStatusCodeService {
  
  /**
   * Throw 401 Unauthorized for authentication failures
   * Use when: User is not authenticated, token is missing/invalid/expired
   */
  throwUnauthorized(message: string, code?: string): never {
    throw new UnauthorizedException({
      statusCode: 401,
      message,
      error: 'Unauthorized',
      code: code || 'AUTH_REQUIRED',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Throw 403 Forbidden for authorization failures
   * Use when: User is authenticated but lacks required permissions
   */
  throwForbidden(message: string, code?: string): never {
    throw new ForbiddenException({
      statusCode: 403,
      message,
      error: 'Forbidden',
      code: code || 'INSUFFICIENT_PERMISSIONS',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Throw 400 Bad Request for invalid authentication data
   * Use when: Request data is malformed or invalid
   */
  throwBadRequest(message: string, code?: string): never {
    throw new BadRequestException({
      statusCode: 400,
      message,
      error: 'Bad Request',
      code: code || 'INVALID_REQUEST',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Determine appropriate status code based on error type
   */
  handleAuthError(error: any, context: string): never {
    // Token-related errors (401)
    if (this.isTokenError(error)) {
      this.throwUnauthorized(
        this.getTokenErrorMessage(error),
        this.getTokenErrorCode(error)
      );
    }

    // Permission-related errors (403)
    if (this.isPermissionError(error)) {
      this.throwForbidden(
        this.getPermissionErrorMessage(error),
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    // Validation errors (400)
    if (this.isValidationError(error)) {
      this.throwBadRequest(
        this.getValidationErrorMessage(error),
        'VALIDATION_FAILED'
      );
    }

    // Network/service errors (401 with retry info)
    if (this.isNetworkError(error)) {
      this.throwUnauthorized(
        'Authentication service temporarily unavailable. Please try again.',
        'SERVICE_UNAVAILABLE'
      );
    }

    // Default to 401 for unknown authentication errors
    this.throwUnauthorized(
      `Authentication failed: ${error.message || 'Unknown error'}`,
      'AUTH_FAILED'
    );
  }

  /**
   * Check if error is token-related (401)
   */
  private isTokenError(error: any): boolean {
    const tokenErrorPatterns = [
      'token',
      'jwt',
      'expired',
      'invalid signature',
      'malformed',
      'not before',
      'audience',
      'issuer',
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return tokenErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Check if error is permission-related (403)
   */
  private isPermissionError(error: any): boolean {
    const permissionErrorPatterns = [
      'permission',
      'forbidden',
      'access denied',
      'insufficient',
      'not allowed',
      'unauthorized operation',
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return permissionErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Check if error is validation-related (400)
   */
  private isValidationError(error: any): boolean {
    const validationErrorPatterns = [
      'validation',
      'invalid format',
      'malformed request',
      'missing required',
      'invalid parameter',
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return validationErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any): boolean {
    const networkErrorPatterns = [
      'network',
      'timeout',
      'connection',
      'enotfound',
      'service unavailable',
      'temporarily down',
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return networkErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Get user-friendly message for token errors
   */
  private getTokenErrorMessage(error: any): string {
    const errorMessage = (error.message || '').toLowerCase();

    if (errorMessage.includes('expired')) {
      return 'Your session has expired. Please sign in again.';
    }

    if (errorMessage.includes('invalid signature') || errorMessage.includes('malformed')) {
      return 'Invalid authentication token. Please sign in again.';
    }

    if (errorMessage.includes('audience') || errorMessage.includes('issuer')) {
      return 'Authentication token is not valid for this application.';
    }

    if (errorMessage.includes('not before')) {
      return 'Authentication token is not yet valid.';
    }

    return 'Authentication token is invalid. Please sign in again.';
  }

  /**
   * Get error code for token errors
   */
  private getTokenErrorCode(error: any): string {
    const errorMessage = (error.message || '').toLowerCase();

    if (errorMessage.includes('expired')) {
      return 'TOKEN_EXPIRED';
    }

    if (errorMessage.includes('invalid signature')) {
      return 'TOKEN_INVALID_SIGNATURE';
    }

    if (errorMessage.includes('malformed')) {
      return 'TOKEN_MALFORMED';
    }

    if (errorMessage.includes('audience')) {
      return 'TOKEN_INVALID_AUDIENCE';
    }

    if (errorMessage.includes('issuer')) {
      return 'TOKEN_INVALID_ISSUER';
    }

    return 'TOKEN_INVALID';
  }

  /**
   * Get user-friendly message for permission errors
   */
  private getPermissionErrorMessage(error: any): string {
    return 'You do not have permission to perform this action.';
  }

  /**
   * Get user-friendly message for validation errors
   */
  private getValidationErrorMessage(error: any): string {
    return 'The request contains invalid data. Please check your input and try again.';
  }

  /**
   * Validate HTTP status code usage
   */
  validateStatusCodeUsage(statusCode: number, context: string): boolean {
    switch (statusCode) {
      case 400:
        return context.includes('validation') || context.includes('bad_request');
      case 401:
        return context.includes('authentication') || context.includes('token');
      case 403:
        return context.includes('authorization') || context.includes('permission');
      default:
        return false;
    }
  }

  /**
   * Get recommended status code for context
   */
  getRecommendedStatusCode(context: string): number {
    if (context.includes('authentication') || context.includes('token')) {
      return 401;
    }

    if (context.includes('authorization') || context.includes('permission')) {
      return 403;
    }

    if (context.includes('validation') || context.includes('bad_request')) {
      return 400;
    }

    return 401; // Default to authentication error
  }
}