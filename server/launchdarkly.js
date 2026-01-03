// Initialize LaunchDarkly SDK with observability BEFORE importing Express
const { init } = require('@launchdarkly/node-server-sdk');
const { Observability } = require('@launchdarkly/observability-node');
const dotenv = require('dotenv');

// Load environment variables first
dotenv.config();

const sdkKey = process.env.LD_SDK_KEY;

if (!sdkKey || sdkKey === "") {
    console.error("*** LaunchDarkly SDK key not found. Please set LD_SDK_KEY environment variable.");
    process.exit(1);
}

console.log(`LaunchDarkly SDK Key: ${sdkKey}`);

// Observability configuration
const observabilityConfig = {
    serviceName: 'launchdarkly-demo-server',
    serviceVersion: process.env.SERVICE_VERSION || 'v1.0.0',
    environment: process.env.NODE_ENV || 'development'
};

// Log observability configuration
console.log('Observability Configuration:', observabilityConfig);
console.log('Filesystem Instrumentation:', process.env.LAUNCHDARKLY_OTEL_NODE_ENABLE_FILESYSTEM_INSTRUMENTATION || 'false');
console.log('HTTP Instrumentation:', process.env.LAUNCHDARKLY_OTEL_NODE_ENABLE_OUTGOING_HTTP_INSTRUMENTATION || 'true');

// Create observability instance to access LDObserve functionality
const observabilityInstance = new Observability(observabilityConfig);

// Initialize LaunchDarkly with observability plugin BEFORE Express
const ldClient = init(sdkKey, {
    plugins: [observabilityInstance],
    // Ensure events are sent (these are defaults, but making them explicit)
    sendEvents: true,
    offline: false,
    // Event flush configuration
    flushInterval: 5, // Flush events every 5 seconds (default is 5)
    capacity: 10000,  // Event capacity (default is 10000)
    // Add timeout for initialization
    timeout: 10, // Wait up to 10 seconds for initialization
    // Enable debug logging for events (optional)
    logger: {
        debug: (message) => console.log(`🔍 [LD Debug] ${message}`),
        info: (message) => console.log(`ℹ️ [LD Info] ${message}`),
        warn: (message) => console.warn(`⚠️ [LD Warn] ${message}`),
        error: (message) => console.error(`🚨 [LD Error] ${message}`)
    }
});

