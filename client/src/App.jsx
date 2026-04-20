import React, { useEffect, useState, useMemo, memo } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { withLDConsumer } from 'launchdarkly-react-client-sdk';
import './App.css';
import nodejsLogo from "./img/nodejsLogo.svg";
import ldLogo from "./img/ldLogo_gray.svg";
import ClientLogo from "./components/clientLogo.jsx";
import BackendErrorDisplay from "./components/BackendErrorDisplay.jsx";
import ConnectionStatusIndicator from "./components/ConnectionStatusIndicator.jsx";
import { useBackendConnectivity } from "./hooks/useBackendConnectivity.js";
import { LDObserve } from '@launchdarkly/observability';
import { LDRecord } from '@launchdarkly/session-replay';

// Expose LDRecord globally for debugging
if (typeof window !== 'undefined') {
  window.LDRecord = LDRecord;
  window.LDObserve = LDObserve;
}

// Memoized Server Logo Component - only re-renders when logo or facts change
const ServerLogoSection = memo(({ logo, facts, applicationTheme }) => (
  <div className="col-md-6">
    <div className="card bg-dark text-white h-100">
      <div className="card-body text-center">
        <h3 className="card-title h5 mb-3">Node.js Server</h3>
        <img src={logo} className="App-logo" alt="" style={{ height: '60px' }} />
        <p className={`mt-3 mb-0 ${applicationTheme ? 'text-light' : 'opacity-75'}`}>
          {facts.info} <strong>{facts.source}</strong>
        </p>
      </div>
    </div>
  </div>
));

// Memoized Client Logo Section - never re-renders unless ClientLogo changes
const ClientLogoSection = memo(({ applicationTheme }) => (
  <div className="col-md-6">
    <div className={`card text-white h-100 ${applicationTheme ? 'bg-dark' : 'bg-primary'}`}>
      <div className="card-body text-center">
        <h3 className="card-title h5 mb-3">React Client</h3>
        <ClientLogo />
      </div>
    </div>
  </div>
));

