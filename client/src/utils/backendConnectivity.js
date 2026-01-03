// Enhanced backend connectivity utilities with error handling and retry logic

/**
 * Configuration for retry logic
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000,  // 8 seconds
  backoffMultiplier: 2
};

/**
 * Error types for backend connectivity
 */
export const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
};

/**
 * Connection status enum
 */
export const CONNECTION_STATUS = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  ERROR: 'ERROR'
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
const calculateDelay = (attempt) => {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
};

/**
 * Enhanced error class for backend connectivity issues
 */
export class BackendConnectivityError extends Error {
  constructor(message, type, originalError = null, isRetryable = true) {
    super(message);
    this.name = 'BackendConnectivityError';
    this.type = type;
    this.originalError = originalError;
    this.isRetryable = isRetryable;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Validate user context data
 */
const validateUserContext = (userKey, userName) => {
  if (!userKey || typeof userKey !== 'string' || userKey.trim().length === 0) {
    throw new BackendConnectivityError(
      'User key is required and must be a non-empty string',
      ERROR_TYPES.VALIDATION_ERROR,
      null,
      false
    );
  }

  if (userName && typeof userName !== 'string') {
    throw new BackendConnectivityError(
      'User name must be a string if provided',
      ERROR_TYPES.VALIDATION_ERROR,
      null,
      false
    );
  }
};

/**
 * Create user-friendly error messages
 */
export const createUserFriendlyErrorMessage = (error) => {
  switch (error.type) {
    case ERROR_TYPES.NETWORK_ERROR:
      return {
        title: 'Connection Problem',
        message: 'Unable to connect to the backend service. Please check your internet connection and try again.',
        suggestions: [
          'Check your internet connection',
          'Verify the backend service is running',
          'Try refreshing the page'
        ]
      };
    
    case ERROR_TYPES.SERVER_ERROR:
      return {
        title: 'Server Error',
        message: 'The backend service encountered an error. The application will continue in frontend-only mode.',
        suggestions: [
          'Try again in a few moments',
          'Check the browser console for more details',
          'Contact support if the problem persists'
        ]
      };
    
    case ERROR_TYPES.TIMEOUT_ERROR:
      return {
        title: 'Request Timeout',
        message: 'The backend service is taking too long to respond. The application will continue in frontend-only mode.',
        suggestions: [
          'Check your internet connection',
          'Try again in a few moments',
          'The backend service may be overloaded'
        ]
      };
    
    case ERROR_TYPES.VALIDATION_ERROR:
      return {
        title: 'Invalid Data',
        message: 'The user context data is invalid and cannot be sent to the backend.',
        suggestions: [
          'This is likely a programming error',
          'Please refresh the page',
          'Contact support if the problem persists'
        ]
      };
    
    default:
      return {
        title: 'Unknown Error',
        message: 'An unexpected error occurred while connecting to the backend.',
        suggestions: [
          'Try refreshing the page',
          'Check the browser console for more details',
          'Contact support if the problem persists'
        ]
      };
  }
};

/**
 * Enhanced function to send user context to backend with retry logic and error handling
 */
export const sendUserContextToBackend = async (userKey, userName, options = {}) => {
  const {
    timeout = 5000,
    enableRetry = true,
    onRetry = null,
    onError = null,
    onSuccess = null
  } = options;

  // Validate input
  try {
    validateUserContext(userKey, userName);
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }

  let lastError = null;
  let actualAttempts = 0;
  const maxAttempts = enableRetry ? RETRY_CONFIG.maxRetries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    actualAttempts = attempt + 1;
    try {
      // Add delay for retry attempts
      if (attempt > 0) {
        const delay = calculateDelay(attempt - 1);
        if (onRetry) {
          onRetry(attempt, delay, lastError);
        }
        await sleep(delay);
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch('/api/set-user-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Context-Key': userKey
        },
        body: JSON.stringify({
          userKey: userKey,
          name: userName || `Full-stack User (${userKey.substring(0, 8)})`,
          kind: "user"
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown server error');
        throw new BackendConnectivityError(
          `Server responded with ${response.status}: ${errorText}`,
          ERROR_TYPES.SERVER_ERROR,
          new Error(`HTTP ${response.status}`),
          response.status >= 500 // Only retry on 5xx errors
        );
      }

      const result = await response.json();
      
      if (onSuccess) {
        onSuccess(result, attempt);
      }

      console.log('✅ User context synchronized with backend');
      return {
        success: true,
        data: result,
        attempts: actualAttempts
      };

    } catch (error) {
      // Handle different error types
      if (error.name === 'AbortError') {
        lastError = new BackendConnectivityError(
          'Request timed out',
          ERROR_TYPES.TIMEOUT_ERROR,
          error,
          true
        );
      } else if (error instanceof BackendConnectivityError) {
        lastError = error;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        lastError = new BackendConnectivityError(
          'Network error - unable to reach backend service',
          ERROR_TYPES.NETWORK_ERROR,
          error,
          true
        );
      } else {
        lastError = new BackendConnectivityError(
          `Unexpected error: ${error.message}`,
          ERROR_TYPES.NETWORK_ERROR,
          error,
          true
        );
      }

      // Don't retry if error is not retryable or if this is the last attempt
      if (!lastError.isRetryable || attempt === maxAttempts - 1) {
        break;
      }
    }
  }

  // All attempts failed
  if (onError) {
    onError(lastError);
  }

  console.warn('⚠️ Failed to send user context to backend after', actualAttempts, 'attempts:', lastError.message);
  
  return {
    success: false,
    error: lastError,
    attempts: actualAttempts
  };
};

/**
 * Check backend connectivity status
 */
export const checkBackendConnectivity = async (timeout = 3000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    return {
      status: response.ok ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.ERROR,
      statusCode: response.status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: CONNECTION_STATUS.DISCONNECTED,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};