// IMPORTANT: Initialize LaunchDarkly with observability BEFORE importing Express
const { ldClient, getUserContext, setUserContext, generateDefaultContext, isUsingDefault, flushEvents, getEventStatus, LDObserve } = require('./launchdarkly');

// Now import Express and other dependencies
const express = require("express");
const bodyParser = require("body-parser");
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT;
const featureFlagKey = "show-node-js-logo";

// Comprehensive environment validation and logging
console.log('🔍 Environment Configuration Validation:');
if (!PORT) {
    console.error('❌ PORT environment variable not set - using default');
    LDObserve.recordError(
        new Error('PORT environment variable not configured'),
        'system_session',
        'env_validation',
        {
            missingVariable: 'PORT',
            phase: 'startup-validation'
        },
        {
            level: 'warning',
            tags: ['environment', 'configuration', 'startup']
        }
    );
} else {
    console.log(`   ✅ PORT configured: ${PORT}`);
}

if (!process.env.LD_SDK_KEY) {
    console.error('❌ LD_SDK_KEY environment variable not set - LaunchDarkly features will not work');
    LDObserve.recordError(
        new Error('LD_SDK_KEY environment variable not configured'),
        'system_session',
        'env_validation',
        {
            missingVariable: 'LD_SDK_KEY',
            phase: 'startup-validation',
            impact: 'LaunchDarkly features disabled'
        },
        {
            level: 'error',
            tags: ['environment', 'configuration', 'launchdarkly', 'startup']
        }
    );
} else {
    console.log(`   ✅ LD_SDK_KEY configured: ${process.env.LD_SDK_KEY.substring(0, 10)}...`);
}

console.log(`   ✅ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   ✅ Feature flag key: ${featureFlagKey}`);

function showMessage(s) {
    console.log("*** " + s);
    console.log("");
}

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware to parse headers and set up context for observability
app.use((req, res, next) => {
    // Use LDObserve.parseHeaders() to extract or generate session and request IDs
    const { secureSessionId, requestId } = LDObserve.parseHeaders(req.headers);
    
    req.secureSessionId = secureSessionId;
    req.requestId = requestId;
    
    // Add observability headers to response for client correlation
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Session-ID', secureSessionId);
    
    next();
});

app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
    
    // Record server startup log with automatic context propagation
    LDObserve.recordLog(
        `Server started successfully on port ${PORT}`,
        'info',
        'system_session',
        'server_startup',
        {
            port: PORT,
            environment: process.env.NODE_ENV || 'development',
            phase: 'startup'
        }
    );
});

let clients = [];
let facts = '';

/**
 * Enhanced flag evaluation and SSE messaging function
 * Evaluates feature flags with the given context and sends results via SSE
 * Includes comprehensive logging for context changes and flag updates
 */
function evaluateAndSendFlags(context, wasUsingDefault, sessionId, requestId) {
    const contextType = wasUsingDefault ? 'transition' : 'update';
    const contextSource = context.key.startsWith('default-user-') ? 'default' : 'provided';
    
    console.log(`🔄 Starting flag evaluation for context ${contextType}`);
    console.log(`   Context source: ${contextSource}`);
    console.log(`   Context key: ${context.key}`);
    console.log(`   Context name: ${context.name}`);
    
    // Record context change event
    LDObserve.recordLog(
        `Context ${contextType} initiated - evaluating flags`,
        'info',
        sessionId,
        requestId,
        {
            contextType: contextType,
            contextSource: contextSource,
            context: context,
            wasUsingDefault: wasUsingDefault,
            phase: 'flag-evaluation-start'
        }
    );
    
    // Record context change metric
    LDObserve.recordIncr({
        name: "context_changes_total",
        value: 1,
        tags: {
            type: contextType,
            source: contextSource,
            endpoint: '/api/set-user-context'
        }
    });
    
    ldClient.variation(featureFlagKey, context, false, (err, flagValue) => {
        if (err) {
            console.error('❌ Flag evaluation error during context change:', err.message);
            console.error(`   Context: ${context.key} (${context.name})`);
            console.error(`   Context type: ${contextType}`);
            console.error('   This suggests the SDK may not be fully initialized or there\'s a configuration issue');
            
            // Record flag evaluation error with enhanced context
            LDObserve.recordError(
                err,
                sessionId,
                requestId,
                {
                    flagKey: featureFlagKey,
                    context: context,
                    contextType: contextType,
                    contextSource: contextSource,
                    wasUsingDefault: wasUsingDefault,
                    phase: 'flag-evaluation-error'
                },
                {
                    level: 'warning',
                    tags: ['launchdarkly', 'flag-evaluation', 'context-change', contextType]
                }
            );
            
            // Send fallback result via SSE with error indication
            const errorMessage = {
                info: "Flag evaluation failed - using fallback",
                source: "ERROR_FALLBACK",
                error: err.message,
                contextType: contextType,
                timestamp: new Date().toISOString()
            };
            SendRequest(JSON.stringify(errorMessage));
            
        } else {
            console.log(`✅ Flag evaluation successful after context ${contextType}`);
            console.log(`   Flag '${featureFlagKey}' = ${flagValue}`);
            console.log(`   Context: ${context.name} (${context.key})`);
            console.log(`   Sending result to ${clients.length} connected client(s) via SSE`);
            
            // Enhanced SSE message with context transition information
            const flagMessage = {
                info: "The server-side feature flag evaluation is",
                source: flagValue ? "TRUE" : "FALSE",
                contextType: contextType,
                contextSource: contextSource,
                contextKey: context.key,
                contextName: context.name,
                flagKey: featureFlagKey,
                timestamp: new Date().toISOString()
            };
            
            // Send enhanced flag result to frontend via SSE
            SendRequest(JSON.stringify(flagMessage));
            
            // Record successful flag re-evaluation with enhanced logging
            LDObserve.recordLog(
                `Flag evaluation completed after context ${contextType}: ${featureFlagKey} = ${flagValue}`,
                'info',
                sessionId,
                requestId,
                {
                    flagKey: featureFlagKey,
                    flagValue: flagValue,
                    context: context,
                    contextType: contextType,
                    contextSource: contextSource,
                    wasUsingDefault: wasUsingDefault,
                    connectedClients: clients.length,
                    phase: 'flag-evaluation-success'
                }
            );
            
            // Record flag evaluation success metric
            LDObserve.recordIncr({
                name: "flag_evaluations_total",
                value: 1,
                tags: {
                    flag_key: featureFlagKey,
                    flag_value: flagValue.toString(),
                    context_type: contextType,
                    context_source: contextSource,
                    phase: 'context-change'
                }
            });
            
            // Record flag value change if this was a transition from default
            if (wasUsingDefault) {
                LDObserve.recordLog(
                    `Context transitioned from default to provided - flag value may have changed`,
                    'info',
                    sessionId,
                    requestId,
                    {
                        flagKey: featureFlagKey,
                        newFlagValue: flagValue,
                        previousContextType: 'default',
                        newContextType: 'provided',
                        phase: 'context-transition-complete'
                    }
                );
            }
        }
    });
}

