"use strict";
/**
 * Circuit Breaker Implementation for External API Calls
 * Prevents cascading failures when external services are down
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tmdbCircuitBreaker = exports.CircuitBreaker = exports.CircuitState = void 0;
const metrics_1 = require("./metrics");
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN"; // Testing if service is back
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    constructor(config = {}) {
        this.config = {
            failureThreshold: 5,
            resetTimeout: 60000,
            monitoringPeriod: 300000,
            successThreshold: 2,
            serviceName: 'UnknownService',
            ...config
        };
        this.state = {
            state: CircuitState.CLOSED,
            failureCount: 0,
            lastFailureTime: 0,
            successCount: 0,
            nextAttempt: 0
        };
        // Log initial state
        this.logCurrentState();
    }
    async execute(operation) {
        const timer = new metrics_1.PerformanceTimer(`CircuitBreaker_${this.config.serviceName}`);
        const now = Date.now();
        // Check if we should transition states
        this.updateState(now);
        // If circuit is open, fail fast
        if (this.state.state === CircuitState.OPEN) {
            const error = new Error(`Circuit breaker is OPEN for ${this.config.serviceName}. Next attempt at ${new Date(this.state.nextAttempt).toISOString()}`);
            timer.finish(false, 'CircuitOpen');
            throw error;
        }
        try {
            const result = await operation();
            this.onSuccess();
            timer.finish(true, undefined, { state: this.state.state });
            return result;
        }
        catch (error) {
            this.onFailure(now);
            timer.finish(false, 'OperationFailed', {
                state: this.state.state,
                failureCount: this.state.failureCount
            });
            (0, metrics_1.logError)(`CircuitBreaker_${this.config.serviceName}`, error, {
                circuitState: this.state.state,
                failureCount: this.state.failureCount
            });
            throw error;
        }
    }
    updateState(now) {
        const previousState = this.state.state;
        switch (this.state.state) {
            case CircuitState.CLOSED:
                // Reset failure count if monitoring period has passed
                if (now - this.state.lastFailureTime > this.config.monitoringPeriod) {
                    this.state.failureCount = 0;
                }
                break;
            case CircuitState.OPEN:
                // Check if we should transition to half-open
                if (now >= this.state.nextAttempt) {
                    this.state.state = CircuitState.HALF_OPEN;
                    this.state.successCount = 0;
                    console.log(`🔄 Circuit breaker for ${this.config.serviceName} transitioning to HALF_OPEN`);
                }
                break;
            case CircuitState.HALF_OPEN:
                // Stay in half-open, will be handled by success/failure
                break;
        }
        // Log state change
        if (previousState !== this.state.state) {
            this.logCurrentState();
        }
    }
    onSuccess() {
        const previousState = this.state.state;
        switch (this.state.state) {
            case CircuitState.CLOSED:
                // Reset failure count on success
                this.state.failureCount = 0;
                break;
            case CircuitState.HALF_OPEN:
                this.state.successCount++;
                if (this.state.successCount >= this.config.successThreshold) {
                    this.state.state = CircuitState.CLOSED;
                    this.state.failureCount = 0;
                    this.state.successCount = 0;
                    console.log(`✅ Circuit breaker for ${this.config.serviceName} CLOSED - service recovered`);
                }
                break;
        }
        if (previousState !== this.state.state) {
            this.logCurrentState();
        }
    }
    onFailure(now) {
        const previousState = this.state.state;
        this.state.lastFailureTime = now;
        switch (this.state.state) {
            case CircuitState.CLOSED:
                this.state.failureCount++;
                if (this.state.failureCount >= this.config.failureThreshold) {
                    this.state.state = CircuitState.OPEN;
                    this.state.nextAttempt = now + this.config.resetTimeout;
                    console.log(`🚨 Circuit breaker for ${this.config.serviceName} OPENED - too many failures (${this.state.failureCount})`);
                }
                break;
            case CircuitState.HALF_OPEN:
                // Go back to open on any failure
                this.state.state = CircuitState.OPEN;
                this.state.nextAttempt = now + this.config.resetTimeout;
                this.state.successCount = 0;
                console.log(`🚨 Circuit breaker for ${this.config.serviceName} back to OPEN - half-open test failed`);
                break;
        }
        if (previousState !== this.state.state) {
            this.logCurrentState();
        }
    }
    logCurrentState() {
        (0, metrics_1.logCircuitBreakerMetric)(this.config.serviceName, this.state.state, this.state.failureCount, this.state.successCount);
    }
    getState() {
        return { ...this.state };
    }
    getConfig() {
        return { ...this.config };
    }
    // Manual controls for testing/admin
    forceOpen() {
        this.state.state = CircuitState.OPEN;
        this.state.nextAttempt = Date.now() + this.config.resetTimeout;
        console.log(`🔧 Circuit breaker for ${this.config.serviceName} manually OPENED`);
        this.logCurrentState();
    }
    forceClose() {
        this.state.state = CircuitState.CLOSED;
        this.state.failureCount = 0;
        this.state.successCount = 0;
        console.log(`🔧 Circuit breaker for ${this.config.serviceName} manually CLOSED`);
        this.logCurrentState();
    }
}
exports.CircuitBreaker = CircuitBreaker;
// Singleton instance for TMDB API
exports.tmdbCircuitBreaker = new CircuitBreaker({
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'),
    monitoringPeriod: 300000,
    successThreshold: 2,
    serviceName: 'TMDB_API'
});
