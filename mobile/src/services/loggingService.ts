/**
 * Secure Logging Service
 * Handles comprehensive error logging with data sanitization
 */

interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
  FATAL: 'fatal';
}

interface LogEntry {
  timestamp: string;
  level: keyof LogLevel;
  category: string;
  message: string;
  data?: any;
  userId?: string;
  sessionId?: string;
  buildVersion?: string;
  platform?: string;
}

interface SensitiveDataPattern {
  pattern: RegExp;
  replacement: string;
  description: string;
}

class LoggingService {
  private readonly LOG_LEVELS: LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal'
  };

  private readonly MAX_LOG_ENTRIES = 1000;
  private readonly MAX_MESSAGE_LENGTH = 2000;
  private readonly MAX_DATA_SIZE = 10000; // characters

  private logEntries: LogEntry[] = [];
  private sessionId: string;
  private userId?: string;

  // Sensitive data patterns to sanitize
  private readonly SENSITIVE_PATTERNS: SensitiveDataPattern[] = [
    {
      pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
      description: 'Bearer tokens'
    },
    {
      pattern: /"accessToken"\s*:\s*"[^"]+"/gi,
      replacement: '"accessToken": "[REDACTED]"',
      description: 'Access tokens in JSON'
    },
    {
      pattern: /"idToken"\s*:\s*"[^"]+"/gi,
      replacement: '"idToken": "[REDACTED]"',
      description: 'ID tokens in JSON'
    },
    {
      pattern: /"refreshToken"\s*:\s*"[^"]+"/gi,
      replacement: '"refreshToken": "[REDACTED]"',
      description: 'Refresh tokens in JSON'
    },
    {
      pattern: /"password"\s*:\s*"[^"]+"/gi,
      replacement: '"password": "[REDACTED]"',
      description: 'Passwords in JSON'
    },
    {
      pattern: /password[=:]\s*[^\s&]+/gi,
      replacement: 'password=[REDACTED]',
      description: 'Password parameters'
    },
    {
      pattern: /Authorization:\s*[^\r\n]+/gi,
      replacement: 'Authorization: [REDACTED]',
      description: 'Authorization headers'
    },
    {
      pattern: /X-Amz-Security-Token:\s*[^\r\n]+/gi,
      replacement: 'X-Amz-Security-Token: [REDACTED]',
      description: 'AWS security tokens'
    },
    {
      pattern: /api[_-]?key[=:]\s*[^\s&]+/gi,
      replacement: 'api_key=[REDACTED]',
      description: 'API keys'
    },
    {
      pattern: /secret[=:]\s*[^\s&]+/gi,
      replacement: 'secret=[REDACTED]',
      description: 'Secret values'
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '[EMAIL_REDACTED]',
      description: 'Email addresses'
    },
    {
      pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      replacement: '[CARD_NUMBER_REDACTED]',
      description: 'Credit card numbers'
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[SSN_REDACTED]',
      description: 'Social Security Numbers'
    }
  ];

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeLogging();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}-${random}`;
  }

  /**
   * Initialize logging system
   */
  private initializeLogging(): void {
    // Set up global error handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('Global Error', event.error?.message || 'Unknown error', {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.error('Unhandled Promise Rejection', event.reason?.message || 'Unknown rejection', {
          reason: event.reason,
          stack: event.reason?.stack
        });
      });
    }

    this.info('Logging Service', 'Secure logging initialized', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Set current user ID for logging context
   */
  setUserId(userId: string): void {
    this.userId = this.sanitizeString(userId);
    this.info('Logging Service', 'User context updated');
  }

  /**
   * Clear user context
   */
  clearUserId(): void {
    this.userId = undefined;
    this.info('Logging Service', 'User context cleared');
  }

  /**
   * Sanitize sensitive data from strings
   */
  private sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Apply all sensitive data patterns
    this.SENSITIVE_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
    });

    return sanitized;
  }

  /**
   * Sanitize sensitive data from objects
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    try {
      // Convert to string and sanitize
      const jsonString = JSON.stringify(data, null, 2);
      const sanitizedString = this.sanitizeString(jsonString);
      
      // Try to parse back to object
      try {
        return JSON.parse(sanitizedString);
      } catch {
        // If parsing fails, return sanitized string
        return sanitizedString;
      }
    } catch (error) {
      // If JSON.stringify fails, return safe representation
      return '[COMPLEX_OBJECT_REDACTED]';
    }
  }

  /**
   * Truncate message if too long
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.MAX_MESSAGE_LENGTH) {
      return message;
    }

    return message.substring(0, this.MAX_MESSAGE_LENGTH - 20) + '...[TRUNCATED]';
  }

  /**
   * Truncate data if too large
   */
  private truncateData(data: any): any {
    if (!data) return data;

    try {
      const dataString = JSON.stringify(data);
      if (dataString.length <= this.MAX_DATA_SIZE) {
        return data;
      }

      // If too large, return truncated version
      const truncated = dataString.substring(0, this.MAX_DATA_SIZE - 50);
      return `${truncated}...[DATA_TRUNCATED]`;
    } catch {
      return '[LARGE_DATA_REDACTED]';
    }
  }

  /**
   * Create log entry
   */
  private createLogEntry(
    level: keyof LogLevel,
    category: string,
    message: string,
    data?: any
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: this.sanitizeString(category),
      message: this.truncateMessage(this.sanitizeString(message)),
      sessionId: this.sessionId,
      buildVersion: '1.0.0', // Could be injected from build process
      platform: 'mobile'
    };

    if (this.userId) {
      entry.userId = this.userId;
    }

    if (data) {
      entry.data = this.truncateData(this.sanitizeData(data));
    }

    return entry;
  }

  /**
   * Add log entry to storage
   */
  private addLogEntry(entry: LogEntry): void {
    this.logEntries.push(entry);

    // Maintain max log entries limit
    if (this.logEntries.length > this.MAX_LOG_ENTRIES) {
      this.logEntries = this.logEntries.slice(-this.MAX_LOG_ENTRIES);
    }

    // Output to console in development
    if (__DEV__) {
      const consoleMethod = this.getConsoleMethod(entry.level);
      consoleMethod(`[${entry.level.toUpperCase()}] ${entry.category}: ${entry.message}`, entry.data);
    }
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: keyof LogLevel): (...args: any[]) => void {
    switch (level) {
      case 'debug':
        return console.debug;
      case 'info':
        return console.info;
      case 'warn':
        return console.warn;
      case 'error':
      case 'fatal':
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Debug level logging
   */
  debug(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('debug', category, message, data);
    this.addLogEntry(entry);
  }

  /**
   * Info level logging
   */
  info(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('info', category, message, data);
    this.addLogEntry(entry);
  }

  /**
   * Warning level logging
   */
  warn(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('warn', category, message, data);
    this.addLogEntry(entry);
  }

  /**
   * Error level logging
   */
  error(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('error', category, message, data);
    this.addLogEntry(entry);
  }

  /**
   * Fatal level logging
   */
  fatal(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('fatal', category, message, data);
    this.addLogEntry(entry);
  }

  /**
   * Log authentication events
   */
  logAuth(event: 'login' | 'logout' | 'register' | 'token_refresh' | 'auth_error', data?: any): void {
    this.info('Authentication', `Auth event: ${event}`, data);
  }

  /**
   * Log network events
   */
  logNetwork(event: 'request' | 'response' | 'error' | 'retry' | 'timeout', data?: any): void {
    this.info('Network', `Network event: ${event}`, data);
  }

  /**
   * Log GraphQL events
   */
  logGraphQL(event: 'query' | 'mutation' | 'subscription' | 'error', data?: any): void {
    this.info('GraphQL', `GraphQL event: ${event}`, data);
  }

  /**
   * Log real-time events
   */
  logRealtime(event: 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect', data?: any): void {
    this.info('Realtime', `Realtime event: ${event}`, data);
  }

  /**
   * Log migration events
   */
  logMigration(event: 'start' | 'complete' | 'error' | 'cleanup', data?: any): void {
    this.info('Migration', `Migration event: ${event}`, data);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100, level?: keyof LogLevel): LogEntry[] {
    let logs = this.logEntries;

    if (level) {
      logs = logs.filter(entry => entry.level === level);
    }

    return logs.slice(-count);
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string, count: number = 100): LogEntry[] {
    const categoryLogs = this.logEntries.filter(entry => 
      entry.category.toLowerCase().includes(category.toLowerCase())
    );

    return categoryLogs.slice(-count);
  }

  /**
   * Get error logs for debugging
   */
  getErrorLogs(count: number = 50): LogEntry[] {
    const errorLogs = this.logEntries.filter(entry => 
      entry.level === 'error' || entry.level === 'fatal'
    );

    return errorLogs.slice(-count);
  }

  /**
   * Export logs for debugging (sanitized)
   */
  exportLogs(): {
    sessionId: string;
    exportTime: string;
    totalEntries: number;
    logs: LogEntry[];
  } {
    return {
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      totalEntries: this.logEntries.length,
      logs: this.logEntries
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logEntries = [];
    this.info('Logging Service', 'All logs cleared');
  }

  /**
   * Get logging statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByLevel: Record<string, number>;
    entriesByCategory: Record<string, number>;
    sessionId: string;
    userId?: string;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    const entriesByLevel: Record<string, number> = {};
    const entriesByCategory: Record<string, number> = {};

    this.logEntries.forEach(entry => {
      // Count by level
      entriesByLevel[entry.level] = (entriesByLevel[entry.level] || 0) + 1;
      
      // Count by category
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
    });

    return {
      totalEntries: this.logEntries.length,
      entriesByLevel,
      entriesByCategory,
      sessionId: this.sessionId,
      userId: this.userId,
      oldestEntry: this.logEntries[0]?.timestamp,
      newestEntry: this.logEntries[this.logEntries.length - 1]?.timestamp
    };
  }

  /**
   * Test sanitization (for debugging)
   */
  testSanitization(input: string): string {
    return this.sanitizeString(input);
  }
}

export const loggingService = new LoggingService();
export default loggingService;