function eventsHandler(request, response, next) {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    };
    response.writeHead(200, headers);

    const data = `data: ${JSON.stringify(facts)}\n\n`;

    response.write(data);

    const clientId = Date.now();

    const newClient = {
        id: clientId,
        response
    };

    clients.push(newClient);

    // Record SSE connection metric
    LDObserve.recordMetric({
        name: "sse_connections_active",
        value: clients.length,
        tags: { 
            endpoint: '/events',
            action: 'connected'
        }
    });

    request.on('close', () => {
        console.log(`${clientId} Connection closed`);
        clients = clients.filter(client => client.id !== clientId);
        
        // Record SSE disconnection metric
        LDObserve.recordMetric({
            name: "sse_connections_active",
            value: clients.length,
            tags: { 
                endpoint: '/events',
                action: 'disconnected'
            }
        });
        
        // Record client disconnection with automatic context propagation
        LDObserve.recordLog(
            `SSE client disconnected`,
            'info',
            request.secureSessionId,
            request.requestId,
            {
                clientId: clientId,
                endpoint: '/events',
                remainingClients: clients.length
            }
        );
    });
}

app.get('/events', eventsHandler);

function sendEventsToAll(newFact) {
    clients.forEach(client => client.response.write(`data: ${JSON.stringify(newFact)}\n\n`))
}

async function addFact(request, response, next) {
    try {
        const newFact = request.body;
        
        // Validate the request body
        if (!newFact || typeof newFact !== 'object') {
            const error = new Error('Invalid request body: Expected object');
            
            // Record custom error with LaunchDarkly observability
            LDObserve.recordError(
                error,
                request.secureSessionId,
                request.requestId,
                {
                    endpoint: '/fact',
                    method: 'POST',
                    userAgent: request.headers['user-agent'],
                    contentType: request.headers['content-type']
                },
                {
                    level: 'error',
                    tags: ['validation', 'api']
                }
            );
            
            return response.status(400).json({ error: 'Invalid request body' });
        }
        
        facts = newFact;
        
        // Record API request increment (counter)
        LDObserve.recordIncr({
            name: "api_requests_total",
            value: 1,
            tags: { 
                endpoint: '/fact',
                method: 'POST',
                status: 'success'
            }
        });
        
        // Record facts processed increment (counter)
        LDObserve.recordIncr({
            name: "facts_processed_total",
            value: 1,
            tags: { 
                source: newFact.source || 'unknown',
                endpoint: '/fact'
            }
        });
        
        // Record successful fact addition with automatic context propagation
        LDObserve.recordLog(
            `New fact added successfully`,
            'info',
            request.secureSessionId,
            request.requestId,
            {
                endpoint: '/fact',
                method: 'POST',
                factInfo: newFact.info || 'unknown',
                source: newFact.source || 'unknown'
            }
        );
        
        response.json(newFact);
        return sendEventsToAll(newFact);
    } catch (error) {
        // Record unexpected errors
        LDObserve.recordError(
            error,
            request.secureSessionId,
            request.requestId,
            {
                endpoint: '/fact',
                method: 'POST',
                body: request.body
            },
            {
                level: 'error',
                tags: ['unexpected', 'api']
            }
        );
        
        response.status(500).json({ error: 'Internal server error' });
    }
}

app.post('/fact', addFact);

// Add context endpoint
app.get('/context', (req, res) => {
    const context = getUserContext();
    const usingDefault = isUsingDefault();
    
    res.json({
        context: context,
        isUsingDefault: usingDefault,
        message: usingDefault ? 'Using default context - ready for frontend context' : 'Using provided user context'
    });
});

