import React, { useState, useEffect, createContext } from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './index.css';
import App from './App';

import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk';
import Observability, { LDObserve } from '@launchdarkly/observability';
import SessionReplay, { LDRecord } from '@launchdarkly/session-replay';

// Create LaunchDarkly context
const LDContext = createContext(null);

// Generate a unique GUID for the client context
const generateGUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Import enhanced backend connectivity utilities
import { sendUserContextToBackend } from './utils/backendConnectivity';

// Initialize LaunchDarkly with plugins
const LD_CLIENTSIDE_ID = import.meta.env.VITE_LD_CLIENTSIDE_ID;
const userKey = generateGUID();
const userName = `Full-stack User (${userKey.substring(0, 8)})`;

console.log('🚀 Starting LaunchDarkly initialization...');
console.log('👤 User context:', { key: userKey.substring(0, 8) + '...', name: userName });
console.log('🔧 Client-side ID:', LD_CLIENTSIDE_ID);


// Send the user context to backend with enhanced error handling
sendUserContextToBackend(userKey, userName, {
  enableRetry: true,
  onError: (error) => {
    console.warn('⚠️ Failed to synchronize user context with backend:', error.message);
    console.log('🔄 Application will continue in frontend-only mode');
  },
  onSuccess: (data) => {
    console.log('✅ User context synchronized with backend successfully');
  }
});

const context = {
  "kind": "user",
  "key": userKey,
  "name": userName
};

// LaunchDarkly Provider Component
const LDProvider = ({ children }) => {
  const [LDClient, setLDClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const clientSideID = LD_CLIENTSIDE_ID;

    // If no LaunchDarkly client ID is provided, skip initialization
    if (!clientSideID) {
      console.warn("LaunchDarkly client-side ID not found. Skipping LaunchDarkly initialization.");
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const initializeLDClient = async () => {
      try {
        console.log('🔄 Initializing LaunchDarkly SDK...');
        const LDProviderComponent = await asyncWithLDProvider({
          clientSideID: clientSideID,
          context,
          timeout: 2, // Set client init timeout (seconds)
          waitForInitialization: true, // Wait for SDK to fully initialize before rendering
          options: {
            streaming: true, // Explicitly enable streaming for real-time updates
            plugins: [
              new Observability({
                manualStart: true,
                serviceName: 'launchdarkly-demo-client',
                serviceVersion: import.meta.env.VITE_APP_VERSION || 'v1.0.0',
                environment: import.meta.env.NODE_ENV || 'development',
                version: 'v1.2.0', // Version for session and error tracking
                
                // Fullstack mapping - attribute frontend requests to backend
                tracingOrigins: true, // Include all domains and subdomains
                // Alternative: tracingOrigins: ['localhost:5000', 'server:5000'], // Specific backend URLs
                
                // Network recording configuration
                networkRecording: {
                  enabled: true,
                  recordHeadersAndBody: true,
                  
                  // Headers to redact (in addition to defaults: Authorization, Cookie, Proxy-Authorization)
                  networkHeadersToRedact: [
                    'X-API-Key',
                    'X-Auth-Token',
                    'X-Session-Token'
                  ],
                  
                  // Body keys to redact from request/response bodies
                  networkBodyKeysToRedact: [
                    'password',
                    'token',
                    'secret',
                    'apiKey',
                    'creditCard',
                    'ssn'
                  ],
                  
                  // Disable WebSocket event recording (optional)
                  disableWebSocketEventRecordings: false,
                  
                  // Custom request/response sanitizer (optional)
                  requestResponseSanitizer: (requestResponse) => {
                    // Example: Redact sensitive data from specific endpoints
                    if (requestResponse.request.url.includes('/auth/')) {
                      // Redact entire response body for auth endpoints
                      return {
                        ...requestResponse,
                        response: {
                          ...requestResponse.response,
                          body: '[REDACTED - AUTH ENDPOINT]'
                        }
                      };
                    }
                    return requestResponse; // Return unchanged for other requests
                  }
                },
                
                // URL blocklist - don't record these URLs at all
                urlBlocklist: [
                  'https://analytics.google.com',
                  'https://www.googletagmanager.com',
                  // Add any internal APIs that should never be recorded
                ],
                
                // Console recording configuration
                disableConsoleRecording: false, // Enable console message recording
                consoleMethodsToRecord: ['log', 'warn', 'error', 'info'], // Which console methods to record
                
                // Proxy configuration (if needed to avoid blocking)
                // backendUrl: 'https://pub.ld.yourdomain.com', // Custom proxy endpoint
                // otel: { otlpEndpoint: 'https://otel.ld.yourdomain.com' }, // Custom OTEL endpoint
              }),
              new SessionReplay({
                manualStart: true, // Manual start - wait for user consent
                privacySetting: 'default', // 'strict' (most private), 'default' (redact PII), or 'none' (no obfuscation)
                sampleRate: 1.0, // Record 100% of sessions for demo purposes
                version: 'v1.2.0', // Version for session tracking

                
                // Privacy and masking configuration
                maskAllText: false, // Don't mask all text for demo visibility
                maskAllInputs: true, // Mask input fields for privacy
                blockClass: 'ld-block', // CSS class to block elements from recording
                ignoreClass: 'ld-ignore', // CSS class to ignore elements
                
                // Canvas recording configuration
                enableCanvasRecording: true, // Enable HTML5 Canvas and WebGL recording
                samplingStrategy: {
                  canvas: 2, // Snapshot canvas at 2 FPS
                  canvasMaxSnapshotDimension: 480, // Max resolution 480p for performance
                },
                
                // Console recording (can be configured per plugin)
                disableConsoleRecording: false, // Enable console message recording in session replay
                consoleMethodsToRecord: ['log', 'warn', 'error', 'info'] // Which console methods to record
              })
            ]
          }
        });

        console.log('✅ LaunchDarkly SDK initialized successfully');
        setLDClient(() => LDProviderComponent);
        setIsLoading(false);
      } catch (error) {
        console.error("Error initializing LaunchDarkly:", error);
        setHasError(true);
        setIsLoading(false);
      }
    };

    initializeLDClient();
  }, []);

  // If still loading LaunchDarkly, show loading state
  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{minHeight: '100vh'}}>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Initializing LaunchDarkly...</p>
        </div>
      </div>
    );
  }

  // If LaunchDarkly failed to initialize or no client ID provided, render children without LaunchDarkly
  if (hasError || !LDClient) {
    return (
      <LDContext.Provider value={null}>
        {children}
      </LDContext.Provider>
    );
  }

  return (
    <LDContext.Provider value={LDClient}>
      <LDClient>{children}</LDClient>
    </LDContext.Provider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <LDProvider>
    <App />
  </LDProvider>
);


