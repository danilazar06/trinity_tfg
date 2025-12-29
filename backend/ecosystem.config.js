module.exports = {
  apps: [
    {
      // === PRODUCTION CONFIGURATION ===
      name: 'trinity-api-prod',
      script: 'dist/main.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        // Performance optimizations
        MAX_MEMORY_USAGE_MB: 512,
        MEMORY_WARNING_THRESHOLD: 80,
        CPU_WARNING_THRESHOLD: 80,
        GRACEFUL_SHUTDOWN_TIMEOUT: 30000,
        MAX_CONNECTIONS: 1000,
        INSTANCE_WEIGHT: 100,
        
        // Feature flags for production
        ENABLE_DEBUGGING: false,
        ENABLE_SWAGGER: false,
        ENABLE_DETAILED_LOGGING: false,
        ENABLE_PERFORMANCE_MONITORING: true,
        ENABLE_ERROR_TRACKING: true,
        ENABLE_METRICS_COLLECTION: true,
        ENABLE_HEALTH_CHECKS: true,
        ENABLE_CORS: true,
        
        // Security settings
        ENABLE_RATE_LIMITING: true,
        ENABLE_INPUT_VALIDATION: true,
        ENABLE_SECURITY_HEADERS: true,
        ENABLE_HTTPS_ONLY: true,
        ENABLE_CSRF_PROTECTION: true,
        
        // Performance settings
        ENABLE_COMPRESSION: true,
        ENABLE_CACHING: true,
        ENABLE_CONNECTION_POOLING: true,
        ENABLE_MEMORY_OPTIMIZATION: true,
        ENABLE_STATIC_ASSET_OPTIMIZATION: true,
        
        // Monitoring settings
        ENABLE_STRUCTURED_LOGGING: true,
        LOG_BUFFER_SIZE: 1000,
        LOG_FLUSH_INTERVAL: 5000,
        LOG_CONSOLE_ENABLED: true,
        LOG_FILE_ENABLED: true,
        LOG_REMOTE_ENABLED: false,
        
        METRICS_ENABLED: true,
        METRICS_COLLECTION_INTERVAL: 30000,
        METRICS_RETENTION_PERIOD: 86400000,
        METRICS_MAX_SNAPSHOTS: 2880,
        
        ERROR_TRACKING_ENABLED: true,
        ERROR_RATE_THRESHOLD: 10,
        ERROR_SPIKE_THRESHOLD: 5,
        ERROR_PATTERN_DETECTION: true,
        
        PERFORMANCE_MONITORING_ENABLED: true,
        PERFORMANCE_MONITORING_INTERVAL: 10000,
        PERFORMANCE_REPORT_INTERVAL: 300000,
        PERFORMANCE_ALERT_COOLDOWN: 300000,
      },
      
      // PM2 specific settings
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Logging
      log_file: './logs/trinity-api.log',
      out_file: './logs/trinity-api-out.log',
      error_file: './logs/trinity-api-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Monitoring
      monitoring: true,
      pmx: true,
      
      // Auto restart on file changes (disabled for production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      
      // Health check
      health_check_grace_period: 3000,
    },
    
    {
      // === STAGING CONFIGURATION ===
      name: 'trinity-api-staging',
      script: 'dist/main.js',
      instances: 2, // Limited instances for staging
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'staging',
        PORT: 3003,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3003,
        
        // Performance settings (less aggressive than production)
        MAX_MEMORY_USAGE_MB: 256,
        MEMORY_WARNING_THRESHOLD: 75,
        CPU_WARNING_THRESHOLD: 75,
        GRACEFUL_SHUTDOWN_TIMEOUT: 20000,
        MAX_CONNECTIONS: 500,
        INSTANCE_WEIGHT: 100,
        
        // Feature flags for staging
        ENABLE_DEBUGGING: true,
        ENABLE_SWAGGER: true,
        ENABLE_DETAILED_LOGGING: true,
        ENABLE_PERFORMANCE_MONITORING: true,
        ENABLE_ERROR_TRACKING: true,
        ENABLE_METRICS_COLLECTION: true,
        ENABLE_HEALTH_CHECKS: true,
        ENABLE_CORS: true,
        
        // Security (similar to production but more permissive)
        ENABLE_RATE_LIMITING: true,
        ENABLE_INPUT_VALIDATION: true,
        ENABLE_SECURITY_HEADERS: true,
        ENABLE_HTTPS_ONLY: false,
        ENABLE_CSRF_PROTECTION: false,
        
        // Performance
        ENABLE_COMPRESSION: true,
        ENABLE_CACHING: true,
        ENABLE_CONNECTION_POOLING: true,
        ENABLE_MEMORY_OPTIMIZATION: true,
        ENABLE_STATIC_ASSET_OPTIMIZATION: true,
      },
      
      max_memory_restart: '256M',
      min_uptime: '5s',
      max_restarts: 15,
      restart_delay: 2000,
      
      log_file: './logs/trinity-api-staging.log',
      out_file: './logs/trinity-api-staging-out.log',
      error_file: './logs/trinity-api-staging-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      kill_timeout: 20000,
      listen_timeout: 8000,
    },
    
    {
      // === DEVELOPMENT CONFIGURATION ===
      name: 'trinity-api-dev',
      script: 'dist/main.js',
      instances: 1, // Single instance for development
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3002,
        
        // Development settings
        MAX_MEMORY_USAGE_MB: 128,
        MEMORY_WARNING_THRESHOLD: 90,
        CPU_WARNING_THRESHOLD: 90,
        GRACEFUL_SHUTDOWN_TIMEOUT: 10000,
        MAX_CONNECTIONS: 100,
        INSTANCE_WEIGHT: 100,
        
        // All features enabled for development
        ENABLE_DEBUGGING: true,
        ENABLE_SWAGGER: true,
        ENABLE_DETAILED_LOGGING: true,
        ENABLE_PERFORMANCE_MONITORING: true,
        ENABLE_ERROR_TRACKING: true,
        ENABLE_METRICS_COLLECTION: true,
        ENABLE_HEALTH_CHECKS: true,
        ENABLE_CORS: true,
        
        // Relaxed security for development
        ENABLE_RATE_LIMITING: false,
        ENABLE_INPUT_VALIDATION: true,
        ENABLE_SECURITY_HEADERS: false,
        ENABLE_HTTPS_ONLY: false,
        ENABLE_CSRF_PROTECTION: false,
        
        // Performance (minimal for development)
        ENABLE_COMPRESSION: false,
        ENABLE_CACHING: false,
        ENABLE_CONNECTION_POOLING: false,
        ENABLE_MEMORY_OPTIMIZATION: false,
        ENABLE_STATIC_ASSET_OPTIMIZATION: false,
      },
      
      max_memory_restart: '128M',
      min_uptime: '3s',
      max_restarts: 20,
      restart_delay: 1000,
      
      // Watch for changes in development
      watch: true,
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      log_file: './logs/trinity-api-dev.log',
      out_file: './logs/trinity-api-dev-out.log',
      error_file: './logs/trinity-api-dev-error.log',
      
      kill_timeout: 10000,
      listen_timeout: 5000,
    }
  ],
  
  // === DEPLOYMENT CONFIGURATION ===
  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/trinity-backend.git',
      path: '/var/www/trinity-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    },
    
    staging: {
      user: 'deploy',
      host: 'staging-server',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/trinity-backend.git',
      path: '/var/www/trinity-backend-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  }
};