// Create LDObserve interface for accessing observability methods
const LDObserve = {
    // Parse headers to extract session and request IDs for context propagation
    parseHeaders: (headers) => {
        // Extract standard observability headers or generate fallbacks
        const secureSessionId = headers['x-session-id'] || 
                               headers['x-trace-id'] || 
                               `session_${Math.random().toString(36).substr(2, 12)}`;
        
        const requestId = headers['x-request-id'] || 
                         headers['x-correlation-id'] || 
                         `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        return { secureSessionId, requestId };
    },
    
    // Record error with automatic context propagation
    recordError: (error, secureSessionId, requestId, metadata = {}, options = {}) => {
        // Use provided IDs or let LaunchDarkly handle context propagation automatically
        const errorRecord = {
            timestamp: new Date().toISOString(),
            service: observabilityConfig.serviceName,
            version: observabilityConfig.serviceVersion,
            environment: observabilityConfig.environment,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            session: {
                secureSessionId: secureSessionId || 'auto-propagated',
                requestId: requestId || 'auto-propagated'
            },
            metadata: metadata,
            options: options
        };
        
        // Log structured error for observability platforms to consume
        console.error('[LAUNCHDARKLY_ERROR_RECORD]', JSON.stringify(errorRecord));
        
        // Also log human-readable format
        console.error(`🚨 Custom Error Recorded: ${error.message}`);
        console.error(`   Session: ${secureSessionId || 'auto-propagated'}`);
        console.error(`   Request: ${requestId || 'auto-propagated'}`);
        console.error(`   Tags: ${options.tags ? options.tags.join(', ') : 'none'}`);
        console.error(`   Level: ${options.level || 'error'}`);
        
        return errorRecord;
    },
    
    // Record log with automatic context propagation
    recordLog: (message, level, secureSessionId, requestId, metadata = {}) => {
        // Use provided IDs or let LaunchDarkly handle context propagation automatically
        const logRecord = {
            timestamp: new Date().toISOString(),
            service: observabilityConfig.serviceName,
            version: observabilityConfig.serviceVersion,
            environment: observabilityConfig.environment,
            log: {
                message: message,
                level: level || 'info'
            },
            session: {
                secureSessionId: secureSessionId || 'auto-propagated',
                requestId: requestId || 'auto-propagated'
            },
            metadata: metadata
        };
        
        // Log structured record for observability platforms to consume
        const logOutput = `[LAUNCHDARKLY_LOG_RECORD] ${JSON.stringify(logRecord)}`;
        
        // Route to appropriate console method based on level
        switch (level?.toLowerCase()) {
            case 'error':
                console.error(logOutput);
                break;
            case 'warn':
            case 'warning':
                console.warn(logOutput);
                break;
            case 'debug':
                console.debug(logOutput);
                break;
            case 'info':
            default:
                console.log(logOutput);
                break;
        }
        
        // Also log human-readable format
        const levelEmoji = {
            'error': '🚨',
            'warn': '⚠️',
            'warning': '⚠️',
            'info': 'ℹ️',
            'debug': '🔍'
        };
        
        console.log(`${levelEmoji[level?.toLowerCase()] || 'ℹ️'} Custom Log Recorded: ${message}`);
        console.log(`   Level: ${level || 'info'}`);
        console.log(`   Session: ${secureSessionId || 'auto-propagated'}`);
        console.log(`   Request: ${requestId || 'auto-propagated'}`);
        
        return logRecord;
    },
    
    // Record metric for point-in-time measurements
    recordMetric: (metric) => {
        // Validate metric structure
        if (!metric || typeof metric !== 'object' || !metric.name || metric.value === undefined) {
            console.error('🚨 Invalid metric: Must have name and value properties');
            return null;
        }
        
        const metricRecord = {
            timestamp: new Date().toISOString(),
            service: observabilityConfig.serviceName,
            version: observabilityConfig.serviceVersion,
            environment: observabilityConfig.environment,
            metric: {
                name: metric.name,
                value: metric.value,
                tags: metric.tags || {},
                unit: metric.unit || 'count'
            }
        };
        
        // Log structured metric for observability platforms to consume
        const metricOutput = `[LAUNCHDARKLY_METRIC_RECORD] ${JSON.stringify(metricRecord)}`;
        console.log(metricOutput);
        
        // Also log human-readable format
        const tagsString = metric.tags ? 
            Object.entries(metric.tags).map(([k, v]) => `${k}=${v}`).join(', ') : 
            'none';
        
        console.log(`📊 Custom Metric Recorded: ${metric.name} = ${metric.value}`);
        console.log(`   Unit: ${metric.unit || 'count'}`);
        console.log(`   Tags: ${tagsString}`);
        console.log(`   Service: ${observabilityConfig.serviceName}`);
        
        return metricRecord;
    },
    
    // Record cumulative increment metric (counter)
    recordIncr: (metric) => {
        // Validate metric structure
        if (!metric || typeof metric !== 'object' || !metric.name) {
            console.error('🚨 Invalid increment metric: Must have name property');
            return null;
        }
        
        // Default increment value is 1 if not specified
        const incrementValue = metric.value !== undefined ? metric.value : 1;
        
        const incrRecord = {
            timestamp: new Date().toISOString(),
            service: observabilityConfig.serviceName,
            version: observabilityConfig.serviceVersion,
            environment: observabilityConfig.environment,
            increment: {
                name: metric.name,
                value: incrementValue,
                tags: metric.tags || {},
                unit: metric.unit || 'count'
            }
        };
        
        // Log structured increment for observability platforms to consume
        const incrOutput = `[LAUNCHDARKLY_INCREMENT_RECORD] ${JSON.stringify(incrRecord)}`;
        console.log(incrOutput);
        
        // Also log human-readable format
        const tagsString = metric.tags ? 
            Object.entries(metric.tags).map(([k, v]) => `${k}=${v}`).join(', ') : 
            'none';
        
        console.log(`📈 Custom Increment Recorded: ${metric.name} +${incrementValue}`);
        console.log(`   Unit: ${metric.unit || 'count'}`);
        console.log(`   Tags: ${tagsString}`);
        console.log(`   Service: ${observabilityConfig.serviceName}`);
        
        return incrRecord;
    },
    
    // Set attributes on the active span
    setAttributes: (attributes) => {
        // Validate attributes
        if (!attributes || typeof attributes !== 'object') {
            console.error('🚨 Invalid attributes: Must be an object');
            return null;
        }
        
        try {
            // Access the observability instance to set attributes on active span
            // Note: This is a simplified implementation - the actual LaunchDarkly observability
            // plugin would handle the OpenTelemetry span context automatically
            
            const spanRecord = {
                timestamp: new Date().toISOString(),
                service: observabilityConfig.serviceName,
                version: observabilityConfig.serviceVersion,
                environment: observabilityConfig.environment,
                span_attributes: attributes
            };
            
            // Log structured span attributes for observability platforms
            const spanOutput = `[LAUNCHDARKLY_SPAN_ATTRIBUTES] ${JSON.stringify(spanRecord)}`;
            console.log(spanOutput);
            
            // Also log human-readable format
            const attrsString = Object.entries(attributes)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');
            
            console.log(`🔗 Span Attributes Set: ${attrsString}`);
            console.log(`   Service: ${observabilityConfig.serviceName}`);
            
            return spanRecord;
            
        } catch (error) {
            console.error('🚨 Error setting span attributes:', error.message);
            return null;
        }
    },
    
    // Start a span with information from request headers
    startWithHeaders: (spanName, headers) => {
        // Validate inputs
        if (!spanName || typeof spanName !== 'string') {
            console.error('🚨 Invalid span name: Must be a non-empty string');
            return { span: null };
        }
        
        try {
            // Extract context from headers
            const { secureSessionId, requestId } = LDObserve.parseHeaders(headers || {});
            
            const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const spanRecord = {
                timestamp: new Date().toISOString(),
                service: observabilityConfig.serviceName,
                version: observabilityConfig.serviceVersion,
                environment: observabilityConfig.environment,
                span: {
                    id: spanId,
                    name: spanName,
                    operation: 'start',
                    session: {
                        secureSessionId: secureSessionId,
                        requestId: requestId
                    },
                    headers: {
                        'x-session-id': headers['x-session-id'],
                        'x-request-id': headers['x-request-id'],
                        'x-trace-id': headers['x-trace-id'],
                        'x-correlation-id': headers['x-correlation-id']
                    }
                }
            };
            
            // Log structured span start for observability platforms
            const spanOutput = `[LAUNCHDARKLY_SPAN_START] ${JSON.stringify(spanRecord)}`;
            console.log(spanOutput);
            
            // Also log human-readable format
            console.log(`🚀 Span Started: ${spanName} (${spanId})`);
            console.log(`   Session: ${secureSessionId}`);
            console.log(`   Request: ${requestId}`);
            
            // Return a span-like object with an end method
            const span = {
                id: spanId,
                name: spanName,
                startTime: Date.now(),
                end: () => {
                    const endTime = Date.now();
                    const duration = endTime - span.startTime;
                    
                    const endRecord = {
                        timestamp: new Date().toISOString(),
                        service: observabilityConfig.serviceName,
                        version: observabilityConfig.serviceVersion,
                        environment: observabilityConfig.environment,
                        span: {
                            id: spanId,
                            name: spanName,
                            operation: 'end',
                            duration_ms: duration,
                            session: {
                                secureSessionId: secureSessionId,
                                requestId: requestId
                            }
                        }
                    };
                    
                    // Log structured span end
                    const endOutput = `[LAUNCHDARKLY_SPAN_END] ${JSON.stringify(endRecord)}`;
                    console.log(endOutput);
                    
                    console.log(`🏁 Span Ended: ${spanName} (${spanId}) - Duration: ${duration}ms`);
                    
                    return endRecord;
                }
            };
            
            return { span, spanRecord };
            
        } catch (error) {
            console.error('🚨 Error starting span:', error.message);
            return { span: null };
        }
    },
    
    // Run a callback with information from request headers and return the result
    runWithHeaders: async (spanName, headers, callback) => {
        // Validate inputs
        if (!spanName || typeof spanName !== 'string') {
            console.error('🚨 Invalid span name: Must be a non-empty string');
            return null;
        }
        
        if (!callback || typeof callback !== 'function') {
            console.error('🚨 Invalid callback: Must be a function');
            return null;
        }
        
        try {
            // Start the span
            const { span, spanRecord } = LDObserve.startWithHeaders(spanName, headers);
            
            if (!span) {
                console.error('🚨 Failed to start span for runWithHeaders');
                return null;
            }
            
            let result;
            let error;
            
            try {
                // Execute the callback with the span
                result = await callback(span);
                
                // Log successful callback execution
                console.log(`✅ Callback executed successfully in span: ${spanName}`);
                
            } catch (callbackError) {
                error = callbackError;
                console.error(`❌ Callback error in span ${spanName}:`, callbackError.message);
                
                // Record the error that occurred during callback execution
                LDObserve.recordError(
                    callbackError,
                    spanRecord?.span?.session?.secureSessionId,
                    spanRecord?.span?.session?.requestId,
                    {
                        spanId: span.id,
                        spanName: spanName,
                        operation: 'runWithHeaders_callback'
                    },
                    {
                        level: 'error',
                        tags: ['span', 'callback', 'execution']
                    }
                );
            } finally {
                // Always end the span
                span.end();
            }
            
            // Re-throw the error if one occurred
            if (error) {
                throw error;
            }
            
            return result;
            
        } catch (error) {
            console.error('🚨 Error in runWithHeaders:', error.message);
            throw error;
        }
    }
};



// Import the Context Manager
const ContextManager = require('./contextManager');

// Create a global context manager instance
const contextManager = new ContextManager();

// Function to generate a default user context with unique key (for backward compatibility)
const generateDefaultContext = () => {
    return contextManager.generateDefaultContext();
};

// Function to update the user context (for backward compatibility)
const setUserContext = (userKey, name) => {
    return contextManager.updateContext(userKey, name);
};

// Function to get the current user context (for backward compatibility)
const getUserContext = () => {
    return contextManager.getCurrentContext();
};

// Function to manually flush events to LaunchDarkly
const flushEvents = () => {
    return new Promise((resolve, reject) => {
        ldClient.flush((err) => {
            if (err) {
                console.error('🚨 Error flushing LaunchDarkly events:', err);
                reject(err);
            } else {
                console.log('✅ LaunchDarkly events flushed successfully');
                resolve();
            }
        });
    });
};

// Function to check if events are being sent
const getEventStatus = () => {
    return {
        isOffline: ldClient.isOffline ? ldClient.isOffline() : false,
        initialized: ldClient.initialized ? ldClient.initialized() : false,
        sendEvents: true, // We explicitly set this to true
        flushInterval: 5,
        capacity: 10000
    };
};

// Function to check if using default context (for backward compatibility)
const isUsingDefault = () => {
    return contextManager.isUsingDefault();
};

module.exports = {
    ldClient,
    get context() { return contextManager.getCurrentContext(); }, // For backward compatibility - use getter to avoid immediate initialization
    contextManager, // Export the context manager instance
    getUserContext,
    setUserContext,
    generateDefaultContext,
    isUsingDefault,
    flushEvents,
    getEventStatus,
    LDObserve
};