// Add health check endpoint for Docker container communication
app.get('/api/health', (req, res) => {
    try {
        const context = getUserContext();
        const usingDefault = isUsingDefault();
        
        // Basic health check response
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'launchdarkly-demo-backend',
            version: process.env.SERVICE_VERSION || 'v1.0.0',
            environment: process.env.NODE_ENV || 'development',
            context: {
                available: !!context,
                isDefault: usingDefault,
                key: context?.key || null
            },
            sdk: {
                initialized: ldClient.initialized ? ldClient.initialized() : false,
                offline: ldClient.isOffline ? ldClient.isOffline() : false
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
        
        // Record health check metric
        LDObserve.recordIncr({
            name: "health_checks_total",
            value: 1,
            tags: { 
                endpoint: '/api/health',
                status: 'success'
            }
        });
        
    } catch (error) {
        console.error('❌ Health check error:', error.message);
        
        // Record health check error
        LDObserve.recordError(
            error,
            req.secureSessionId || 'health_check_session',
            req.requestId || 'health_check_request',
            {
                endpoint: '/api/health',
                method: 'GET'
            },
            {
                level: 'error',
                tags: ['health-check', 'error']
            }
        );
        
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: error.message
        });
    }
});

// Add endpoint to receive user context from frontend
app.post('/api/set-user-context', (req, res) => {
    try {
        const { userKey, name, kind } = req.body;
        
        // Validate the user context
        if (!userKey || typeof userKey !== 'string' || userKey.trim().length === 0) {
            console.warn('⚠️ Invalid user context received at /api/set-user-context');
            console.warn(`   userKey: ${JSON.stringify(userKey)} (type: ${typeof userKey})`);
            console.warn('   Validation failed: userKey must be a non-empty string');
            
            // Record validation error
            LDObserve.recordError(
                new Error('Invalid userKey validation failed'),
                req.secureSessionId,
                req.requestId,
                {
                    endpoint: '/api/set-user-context',
                    method: 'POST',
                    userKey: userKey,
                    userKeyType: typeof userKey,
                    validationFailure: 'userKey must be non-empty string'
                },
                {
                    level: 'warning',
                    tags: ['validation', 'user-context', 'bad-request']
                }
            );
            
            return res.status(400).json({ error: 'userKey is required and must be a non-empty string' });
        }
        
        // Check if we're transitioning from default context
        const wasUsingDefaultContext = isUsingDefault();
        
        // Update the user context (use exact name from frontend)
        const updatedContext = setUserContext(userKey, name);
        
        // Re-evaluate flags with the new context (whether transitioning from default or updating existing)
        console.log('🎯 User context received - re-evaluating flags');
        console.log(`   Previous context: ${wasUsingDefaultContext ? 'default' : 'provided'}`);
        console.log(`   New context: ${JSON.stringify(updatedContext, null, 2)}`);
        console.log(`   Context transition type: ${wasUsingDefaultContext ? 'default-to-provided' : 'provided-to-provided'}`);
        
        // Enhanced flag re-evaluation with comprehensive logging
        evaluateAndSendFlags(updatedContext, wasUsingDefaultContext, req.secureSessionId, req.requestId);
        
        // Record the context update
        LDObserve.recordLog(
            `User context ${wasUsingDefaultContext ? 'transitioned from default' : 'updated'} from frontend`,
            'info',
            req.secureSessionId,
            req.requestId,
            {
                userKey: userKey,
                name: name,
                kind: kind || "user",
                endpoint: '/api/set-user-context',
                wasUsingDefault: wasUsingDefaultContext
            }
        );
        
        // Record metric for context updates
        LDObserve.recordIncr({
            name: "user_context_updates_total",
            value: 1,
            tags: {
                source: 'frontend',
                endpoint: '/api/set-user-context',
                type: wasUsingDefaultContext ? 'transition' : 'update'
            }
        });
        
        res.json({
            success: true,
            message: `User context ${wasUsingDefaultContext ? 'transitioned from default' : 'updated'} successfully`,
            context: updatedContext,
            wasUsingDefault: wasUsingDefaultContext
        });
        
    } catch (error) {
        console.error('❌ Error in /api/set-user-context endpoint:', error.message);
        console.error('   Request body:', JSON.stringify(req.body, null, 2));
        console.error('   This indicates an unexpected error during context update');
        
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/api/set-user-context',
                method: 'POST',
                requestBody: req.body,
                userAgent: req.headers['user-agent'],
                contentType: req.headers['content-type']
            },
            {
                level: 'error',
                tags: ['context', 'user-update', 'unexpected-error']
            }
        );
        
        res.status(500).json({ 
            error: 'Failed to update user context',
            message: 'An unexpected error occurred while processing the context update'
        });
    }
});

// Add endpoint to check flag for any context
app.post('/check-flag', (req, res) => {
    const { context: testContext } = req.body;
    const contextToUse = testContext || getUserContext();
    
    ldClient.variation(featureFlagKey, contextToUse, false, (err, flagValue) => {
        res.json({
            context: contextToUse,
            flagKey: featureFlagKey,
            flagValue: flagValue,
            error: err?.message,
            timestamp: new Date().toISOString()
        });
    });
});

