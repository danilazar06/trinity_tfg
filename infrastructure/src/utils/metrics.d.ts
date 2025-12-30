/**
 * CloudWatch Metrics and Monitoring Utilities
 * Provides structured logging and metrics for production monitoring
 */
export interface MetricData {
    metricName: string;
    value: number;
    unit: 'Count' | 'Seconds' | 'Milliseconds' | 'Percent' | 'Bytes';
    dimensions?: {
        [key: string]: string;
    };
    timestamp?: Date;
}
export interface PerformanceMetric {
    operation: string;
    duration: number;
    success: boolean;
    errorType?: string;
    metadata?: {
        [key: string]: any;
    };
}
/**
 * Log structured metrics for CloudWatch
 */
export declare function logMetric(metric: MetricData): void;
/**
 * Log performance metrics
 */
export declare function logPerformance(perf: PerformanceMetric): void;
/**
 * Circuit Breaker metrics
 */
export declare function logCircuitBreakerMetric(service: string, state: string, failureCount: number, successCount: number): void;
/**
 * Business metrics for Trinity
 */
export declare function logBusinessMetric(eventType: 'ROOM_CREATED' | 'ROOM_JOINED' | 'VOTE_CAST' | 'MATCH_FOUND' | 'AI_RECOMMENDATION', roomId?: string, userId?: string, metadata?: {
    [key: string]: any;
}): void;
/**
 * Error tracking
 */
export declare function logError(operation: string, error: Error, context?: {
    [key: string]: any;
}): void;
/**
 * Performance timer utility
 */
export declare class PerformanceTimer {
    private startTime;
    private operation;
    constructor(operation: string);
    finish(success?: boolean, errorType?: string, metadata?: {
        [key: string]: any;
    }): void;
}
/**
 * Cache hit/miss metrics
 */
export declare function logCacheMetric(cacheType: 'MOVIES' | 'USER_PROFILE' | 'ROOM_DATA', hit: boolean, key?: string): void;
