import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  sendUserContextToBackend, 
  checkBackendConnectivity, 
  CONNECTION_STATUS,
  createUserFriendlyErrorMessage 
} from '../utils/backendConnectivity';

/**
 * Custom hook for managing backend connectivity state and operations
 */
export const useBackendConnectivity = () => {
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.CONNECTING);
  const [lastError, setLastError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [userFriendlyError, setUserFriendlyError] = useState(null);
  
  // Use ref to track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Update state only if component is still mounted
   */
  const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  /**
   * Check initial backend connectivity
   */
  useEffect(() => {
    const checkInitialConnectivity = async () => {
      try {
        const result = await checkBackendConnectivity();
        safeSetState(setConnectionStatus, result.status);
        
        if (result.status !== CONNECTION_STATUS.CONNECTED) {
          const error = new Error(`Backend not available: ${result.error || 'Unknown error'}`);
          safeSetState(setLastError, error);
          safeSetState(setUserFriendlyError, createUserFriendlyErrorMessage({
            type: 'NETWORK_ERROR',
            message: error.message
          }));
        }
      } catch (error) {
        safeSetState(setConnectionStatus, CONNECTION_STATUS.ERROR);
        safeSetState(setLastError, error);
        safeSetState(setUserFriendlyError, createUserFriendlyErrorMessage({
          type: 'NETWORK_ERROR',
          message: error.message
        }));
      }
    };

    checkInitialConnectivity();
  }, [safeSetState]);

  /**
   * Send user context to backend with enhanced error handling
   */
  const sendUserContext = useCallback(async (userKey, userName) => {
    safeSetState(setConnectionStatus, CONNECTION_STATUS.CONNECTING);
    safeSetState(setLastError, null);
    safeSetState(setUserFriendlyError, null);
    safeSetState(setRetryCount, 0);

    const result = await sendUserContextToBackend(userKey, userName, {
      enableRetry: true,
      onRetry: (attempt, delay, error) => {
        console.log(`🔄 Retrying backend connection (attempt ${attempt}) in ${delay}ms...`);
        safeSetState(setIsRetrying, true);
        safeSetState(setRetryCount, attempt);
      },
      onError: (error) => {
        safeSetState(setLastError, error);
        safeSetState(setUserFriendlyError, createUserFriendlyErrorMessage(error));
        safeSetState(setConnectionStatus, CONNECTION_STATUS.ERROR);
        safeSetState(setIsRetrying, false);
      },
      onSuccess: (data, attempts) => {
        console.log(`✅ Backend connection successful after ${attempts} attempt(s)`);
        safeSetState(setConnectionStatus, CONNECTION_STATUS.CONNECTED);
        safeSetState(setIsRetrying, false);
        safeSetState(setLastError, null);
        safeSetState(setUserFriendlyError, null);
      }
    });

    // Handle the case where the function returns success: false but doesn't call onError
    if (!result.success && result.error) {
      safeSetState(setLastError, result.error);
      safeSetState(setUserFriendlyError, createUserFriendlyErrorMessage(result.error));
      safeSetState(setConnectionStatus, CONNECTION_STATUS.ERROR);
      safeSetState(setIsRetrying, false);
    }

    return result;
  }, [safeSetState]);

  /**
   * Retry the last failed operation
   */
  const retryConnection = useCallback(async (userKey, userName) => {
    if (connectionStatus === CONNECTION_STATUS.CONNECTING || isRetrying) {
      return; // Already in progress
    }

    return await sendUserContext(userKey, userName);
  }, [connectionStatus, isRetrying, sendUserContext]);

  /**
   * Reset error state
   */
  const clearError = useCallback(() => {
    safeSetState(setLastError, null);
    safeSetState(setUserFriendlyError, null);
  }, [safeSetState]);

  /**
   * Check if we're in frontend-only mode (graceful degradation)
   */
  const isFrontendOnlyMode = connectionStatus === CONNECTION_STATUS.ERROR || 
                            connectionStatus === CONNECTION_STATUS.DISCONNECTED;

  return {
    // State
    connectionStatus,
    lastError,
    isRetrying,
    retryCount,
    userFriendlyError,
    isFrontendOnlyMode,
    
    // Actions
    sendUserContext,
    retryConnection,
    clearError,
    
    // Computed properties
    isConnected: connectionStatus === CONNECTION_STATUS.CONNECTED,
    isConnecting: connectionStatus === CONNECTION_STATUS.CONNECTING || isRetrying,
    hasError: !!lastError
  };
};