// Add flag status endpoint for debugging
app.get('/flag-status', (req, res) => {
    // Test multiple scenarios to debug the issue
    const tests = {};
    
    // Test 1: Our main flag with default false
    const currentContext = getUserContext();
    ldClient.variation(featureFlagKey, currentContext, false, (err1, flagValue1) => {
        tests.mainFlagDefaultFalse = { error: err1?.message, value: flagValue1 };
        
        // Test 2: Our main flag with default true
        ldClient.variation(featureFlagKey, currentContext, true, (err2, flagValue2) => {
            tests.mainFlagDefaultTrue = { error: err2?.message, value: flagValue2 };
            
            // Test 3: A flag that definitely doesn't exist
            ldClient.variation('non-existent-flag-test', currentContext, 'DEFAULT', (err3, flagValue3) => {
                tests.nonExistentFlag = { error: err3?.message, value: flagValue3 };
                
                // Test 4: Check SDK status
                const sdkStatus = {
                    initialized: ldClient.initialized ? ldClient.initialized() : 'unknown',
                    isOffline: ldClient.isOffline ? ldClient.isOffline() : 'unknown'
                };
                
                res.json({
                    flagKey: featureFlagKey,
                    context: currentContext,
                    timestamp: new Date().toISOString(),
                    tests: tests,
                    sdkStatus: sdkStatus,
                    environment: process.env.NODE_ENV,
                    sdkKey: process.env.LD_SDK_KEY ? `${process.env.LD_SDK_KEY.substring(0, 10)}...` : 'missing'
                });
            });
        });
    });
});

// Endpoint to demonstrate custom log recording
app.post('/test-log', (req, res) => {
    try {
        const { logLevel, message, category } = req.body;
        
        let metadata = {
            endpoint: '/test-log',
            method: 'POST',
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        };
        
        // Add category-specific metadata
        switch (category) {
            case 'user-action':
                metadata.actionType = 'demo-action';
                metadata.userId = 'demo-user-123';
                break;
            case 'system-event':
                metadata.systemComponent = 'demo-component';
                metadata.eventType = 'demo-event';
                break;
            case 'performance':
                metadata.duration = Math.floor(Math.random() * 1000);
                metadata.operation = 'demo-operation';
                break;
            case 'security':
                metadata.securityLevel = 'demo-level';
                metadata.source = 'demo-source';
                break;
            default:
                metadata.category = 'general';
        }
        
        // Record the custom log with automatic context propagation
        console.log('Recording custom log:', message);
        
        // Demonstrate both automatic context propagation and manual context setting
        if (category === 'auto-context') {
            // Use automatic context propagation (leave secureSessionId and requestId undefined)
            LDObserve.recordLog(
                message || 'Test log message with auto context',
                logLevel || 'info',
                undefined, // Let LaunchDarkly handle context propagation
                undefined, // Let LaunchDarkly handle context propagation
                metadata
            );
        } else {
            // Use manual context setting (provide secureSessionId and requestId)
            LDObserve.recordLog(
                message || 'Test log message',
                logLevel || 'info',
                req.secureSessionId,
                req.requestId,
                metadata
            );
        }
        
        res.json({
            success: true,
            message: 'Custom log recorded successfully',
            logLevel: logLevel || 'info',
            category: category || 'general',
            requestId: req.requestId,
            secureSessionId: req.secureSessionId
        });
        
    } catch (err) {
        // Record the error that occurred while trying to record a log
        LDObserve.recordError(
            err,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/test-log',
                method: 'POST',
                originalAction: 'Failed to record custom log'
            },
            {
                level: 'critical',
                tags: ['meta-error', 'system', 'logging']
            }
        );
        
        res.status(500).json({ error: 'Failed to record custom log' });
    }
});

// Endpoint to demonstrate custom metric recording
app.post('/test-metric', (req, res) => {
    try {
        const { metricName, metricValue, metricTags, metricUnit } = req.body;
        
        // Validate input
        if (!metricName || metricValue === undefined) {
            return res.status(400).json({ error: 'metricName and metricValue are required' });
        }
        
        const metric = {
            name: metricName,
            value: parseFloat(metricValue),
            tags: metricTags || {},
            unit: metricUnit || 'count'
        };
        
        // Record the custom metric
        console.log('Recording custom metric:', metric);
        const metricRecord = LDObserve.recordMetric(metric);
        
        res.json({
            success: true,
            message: 'Custom metric recorded successfully',
            metric: metric,
            metricRecord: metricRecord,
            requestId: req.requestId,
            secureSessionId: req.secureSessionId
        });
        
    } catch (err) {
        // Record the error that occurred while trying to record a metric
        LDObserve.recordError(
            err,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/test-metric',
                method: 'POST',
                originalAction: 'Failed to record custom metric'
            },
            {
                level: 'critical',
                tags: ['meta-error', 'system', 'metrics']
            }
        );
        
        res.status(500).json({ error: 'Failed to record custom metric' });
    }
});

// Endpoint to demonstrate custom increment recording
app.post('/test-increment', (req, res) => {
    try {
        const { metricName, incrementValue, metricTags, metricUnit } = req.body;
        
        // Validate input
        if (!metricName) {
            return res.status(400).json({ error: 'metricName is required' });
        }
        
        const increment = {
            name: metricName,
            value: incrementValue !== undefined ? parseFloat(incrementValue) : 1, // Default to 1
            tags: metricTags || {},
            unit: metricUnit || 'count'
        };
        
        // Record the custom increment
        console.log('Recording custom increment:', increment);
        const incrRecord = LDObserve.recordIncr(increment);
        
        res.json({
            success: true,
            message: 'Custom increment recorded successfully',
            increment: increment,
            incrRecord: incrRecord,
            requestId: req.requestId,
            secureSessionId: req.secureSessionId
        });
        
    } catch (err) {
        // Record the error that occurred while trying to record an increment
        LDObserve.recordError(
            err,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/test-increment',
                method: 'POST',
                originalAction: 'Failed to record custom increment'
            },
            {
                level: 'critical',
                tags: ['meta-error', 'system', 'increments']
            }
        );
        
        res.status(500).json({ error: 'Failed to record custom increment' });
    }
});