function App({ flags, ldClient }) {
  const [facts, setFacts] = useState([]);
  const [listening, setListening] = useState(false);
  const [userConsent, setUserConsent] = useState(false);
  const [observabilityStarted, setObservabilityStarted] = useState(false);
  const [sessionReplayStarted, setSessionReplayStarted] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [recordingState, setRecordingState] = useState('NotRecording');
  const [manuallyStoppedReplay, setManuallyStoppedReplay] = useState(false);

  // Backend connectivity management
  const {
    connectionStatus,
    userFriendlyError,
    isRetrying,
    retryCount,
    isFrontendOnlyMode,
    retryConnection,
    clearError
  } = useBackendConnectivity();

  // Check if LaunchDarkly is ready - prevent flicker by waiting for flags to be available
  const isLDReady = ldClient && flags !== undefined;



  // Show loading state while LaunchDarkly initializes
  if (!isLDReady) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{minHeight: '100vh'}}>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className={themeClasses.loadingText}>Loading feature flags...</p>
        </div>
      </div>
    );
  }

  // Get flag values for use throughout component
  const enableObservability = flags?.enableObservability !== undefined ? flags.enableObservability : false;
  const enableSessionReplay = flags?.enableSessionReplay !== undefined ? flags.enableSessionReplay : false;
  const applicationTheme = flags?.applicationTheme !== undefined ? flags.applicationTheme : false; // false = light, true = dark

  // Effect to listen for flag changes and log them
  useEffect(() => {
    if (ldClient) {
      const handleFlagChange = (flagKey) => {
        const newValue = flags?.[flagKey];
        console.log(`🔄 Flag changed: ${flagKey} = ${newValue}`);
      };

      // Listen for all flag changes
      ldClient.on('change', handleFlagChange);

      // Cleanup listener on unmount
      return () => {
        ldClient.off('change', handleFlagChange);
      };
    }
  }, [ldClient, flags]);

  // Effect to handle plugin initialization based on feature flags and user consent
  useEffect(() => {
    // Wait for ldClient to be ready before starting plugins
    if (!ldClient) {
      return;
    }
      
    // Start observability if feature flag is enabled and user consent is given
    if (enableObservability && userConsent && !observabilityStarted) {
        try {
          LDObserve.start();
          setObservabilityStarted(true);
          console.log('✅ Observability plugin started');
          
          // Record initialization log
          LDObserve.recordLog('Frontend observability started', 'info', {
            component: 'App',
            phase: 'plugin-initialization',
            featureFlagEnabled: enableObservability,
            userConsent: userConsent || 'auto-granted'
          });
        } catch (error) {
          console.error('❌ Failed to start observability plugin:', error);
        }
      }
      
    // Start session replay if feature flag is enabled and user consent is given and not manually stopped
    if (enableSessionReplay && userConsent && !sessionReplayStarted && !manuallyStoppedReplay) {
        (async () => {
          try {
            // Check if the plugin is properly loaded
            if (!LDRecord._isLoaded) {
              console.error('❌ SessionReplay plugin is not loaded!');
              return;
            }
            
            // Start recording
            await LDRecord.start({
              forceNew: true,
              silent: false
            });
            
            setSessionReplayStarted(true);
            
            // Check recording state after start completes
            const currentState = LDRecord.getRecordingState();
            setRecordingState(currentState);
            console.log('✅ Session replay started:', currentState);
          
          // Add session properties for this demo session
          LDRecord.addSessionProperties({
            plan: 'demo',
            userType: 'demo-user',
            feature: 'observability-demo',
            environment: 'development',
            version: 'v1.2.0'
          });
          
          // Get session URL after a delay
          setTimeout(async () => {
            try {
              const sessionResult = LDRecord.getSession();
              if (sessionResult && typeof sessionResult.then === 'function') {
                const { url, urlWithTimestamp } = await sessionResult;
                setSessionUrl(url);
                console.log('📹 Session URL:', url);
                console.log('🕐 Current timestamp URL:', urlWithTimestamp);
              } else if (sessionResult && sessionResult.url) {
                setSessionUrl(sessionResult.url);
                console.log('📹 Session URL:', sessionResult.url);
                console.log('🕐 Current timestamp URL:', sessionResult.urlWithTimestamp);
              }
            } catch (error) {
              console.error('Failed to get session URL:', error);
            }
          }, 2000);
          
          // Record session replay initialization event
          if (observabilityStarted) {
            LDObserve.recordLog('Frontend session replay started', 'info', {
              component: 'App',
              phase: 'plugin-initialization',
              featureFlagEnabled: enableSessionReplay,
              userConsent: userConsent
            });
          }
          } catch (error) {
            console.error('❌ Failed to start session replay plugin:', error);
          }
        })();
      }
  }, [enableObservability, enableSessionReplay, ldClient, userConsent, observabilityStarted, sessionReplayStarted]);

  useEffect(() => {
    if (!listening) {
      const events = new EventSource('/events');

      events.onmessage = (event) => {
        const parsedData = JSON.parse(event.data);

        setFacts(function (facts) {
          facts = parsedData;
          return facts;
        });

        // Record SSE message received (only if observability is started)
        if (observabilityStarted) {
          LDObserve.recordLog('SSE message received from backend', 'info', {
            component: 'App',
            eventType: 'sse-message',
            factSource: parsedData.source
          });

          // Record metric for SSE messages
          LDObserve.recordMetric({
            name: 'sse_messages_received',
            value: 1,
            tags: {
              source: parsedData.source || 'unknown',
              component: 'frontend'
            }
          });
        }

        // Session replay automatically records user interactions - no manual event recording needed
      };

      events.onerror = (error) => {
        // Record SSE connection errors (only if observability is started)
        if (observabilityStarted) {
          LDObserve.recordError(new Error('SSE connection error'), {
            component: 'App',
            eventType: 'sse-error'
          });
        }
      };

      setListening(true);
    }
  }, [listening, facts, observabilityStarted, sessionReplayStarted]);

  // Function to simulate user consent (for demo purposes)
  const handleUserConsent = () => {
    console.log('👤 User consent granted');
    setUserConsent(true);
  };

  // Global error handler for unhandled errors
  useEffect(() => {
    const handleGlobalError = (event) => {
      if (observabilityStarted) {
        LDObserve.recordError(
          event.error || new Error(event.message),
          'Unhandled JavaScript error',
          {
            component: 'GlobalErrorHandler',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
          }
        );
        console.error('Global error recorded:', event.error);
      }
    };

    const handleUnhandledRejection = (event) => {
      if (observabilityStarted) {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        LDObserve.recordError(
          error,
          'Unhandled Promise rejection',
          {
            component: 'GlobalErrorHandler',
            type: 'unhandledRejection',
            reason: String(event.reason),
            timestamp: new Date().toISOString(),
            url: window.location.href
          }
        );
        console.error('Unhandled promise rejection recorded:', event.reason);
      }
    };

    // Add global error listeners
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [observabilityStarted]);

  // Memoize logo selection to prevent unnecessary re-renders
  const logo = useMemo(() => {
    return facts.source === "TRUE" ? nodejsLogo : ldLogo;
  }, [facts.source]);

  // Memoize theme-dependent CSS classes
  const themeClasses = useMemo(() => ({
    container: `container-xl py-4 ${applicationTheme ? 'bg-dark text-light' : 'bg-white text-dark'}`,
    pageWrapper: `${applicationTheme ? 'bg-dark' : 'bg-white'}`,
    card: `card shadow-sm mb-4 ${applicationTheme ? 'bg-dark text-light' : 'bg-white'}`,
    cardStyle: applicationTheme ? { border: '2px solid #666' } : { border: '2px solid #333' },
    headerTitle: `display-5 fw-bold mb-2 ${applicationTheme ? 'text-light' : 'text-dark'}`,
    headerSubtitle: `lead ${applicationTheme ? 'text-light' : 'text-muted'}`,
    themeAlert: `alert ${applicationTheme ? 'alert-dark' : 'alert-light'} mb-0`,
    // Text colors for better readability in dark mode
    mutedText: applicationTheme ? 'text-light' : 'text-muted',
    secondaryText: applicationTheme ? 'text-light' : 'text-secondary',
    labelText: `form-label small ${applicationTheme ? 'text-light' : 'text-muted'}`,
    sectionHeading: `fw-semibold mb-3 ${applicationTheme ? 'text-light' : 'text-secondary'}`,
    loadingText: `mt-3 ${applicationTheme ? 'text-light' : 'text-muted'}`,
    smallText: `small ${applicationTheme ? 'text-light' : 'text-muted'}`,
    // Button classes for better visibility in dark mode
    secondaryButton: `btn btn-sm ${applicationTheme ? 'btn-outline-light' : 'btn-secondary'}`,
    secondaryButtonBlock: `btn btn-sm w-100 mb-2 ${applicationTheme ? 'btn-outline-light' : 'btn-secondary'}`,
    outlineSecondaryButton: `btn btn-sm ${applicationTheme ? 'btn-outline-light' : 'btn-outline-secondary'}`,
    darkButton: `btn btn-sm w-100 mb-2 ${applicationTheme ? 'btn-outline-light' : 'btn-dark'}`,
    // Status icon colors that work better in dark mode
    successIcon: applicationTheme ? 'text-success' : 'text-success',
    warningIcon: applicationTheme ? 'text-warning' : 'text-warning', 
    dangerIcon: applicationTheme ? 'text-danger' : 'text-danger',
    // Alert classes for flag status - use dark alerts in dark mode for better contrast
    flagAlertInfo: applicationTheme ? 'alert-dark' : 'alert-info',
    flagAlertSecondary: applicationTheme ? 'alert-dark' : 'alert-secondary',
    flagAlertText: 'text-dark'
  }), [applicationTheme]);

  return (
    <Router 
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <div className={themeClasses.pageWrapper} style={{minHeight: '100vh'}}>
        <div className={themeClasses.container}>
        {/* Header */}
        <div className="text-center mb-5">
          <h1 className={themeClasses.headerTitle}>
            LaunchDarkly Full-Stack Demo
          </h1>
          <p className={themeClasses.headerSubtitle}>
            Feature Flags • Observability • Session Replay
          </p>
          
          {/* Backend Connection Status */}
          <div className="mt-3">
            <ConnectionStatusIndicator 
              connectionStatus={connectionStatus}
              isRetrying={isRetrying}
              retryCount={retryCount}
              className="justify-content-center"
            />
            {isFrontendOnlyMode && (
              <div className="mt-2">
                <span className="badge bg-info">Frontend-Only Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* Backend Error Display */}
        {userFriendlyError && (
          <BackendErrorDisplay
            error={userFriendlyError}
            onRetry={() => retryConnection('demo-user', 'Demo User')}
            onDismiss={clearError}
            isRetrying={isRetrying}
            retryCount={retryCount}
            className="mb-4"
          />
        )}

        {/* Feature Flags Section */}
        <div className={themeClasses.card} style={themeClasses.cardStyle}>
          <div className="card-body">
            <h2 className="card-title h4 mb-4 d-flex align-items-center">
              <i className="bi bi-flag me-2"></i> Feature Flags
            </h2>
            <div className="row g-4">
              {/* Client-side Flag */}
              <ClientLogoSection applicationTheme={applicationTheme} />

              {/* Server-side Flag */}
              <ServerLogoSection logo={logo} facts={facts} applicationTheme={applicationTheme} />
            </div>
          </div>
        </div>

        {/* Session Replay Section */}
        <div className={themeClasses.card} style={themeClasses.cardStyle}>
          <div className="card-body">
            <h2 className="card-title h4 mb-4 d-flex align-items-center">
              <i className="bi bi-camera-video me-2"></i> Session Replay & Privacy
            </h2>
            
            {/* Canvas Demo */}
            <div className="mb-4 pb-4 border-bottom">
              <h6 className={themeClasses.sectionHeading}>Canvas Recording</h6>
              <canvas 
                ref={(canvas) => {
                  if (canvas) {
                    const ctx = canvas.getContext('2d');
                    let frame = 0;
                    const animate = () => {
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      ctx.fillStyle = `hsl(${frame % 360}, 70%, 50%)`;
                      ctx.fillRect(
                        Math.sin(frame * 0.02) * 30 + 60, 
                        Math.cos(frame * 0.03) * 20 + 30, 
                        30, 30
                      );
                      frame++;
                      if (sessionReplayStarted) {
                        requestAnimationFrame(animate);
                      }
                    };
                    if (sessionReplayStarted) animate();
                  }
                }}
                width="200" 
                height="100"
                className="border border-primary rounded bg-light d-block mb-2"
              />
              <small className={themeClasses.smallText}>Recorded at 2 FPS, 480p max resolution</small>
            </div>

            {/* Privacy Controls */}
            <div className="mb-4 pb-4 border-bottom">
              <h6 className={themeClasses.sectionHeading}>Privacy Controls</h6>
              <div className="row g-3 mb-3">
                <div className="col-md-6 col-lg-3">
                  <label className={themeClasses.labelText}>Regular Text (recorded)</label>
                  <div className="small">This text is visible in recordings</div>
                </div>
                <div className="col-md-6 col-lg-3">
                  <label className={themeClasses.labelText}>Password (masked)</label>
                  <input type="password" className="form-control form-control-sm" placeholder="Enter password" />
                </div>
                <div className="col-md-6 col-lg-3">
                  <label className={themeClasses.labelText}>Credit Card (PII)</label>
                  <input type="text" className="form-control form-control-sm" placeholder="4111-1111-1111-1111" />
                </div>
                <div className="col-md-6 col-lg-3">
                  <label className={themeClasses.labelText}>Email (PII)</label>
                  <input type="email" className="form-control form-control-sm" placeholder="user@example.com" />
                </div>
              </div>

              <div className="alert alert-warning text-center mb-3 ld-block">
                <strong><i className="bi bi-slash-circle me-2"></i>BLOCKED CONTENT</strong>
                <br />
                <small>This section uses 'ld-block' CSS class and won't be recorded</small>
              </div>
              
              <div className="mb-3">
                <span>This text is recorded, but </span>
                <span className="ld-ignore badge bg-info">
                  this part is ignored
                </span>
                <span> using 'ld-ignore' class.</span>
              </div>

              <div>
                <h6 className={`fw-semibold mb-2 ${applicationTheme ? 'text-light' : 'text-secondary'}`}>Interactive Elements</h6>
                <button 
                  onClick={() => {
                    if (observabilityStarted) {
                      LDObserve.recordLog('Demo button clicked', 'info', {
                        component: 'PrivacyDemo',
                        action: 'button_click'
                      });
                    }
                    alert('Button click recorded in session replay!');
                  }}
                  className="btn btn-success btn-sm me-2 mb-2"
                >
                  Recorded Button
                </button>
                <button 
                  className="ld-ignore btn btn-warning btn-sm me-2 mb-2"
                  onClick={() => alert('This button click is ignored!')}
                >
                  Ignored Button
                </button>
              </div>
            </div>

            {/* Session Management */}
            <div>
              <h6 className={themeClasses.sectionHeading}>Session Management</h6>
              <button 
                onClick={async () => {
                  try {
                    const { url, urlWithTimestamp } = await LDRecord.getSession();
                    const state = LDRecord.getRecordingState();
                    setSessionUrl(url);
                    setRecordingState(state);
                    alert(`Session State: ${state}\nURL: ${url}`);
                  } catch (error) {
                    alert('Failed to get session details');
                  }
                }}
                className="btn btn-info btn-sm me-2 mb-2"
              >
                Get Session URL
              </button>
              <button 
                onClick={() => {
                  LDRecord.addSessionProperties({
                    userAction: 'button-click',
                    timestamp: new Date().toISOString(),
                    feature: 'session-demo'
                  });
                  alert('Session properties added!');
                }}
                className="btn btn-warning btn-sm me-2 mb-2"
              >
                Add Properties
              </button>
            </div>
          </div>
        </div>

        {/* Observability Section */}
        <div className={themeClasses.card} style={themeClasses.cardStyle}>
          <div className="card-body">
            <h2 className="card-title h4 mb-4 d-flex align-items-center">
              <i className="bi bi-graph-up me-2"></i> Observability & Monitoring
            </h2>
            
            {/* Error Recording */}
            <div className="mb-4 pb-4 border-bottom">
              <h6 className={themeClasses.sectionHeading}>Error Recording</h6>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    const errorTypes = [
                      { error: new Error('Frontend validation failed'), message: 'User input validation error' },
                      { error: new TypeError('Cannot read property of undefined'), message: 'Frontend JavaScript error' },
                      { error: new Error('API request failed'), message: 'Network request error' }
                    ];
                    
                    const randomError = errorTypes[Math.floor(Math.random() * errorTypes.length)];
                    LDObserve.recordError(randomError.error, randomError.message, { component: 'ErrorDemo' });
                    
                    console.error('Demo error recorded:', randomError);
                    alert(`Error recorded: ${randomError.error.message}`);
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className="btn btn-danger btn-sm me-2 mb-2"
              >
                Record Error
              </button>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    try {
                      const obj = null;
                      obj.someProperty.nestedProperty = 'This will throw';
                    } catch (error) {
                      LDObserve.recordError(error, 'Caught JavaScript exception', { component: 'ErrorDemo' });
                      console.error('Intentional error caught:', error);
                      alert(`Caught: ${error.message}`);
                    }
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className={`${themeClasses.secondaryButton} me-2 mb-2`}
              >
                Trigger & Catch Error
              </button>
            </div>

            {/* Log Recording */}
            <div className="mb-4 pb-4 border-bottom">
              <h6 className={themeClasses.sectionHeading}>Log Recording</h6>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    LDObserve.recordLog('Debug message: Component rendered successfully', 'debug', {
                      component: 'LogDemo', action: 'debug-log'
                    });
                    console.log('🔍 DEBUG log recorded');
                    alert('DEBUG log recorded!');
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className={`${themeClasses.outlineSecondaryButton} me-2 mb-2`}
              >
                DEBUG
              </button>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    LDObserve.recordLog('Info message: User action completed', 'info', {
                      component: 'LogDemo', action: 'info-log'
                    });
                    console.log('ℹ️ INFO log recorded');
                    alert('INFO log recorded!');
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className="btn btn-info btn-sm me-2 mb-2"
              >
                INFO
              </button>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    LDObserve.recordLog('Warning message: Deprecated API usage detected', 'warn', {
                      component: 'LogDemo', action: 'warn-log'
                    });
                    console.warn('⚠️ WARN log recorded');
                    alert('WARN log recorded!');
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className="btn btn-warning btn-sm me-2 mb-2"
              >
                WARN
              </button>
              <button 
                onClick={() => {
                  if (observabilityStarted) {
                    LDObserve.recordLog('Error message: Failed to process user request', 'error', {
                      component: 'LogDemo', action: 'error-log'
                    });
                    console.error('🚨 ERROR log recorded');
                    alert('ERROR log recorded!');
                  } else {
                    alert('Observability not started!');
                  }
                }}
                className="btn btn-danger btn-sm me-2 mb-2"
              >
                ERROR
              </button>
            </div>

            {/* Metrics & Spans */}
            <div className="mb-4 pb-4 border-bottom">
              <h6 className={themeClasses.sectionHeading}>Metrics & Spans</h6>
              <div className="row g-2">
                <div className="col-6 col-md-3">
                  <button 
                    onClick={() => {
                      if (observabilityStarted) {
                        const start = Date.now();
                        setTimeout(() => {
                          const elapsed = Date.now() - start;
                          LDObserve.recordGauge({
                            name: 'frontend_operation_duration_ms',
                            value: elapsed,
                            tags: { component: 'MetricDemo' }
                          });
                          console.log('📊 GAUGE metric recorded');
                          alert(`GAUGE: ${elapsed}ms`);
                        }, Math.random() * 100 + 50);
                      } else {
                        alert('Observability not started!');
                      }
                    }}
                    className="btn btn-success btn-sm w-100 mb-2"
                  >
                    Gauge
                  </button>
                </div>
                <div className="col-6 col-md-3">
                  <button 
                    onClick={() => {
                      if (observabilityStarted) {
                        const randomValue = Math.floor(Math.random() * 100) + 1;
                        LDObserve.recordCount({
                          name: 'frontend_user_interactions',
                          value: randomValue,
                          tags: { component: 'MetricDemo' }
                        });
                        console.log('📈 COUNT metric recorded');
                        alert(`COUNT: ${randomValue}`);
                      } else {
                        alert('Observability not started!');
                      }
                    }}
                    className="btn btn-primary btn-sm w-100 mb-2"
                  >
                    Count
                  </button>
                </div>
                <div className="col-6 col-md-3">
                  <button 
                    onClick={() => {
                      if (observabilityStarted) {
                        const responseTime = Math.random() * 500 + 100;
                        LDObserve.recordHistogram({
                          name: 'frontend_api_response_time_ms',
                          value: responseTime,
                          tags: { component: 'MetricDemo' }
                        });
                        console.log('📊 HISTOGRAM metric recorded');
                        alert(`HISTOGRAM: ${responseTime.toFixed(2)}ms`);
                      } else {
                        alert('Observability not started!');
                      }
                    }}
                    className={themeClasses.secondaryButtonBlock}
                  >
                    Histogram
                  </button>
                </div>
                <div className="col-6 col-md-3">
                  <button 
                    onClick={() => {
                      if (observabilityStarted) {
                        LDObserve.startSpan('frontend_user_action', (span) => {
                          span.setAttributes({ 'user.action': 'button_click', 'component': 'SpanDemo' });
                          console.log('🔗 Automatic SPAN completed');
                          alert('Span completed!');
                          return { success: true };
                        });
                      } else {
                        alert('Observability not started!');
                      }
                    }}
                    className={themeClasses.darkButton}
                  >
                    Span
                  </button>
                </div>
              </div>
            </div>

            {/* Network & Console */}
            <div>
              <h6 className={themeClasses.sectionHeading}>Network & Console</h6>
              <button 
                onClick={async () => {
                  try {
                    const response = await fetch('/context');
                    const data = await response.json();
                    console.log('Context API response:', data);
                    alert('API call made - check network recording!');
                  } catch (error) {
                    console.error('API call failed:', error);
                  }
                }}
                className="btn btn-success btn-sm me-2 mb-2"
              >
                Test API Call
              </button>
              <button 
                onClick={() => {
                  console.log('📝 Test log message');
                  console.warn('⚠️ Test warning');
                  console.error('🚨 Test error');
                  console.info('ℹ️ Test info');
                  alert('Console messages logged!');
                }}
                className={`${themeClasses.secondaryButton} me-2 mb-2`}
              >
                Console Logs
              </button>
            </div>
          </div>
        </div>


        {/* Status & Controls */}
        <div className={themeClasses.card} style={themeClasses.cardStyle}>
          <div className="card-body">
            <h2 className="card-title h4 mb-4 d-flex align-items-center">
              <i className="bi bi-gear me-2"></i> Status & Controls
            </h2>
            
            {/* Feature Flag Status */}
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <div className={`alert ${enableObservability ? themeClasses.flagAlertInfo : themeClasses.flagAlertSecondary} mb-0`}>
                  <h6 className="alert-heading mb-2 d-flex align-items-center">
                    � OObservability Flag
                    <span className={`badge ms-2 ${enableObservability ? 'bg-success' : 'bg-danger'}`}>
                      {enableObservability ? 'ON' : 'OFF'}
                    </span>
                  </h6>
                  <div className={themeClasses.flagAlertText}>
                    LaunchDarkly Flag: <code>enableObservability</code>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className={`alert ${enableSessionReplay ? themeClasses.flagAlertInfo : themeClasses.flagAlertSecondary} mb-0`}>
                  <h6 className="alert-heading mb-2 d-flex align-items-center">
                    � SSession Replay Flag
                    <span className={`badge ms-2 ${enableSessionReplay ? 'bg-success' : 'bg-danger'}`}>
                      {enableSessionReplay ? 'ON' : 'OFF'}
                    </span>
                  </h6>
                  <div className={themeClasses.flagAlertText}>
                    LaunchDarkly Flag: <code>enableSessionReplay</code>
                  </div>
                </div>
              </div>
              
              <div className="col-md-6">
                <div className={themeClasses.themeAlert}>
                  <h6 className="alert-heading mb-2 d-flex align-items-center">
                    <i className="bi bi-palette me-2"></i>Theme Flag
                    <span className={`badge ms-2 ${applicationTheme ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
                      {applicationTheme ? 'DARK' : 'LIGHT'}
                    </span>
                  </h6>
                  <div className={themeClasses.flagAlertText}>
                    LaunchDarkly Flag: <code>applicationTheme</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Plugin Status */}
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <div className={`alert ${observabilityStarted ? 'alert-success' : 'alert-warning'} mb-0 ${applicationTheme ? 'text-dark' : ''}`}>
                  <h6 className="alert-heading mb-2">
                    <i className="bi bi-graph-up me-2"></i>Observability Plugin
                  </h6>
                  <p className="mb-2">
                    Status: <strong>{observabilityStarted ? <><i className="bi bi-check-circle-fill text-success me-1"></i>Active</> : enableObservability ? <><i className="bi bi-pause-circle text-warning me-1"></i>Waiting for Consent</> : <><i className="bi bi-x-circle-fill text-danger me-1"></i>Disabled by Flag</>}</strong>
                  </p>
                  <div className={themeClasses.flagAlertText}>
                    Metrics • Logs • Spans • Errors
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className={`alert ${sessionReplayStarted ? 'alert-success' : 'alert-warning'} mb-0 ${applicationTheme ? 'text-dark' : ''}`}>
                  <h6 className="alert-heading mb-2">
                    <i className="bi bi-camera-video me-2"></i>Session Replay Plugin
                  </h6>
                  <p className="mb-2">
                    Status: <strong>{sessionReplayStarted ? <><i className="bi bi-record-circle-fill text-success me-1"></i>Recording</> : enableSessionReplay ? <><i className="bi bi-pause-circle text-warning me-1"></i>Waiting for Consent</> : <><i className="bi bi-x-circle-fill text-danger me-1"></i>Disabled by Flag</>}</strong>
                  </p>
                  <div className={themeClasses.flagAlertText}>
                    State: {recordingState}
                    {sessionUrl && (
                      <>
                        <br />
                        <a href={sessionUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
                          View Session →
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="text-center">
              {!userConsent ? (
                <div>
                  <p className={`${themeClasses.mutedText} mb-3`}>
                    {(enableObservability || enableSessionReplay) ? (
                      <>Grant consent to enable available observability features</>
                    ) : (
                      <>No features available - both flags are disabled</>
                    )}
                  </p>
                  {(enableObservability || enableSessionReplay) && (
                    <button 
                      onClick={handleUserConsent}
                      className="btn btn-primary btn-lg"
                    >
                      Grant Consent (Demo)
                    </button>
                  )}
                  {(!enableObservability && !enableSessionReplay) && (
                    <div className="alert alert-info mt-3">
                      <small>
                        <strong><i className="bi bi-lightbulb me-2"></i>Tip:</strong>Enable the <code>enableObservability</code> or <code>enableSessionReplay</code> flags in LaunchDarkly to activate features.
                      </small>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className={`${themeClasses.mutedText} mb-3`}>
                    Session replay controls
                  </p>
                  {sessionReplayStarted ? (
                    <button 
                      onClick={() => {
                        LDRecord.stop();
                        setSessionReplayStarted(false);
                        setRecordingState('NotRecording');
                        setSessionUrl('');
                        setManuallyStoppedReplay(true);
                        console.log('⏹️ Session replay stopped manually');
                      }}
                      className="btn btn-danger"
                    >
                      <i className="bi bi-stop-fill me-2"></i>Stop Recording
                    </button>
                  ) : (
                    <button 
                      onClick={async () => {
                        setManuallyStoppedReplay(false);
                        await LDRecord.start({ forceNew: true, silent: false });
                        setSessionReplayStarted(true);
                        const currentState = LDRecord.getRecordingState();
                        setRecordingState(currentState);
                        try {
                          const { url } = await LDRecord.getSession();
                          setSessionUrl(url);
                        } catch (error) {
                          console.error('Failed to get session URL:', error);
                        }
                        console.log('▶️ Session replay restarted manually');
                      }}
                      className="btn btn-success"
                    >
                      <i className="bi bi-play-fill me-2"></i>Start Recording
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </Router>
  );
}

export default withLDConsumer()(App);