// Endpoint to demonstrate span functionality with startWithHeaders
app.get('/start-span-example', (req, res) => {
    try {
        // Start a span with information from request headers
        const { span } = LDObserve.startWithHeaders('example-span-a', req.headers);
        
        if (!span) {
            return res.status(500).json({ error: 'Failed to start span' });
        }
        
        // Set attributes on the active span
        LDObserve.setAttributes({
            "example-attribute": "example-value",
            "endpoint": "/start-span-example",
            "method": "GET",
            "user-agent": req.headers['user-agent'] || 'unknown'
        });
        
        // Simulate some work
        setTimeout(() => {
            // Set more attributes during processing
            LDObserve.setAttributes({
                "processing-stage": "completed",
                "response-status": "200"
            });
            
            res.json({
                message: "Hello World from start-span-example",
                spanId: span.id,
                spanName: span.name,
                timestamp: new Date().toISOString()
            });
            
            // End the span
            span.end();
        }, 100);
        
    } catch (error) {
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/start-span-example',
                method: 'GET'
            },
            {
                level: 'error',
                tags: ['span', 'example']
            }
        );
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to demonstrate span functionality with runWithHeaders
app.get('/run-span-example', async (req, res) => {
    try {
        // Run a callback with span information from request headers
        const result = await LDObserve.runWithHeaders('example-span-b', req.headers, async (span) => {
            // Set attributes on the span
            LDObserve.setAttributes({
                "example-attribute": "example-value",
                "endpoint": "/run-span-example",
                "method": "GET",
                "processing-type": "async"
            });
            
            // Simulate async work
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Set more attributes during processing
            LDObserve.setAttributes({
                "async-operation": "database-query",
                "query-duration": "150ms"
            });
            
            // Return the response data
            return {
                message: "Hello World from run-span-example",
                spanId: span.id,
                spanName: span.name,
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - span.startTime
            };
        });
        
        res.json(result);
        
    } catch (error) {
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/run-span-example',
                method: 'GET'
            },
            {
                level: 'error',
                tags: ['span', 'example', 'async']
            }
        );
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to demonstrate complex span operations
app.post('/complex-span-example', async (req, res) => {
    try {
        const { operation, data } = req.body;
        
        const result = await LDObserve.runWithHeaders('complex-operation-span', req.headers, async (span) => {
            // Set initial attributes
            LDObserve.setAttributes({
                "operation-type": operation || 'default',
                "data-size": JSON.stringify(data || {}).length,
                "endpoint": "/complex-span-example"
            });
            
            // Simulate multiple processing stages
            const stages = ['validation', 'processing', 'persistence', 'notification'];
            const results = {};
            
            for (const stage of stages) {
                const stageStart = Date.now();
                
                // Set stage-specific attributes
                LDObserve.setAttributes({
                    "current-stage": stage,
                    "stage-start-time": new Date().toISOString()
                });
                
                // Simulate stage processing time
                const processingTime = Math.floor(Math.random() * 100) + 50;
                await new Promise(resolve => setTimeout(resolve, processingTime));
                
                results[stage] = {
                    duration: Date.now() - stageStart,
                    status: 'completed'
                };
                
                // Update attributes with stage results
                LDObserve.setAttributes({
                    [`${stage}-duration`]: results[stage].duration,
                    [`${stage}-status`]: results[stage].status
                });
            }
            
            // Set final attributes
            LDObserve.setAttributes({
                "total-stages": stages.length,
                "operation-status": "success",
                "total-processing-time": Date.now() - span.startTime
            });
            
            return {
                message: "Complex operation completed successfully",
                operation: operation || 'default',
                stages: results,
                spanId: span.id,
                totalTime: Date.now() - span.startTime,
                timestamp: new Date().toISOString()
            };
        });
        
        res.json(result);
        
    } catch (error) {
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/complex-span-example',
                method: 'POST',
                operation: req.body?.operation
            },
            {
                level: 'error',
                tags: ['span', 'complex', 'operation']
            }
        );
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to check LaunchDarkly event status and flush events
app.get('/events-status', async (req, res) => {
    try {
        const status = getEventStatus();
        
        res.json({
            eventStatus: status,
            message: 'LaunchDarkly event status retrieved',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/events-status',
                method: 'GET'
            },
            {
                level: 'error',
                tags: ['events', 'status']
            }
        );
        
        res.status(500).json({ error: 'Failed to get event status' });
    }
});

// Endpoint to manually flush LaunchDarkly events
app.post('/flush-events', async (req, res) => {
    try {
        await flushEvents();
        
        res.json({
            success: true,
            message: 'LaunchDarkly events flushed successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/flush-events',
                method: 'POST'
            },
            {
                level: 'error',
                tags: ['events', 'flush']
            }
        );
        
        res.status(500).json({ error: 'Failed to flush events' });
    }
});

// Endpoint to demonstrate custom error recording
app.post('/test-error', (req, res) => {
    try {
        const { errorType, message } = req.body;
        
        let error;
        let metadata = {
            endpoint: '/test-error',
            method: 'POST',
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        };
        
        let options = {
            level: 'error',
            tags: ['test', 'demo']
        };
        
        switch (errorType) {
            case 'validation':
                error = new Error(message || 'Validation error occurred');
                metadata.validationType = 'custom';
                options.tags.push('validation');
                break;
                
            case 'business':
                error = new Error(message || 'Business logic error occurred');
                metadata.businessRule = 'demo-rule';
                options.tags.push('business-logic');
                break;
                
            case 'external':
                error = new Error(message || 'External service error occurred');
                metadata.externalService = 'demo-service';
                options.tags.push('external-service');
                break;
                
            default:
                error = new Error(message || 'Generic test error occurred');
                options.tags.push('generic');
        }
        
        // Record the custom error
        console.log('Recording custom error:', error.message);
        LDObserve.recordError(
            error,
            req.secureSessionId,
            req.requestId,
            metadata,
            options
        );
        
        res.json({
            success: true,
            message: 'Custom error recorded successfully',
            errorType,
            requestId: req.requestId,
            secureSessionId: req.secureSessionId
        });
        
    } catch (err) {
        // Record the error that occurred while trying to record an error
        LDObserve.recordError(
            err,
            req.secureSessionId,
            req.requestId,
            {
                endpoint: '/test-error',
                method: 'POST',
                originalError: 'Failed to record custom error'
            },
            {
                level: 'critical',
                tags: ['meta-error', 'system']
            }
        );
        
        res.status(500).json({ error: 'Failed to record custom error' });
    }
});

let http = require('http');

let urlparams = {
    host: 'localhost',
    port: PORT,
    path: '/fact',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json', 
    }
};

function SendRequest(datatosend) {
    function OnResponse(response) {
        var data = '';

        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function () {
            console.log(data);
        });
    }

    let request = http.request(urlparams, OnResponse);

    request.write(datatosend);
    request.end();
}

// Initialize immediately with default context - no waiting for initialization
showMessage("Initializing LaunchDarkly SDK with default context for immediate flag evaluation");

// Get default context immediately (this will generate one if none exists)
const defaultContext = getUserContext();
console.log('🎯 Starting immediate flag evaluation with default context');
console.log(`   Context: ${JSON.stringify(defaultContext, null, 2)}`);

// Record successful SDK initialization with automatic context propagation
LDObserve.recordLog(
    'LaunchDarkly SDK initialized with default context - ready for immediate flag evaluation',
    'info',
    'system_session',
    'sdk_initialization_immediate',
    {
        sdkVersion: '9.10.5',
        observabilityVersion: '0.3.1',
        phase: 'immediate-initialization',
        defaultContext: defaultContext
    }
);

// Record system health metrics
LDObserve.recordMetric({
    name: "system_health_status",
    value: 1, // 1 = healthy, 0 = unhealthy
    tags: { 
        service: 'launchdarkly-demo-server',
        component: 'launchdarkly-sdk',
        status: 'initialized-immediate'
    }
});

// Record memory usage metric
const memUsage = process.memoryUsage();
LDObserve.recordMetric({
    name: "memory_usage_bytes",
    value: memUsage.heapUsed,
    unit: 'bytes',
    tags: { 
        type: 'heap_used',
        service: 'launchdarkly-demo-server'
    }
});

// Evaluate flags immediately with default context - no waiting
ldClient.variation(featureFlagKey, defaultContext, false, (err, flagValue) => {
    if (err) {
        console.error('❌ Flag evaluation error with default context:', err.message);
        console.error('   Note: This may be expected during initial SDK connection - using fallback value');
        
        // Record flag evaluation error but don't fail - use fallback
        LDObserve.recordError(
            err,
            'system_session',
            'default_context_flag_evaluation',
            {
                flagKey: featureFlagKey,
                context: defaultContext,
                phase: 'immediate-startup',
                fallbackUsed: true
            },
            {
                level: 'info', // Reduced severity since this is expected behavior
                tags: ['launchdarkly', 'flag-evaluation', 'default-context', 'fallback']
            }
        );
        
        // Use fallback value and continue operation
        const fallbackValue = false;
        console.log(`ℹ️ Using fallback value for '${featureFlagKey}': ${fallbackValue}`);
        
        // Send the fallback result to frontend via SSE with error context
        const fallbackMessage = {
            info: "The server-side feature flag evaluation is",
            source: fallbackValue ? "TRUE" : "FALSE",
            eventType: "fallback-evaluation",
            flagKey: featureFlagKey,
            contextKey: defaultContext.key,
            contextName: defaultContext.name,
            contextType: "default",
            error: err.message,
            timestamp: new Date().toISOString()
        };
        SendRequest(JSON.stringify(fallbackMessage));
    } else {
        console.log(`✅ Feature flag '${featureFlagKey}' is ${flagValue} for default context: ${defaultContext.name}`);
        
        // Send enhanced flag result to frontend via SSE
        const initialFlagMessage = {
            info: "The server-side feature flag evaluation is",
            source: flagValue ? "TRUE" : "FALSE",
            eventType: "initial-evaluation",
            flagKey: featureFlagKey,
            contextKey: defaultContext.key,
            contextName: defaultContext.name,
            contextType: "default",
            timestamp: new Date().toISOString()
        };
        SendRequest(JSON.stringify(initialFlagMessage));
        
        // Record successful flag evaluation with default context
        LDObserve.recordLog(
            `Feature flag evaluated with default context: ${featureFlagKey} = ${flagValue}`,
            'info',
            'system_session',
            'default_context_flag_evaluation_success',
            {
                flagKey: featureFlagKey,
                flagValue: flagValue,
                context: defaultContext,
                phase: 'immediate-startup'
            }
        );
    }
});

// Comprehensive startup logging
console.log('🔄 Backend ready to receive user context from frontend for context transition');
console.log('🚀 Backend is now serving requests and evaluating flags immediately');

// Log comprehensive startup status
console.log('📊 Comprehensive Startup Status:');
console.log(`   ✅ Server listening on port: ${PORT}`);
console.log(`   ✅ LaunchDarkly SDK initialized with default context`);
console.log(`   ✅ Default context ready for immediate flag evaluation`);
console.log(`   ✅ SSE endpoint available at /events`);
console.log(`   ✅ Context API endpoint available at /api/set-user-context`);
console.log(`   ✅ Error handling and logging configured`);
console.log(`   ✅ Observability and metrics recording enabled`);

// Record comprehensive startup completion
LDObserve.recordLog(
    'Backend startup completed successfully - all systems operational',
    'info',
    'system_session',
    'startup_completion',
    {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        sdkKey: process.env.LD_SDK_KEY ? `${process.env.LD_SDK_KEY.substring(0, 10)}...` : 'MISSING',
        defaultContextActive: isUsingDefault(),
        phase: 'startup-complete',
        availableEndpoints: ['/events', '/api/set-user-context', '/context', '/flag-status'],
        observabilityEnabled: true
    }
);

// Set up SDK initialization monitoring in the background (non-blocking)
ldClient.waitForInitialization().then(() => {
    showMessage("SDK fully initialized in background - enhanced flag evaluation now available");
    
    // Check SDK status
    console.log('🔍 SDK Background Initialization Complete:');
    console.log(`   - Initialized: ${ldClient.initialized()}`);
    console.log(`   - Offline: ${ldClient.isOffline()}`);
    console.log(`   - SDK Key: ${process.env.LD_SDK_KEY ? process.env.LD_SDK_KEY.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Re-evaluate flags with full SDK capabilities now available
    const currentContext = getUserContext();
    ldClient.variation(featureFlagKey, currentContext, false, (err, flagValue) => {
        if (!err) {
            console.log(`🔄 Re-evaluated flag with full SDK: '${featureFlagKey}' = ${flagValue}`);
            
            // Send updated flag result to frontend via SSE with SDK initialization context
            const sdkInitMessage = {
                info: "The server-side feature flag evaluation is",
                source: flagValue ? "TRUE" : "FALSE",
                eventType: "sdk-initialized",
                flagKey: featureFlagKey,
                contextKey: currentContext.key,
                contextName: currentContext.name,
                contextType: isUsingDefault() ? "default" : "provided",
                timestamp: new Date().toISOString()
            };
            SendRequest(JSON.stringify(sdkInitMessage));
        }
    });
    
}).catch((error) => {
    console.warn('⚠️ LaunchDarkly SDK background initialization failed:', error.message);
    console.warn('   Backend will continue operating with fallback flag values');
    console.warn('   This could be due to:');
    console.warn('   1. Invalid SDK key');
    console.warn('   2. Network connectivity issues');
    console.warn('   3. LaunchDarkly service unavailable');
    console.warn('   4. SDK timeout (10 seconds)');
    
    // Record initialization failure but don't exit - continue with fallbacks
    LDObserve.recordError(
        error,
        'system_session',
        'sdk_background_initialization_failure',
        {
            sdkKey: process.env.LD_SDK_KEY ? process.env.LD_SDK_KEY.substring(0, 10) + '...' : 'MISSING',
            timeout: 10,
            phase: 'background-initialization',
            continuingOperation: true
        },
        {
            level: 'warning', // Reduced severity since we continue operating
            tags: ['launchdarkly', 'initialization', 'background-failure']
        }
    );
    
    console.warn('   ✅ Backend continues operating with default context and fallback values');
});

// Set up flag change listener with enhanced logging
ldClient.on(`update:${featureFlagKey}`, () => {
    const currentContext = getUserContext();
    const isUsingDefaultContext = isUsingDefault();
    const changeId = `flag_change_${Date.now()}`;
    
    showMessage(`a flag was changed: '${featureFlagKey}'`);
    
    console.log('🚩 Flag change detected from LaunchDarkly');
    console.log(`   Flag: ${featureFlagKey}`);
    console.log(`   Current context: ${currentContext.key} (${currentContext.name})`);
    console.log(`   Context type: ${isUsingDefaultContext ? 'default' : 'provided'}`);
    
    // Record flag change event with enhanced context information
    LDObserve.recordLog(
        `Feature flag change detected: ${featureFlagKey}`,
        'info',
        'system_session',
        changeId,
        {
            flagKey: featureFlagKey,
            context: currentContext,
            contextType: isUsingDefaultContext ? 'default' : 'provided',
            phase: 'flag-change-event',
            eventType: 'flag-update',
            connectedClients: clients.length
        }
    );
    
    ldClient.variation(featureFlagKey, currentContext, false, (err, flagValue) => {
        if (err) {
            console.error('❌ Flag evaluation error during flag change event:', err.message);
            console.error(`   Context: ${currentContext.key} (${currentContext.name})`);
            
            // Record LaunchDarkly flag evaluation error on flag change
            LDObserve.recordError(
                err,
                'system_session',
                changeId,
                {
                    flagKey: featureFlagKey,
                    context: currentContext,
                    contextType: isUsingDefaultContext ? 'default' : 'provided',
                    phase: 'flag-change-evaluation-error'
                },
                {
                    level: 'warning',
                    tags: ['launchdarkly', 'flag-evaluation', 'flag-change', 'error']
                }
            );
            
            // Send error message via SSE
            const errorMessage = {
                info: "Flag change evaluation failed",
                source: "FLAG_CHANGE_ERROR",
                error: err.message,
                flagKey: featureFlagKey,
                timestamp: new Date().toISOString()
            };
            SendRequest(JSON.stringify(errorMessage));
            
        } else {
            console.log(`✅ Flag change evaluation successful: '${featureFlagKey}' = ${flagValue}`);
            console.log(`   Context: ${currentContext.name} (${currentContext.key})`);
            console.log(`   Notifying ${clients.length} connected client(s) via SSE`);
            
            showMessage(`Feature flag '${featureFlagKey}' is now ${flagValue} for this context`);
            
            // Enhanced SSE message for flag changes
            const flagChangeMessage = {
                info: "The server-side feature flag evaluation is",
                source: flagValue ? "TRUE" : "FALSE",
                eventType: "flag-change",
                flagKey: featureFlagKey,
                contextKey: currentContext.key,
                contextName: currentContext.name,
                contextType: isUsingDefaultContext ? 'default' : 'provided',
                timestamp: new Date().toISOString()
            };
            
            SendRequest(JSON.stringify(flagChangeMessage));
            
            // Record flag change increment (counter)
            LDObserve.recordIncr({
                name: "flag_changes_total",
                value: 1,
                tags: { 
                    flag_key: featureFlagKey, 
                    new_value: flagValue.toString(),
                    context_kind: currentContext.kind,
                    context_type: isUsingDefaultContext ? 'default' : 'provided',
                    environment: process.env.NODE_ENV || 'development'
                }
            });
            
            // Record flag evaluation increment for the change event
            LDObserve.recordIncr({
                name: "flag_evaluations_total",
                value: 1,
                tags: { 
                    flag_key: featureFlagKey, 
                    flag_value: flagValue.toString(),
                    context_kind: currentContext.kind,
                    context_type: isUsingDefaultContext ? 'default' : 'provided',
                    phase: 'flag-change'
                }
            });
            
            // Record new flag value after change with enhanced context information
            LDObserve.recordLog(
                `Feature flag updated via flag change event: ${featureFlagKey} = ${flagValue}`,
                'info',
                'system_session',
                `${changeId}_result`,
                {
                    flagKey: featureFlagKey,
                    newValue: flagValue,
                    context: currentContext,
                    contextType: isUsingDefaultContext ? 'default' : 'provided',
                    connectedClients: clients.length,
                    phase: 'flag-change-result'
                }
            );
        }
    });
});

// Global error handler middleware (should be last)
app.use((err, req, res, next) => {
    // Comprehensive error logging for unhandled application errors
    console.error('🚨 Unhandled Application Error:');
    console.error(`   Error: ${err.message}`);
    console.error(`   URL: ${req.url}`);
    console.error(`   Method: ${req.method}`);
    console.error(`   Session: ${req.secureSessionId || 'unknown'}`);
    console.error(`   Request ID: ${req.requestId || 'unknown'}`);
    console.error(`   Stack: ${err.stack}`);
    
    // Record unhandled application errors with comprehensive context
    LDObserve.recordError(
        err,
        req.secureSessionId || 'unknown_session',
        req.requestId || 'unknown_request',
        {
            url: req.url,
            method: req.method,
            headers: req.headers,
            body: req.body,
            userAgent: req.headers['user-agent'],
            contentType: req.headers['content-type'],
            phase: 'request-handling',
            errorType: 'unhandled-middleware'
        },
        {
            level: 'error',
            tags: ['unhandled', 'middleware', 'application', 'critical']
        }
    );
    
    console.error('   Response: 500 Internal Server Error');
    res.status(500).json({ error: 'Internal server error' });
});

// Handle uncaught exceptions with comprehensive logging
process.on('uncaughtException', (error) => {
    console.error('🚨 CRITICAL: Uncaught Exception - Server will exit');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    console.error(`   Process PID: ${process.pid}`);
    console.error(`   Memory Usage: ${JSON.stringify(process.memoryUsage())}`);
    console.error('   This is a critical error that will cause the server to exit');
    
    LDObserve.recordError(
        error,
        'system_session',
        `uncaught_${Date.now()}`,
        {
            type: 'uncaughtException',
            phase: 'runtime',
            processId: process.pid,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            platform: process.platform,
            nodeVersion: process.version
        },
        {
            level: 'critical',
            tags: ['uncaught', 'system', 'process', 'fatal']
        }
    );
    
    console.error('🚨 Server exiting due to uncaught exception');
    process.exit(1);
});

// Handle unhandled promise rejections with comprehensive logging
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 WARNING: Unhandled Promise Rejection');
    console.error(`   Reason: ${reason}`);
    console.error(`   Promise: ${promise}`);
    console.error(`   Process PID: ${process.pid}`);
    
    if (reason instanceof Error) {
        console.error(`   Error Stack: ${reason.stack}`);
    }
    
    const error = reason instanceof Error ? reason : new Error(String(reason));
    
    LDObserve.recordError(
        error,
        'system_session',
        `unhandled_rejection_${Date.now()}`,
        {
            type: 'unhandledRejection',
            promise: promise.toString(),
            phase: 'runtime',
            processId: process.pid,
            reasonType: typeof reason,
            isError: reason instanceof Error
        },
        {
            level: 'critical',
            tags: ['unhandled-rejection', 'system', 'promise', 'async']
        }
    );
    
    console.error('   Server continuing operation - but this should be investigated');
});