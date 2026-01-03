import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendUserContextToBackend,
  checkBackendConnectivity,
  createUserFriendlyErrorMessage,
  BackendConnectivityError,
  ERROR_TYPES,
  CONNECTION_STATUS
} from '../backendConnectivity';

// Mock fetch globally
global.fetch = vi.fn();

describe('backendConnectivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BackendConnectivityError', () => {
    it('should create error with correct properties', () => {
      const originalError = new Error('Original error');
      const error = new BackendConnectivityError(
        'Test message',
        ERROR_TYPES.NETWORK_ERROR,
        originalError,
        false
      );

      expect(error.message).toBe('Test message');
      expect(error.type).toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(error.originalError).toBe(originalError);
      expect(error.isRetryable).toBe(false);
      expect(error.name).toBe('BackendConnectivityError');
      expect(error.timestamp).toBeDefined();
    });
  });

  describe('createUserFriendlyErrorMessage', () => {
    it('should create network error message', () => {
      const error = { type: ERROR_TYPES.NETWORK_ERROR };
      const result = createUserFriendlyErrorMessage(error);

      expect(result.title).toBe('Connection Problem');
      expect(result.message).toContain('Unable to connect');
      expect(result.suggestions).toContain('Check your internet connection');
    });

    it('should create server error message', () => {
      const error = { type: ERROR_TYPES.SERVER_ERROR };
      const result = createUserFriendlyErrorMessage(error);

      expect(result.title).toBe('Server Error');
      expect(result.message).toContain('backend service encountered an error');
      expect(result.suggestions).toContain('Try again in a few moments');
    });

    it('should create timeout error message', () => {
      const error = { type: ERROR_TYPES.TIMEOUT_ERROR };
      const result = createUserFriendlyErrorMessage(error);

      expect(result.title).toBe('Request Timeout');
      expect(result.message).toContain('taking too long to respond');
      expect(result.suggestions).toContain('Check your internet connection');
    });

    it('should create validation error message', () => {
      const error = { type: ERROR_TYPES.VALIDATION_ERROR };
      const result = createUserFriendlyErrorMessage(error);

      expect(result.title).toBe('Invalid Data');
      expect(result.message).toContain('user context data is invalid');
      expect(result.suggestions).toContain('This is likely a programming error');
    });

    it('should create unknown error message for unrecognized type', () => {
      const error = { type: 'UNKNOWN_TYPE' };
      const result = createUserFriendlyErrorMessage(error);

      expect(result.title).toBe('Unknown Error');
      expect(result.message).toContain('unexpected error occurred');
      expect(result.suggestions).toContain('Try refreshing the page');
    });
  });

  describe('sendUserContextToBackend', () => {
    it('should successfully send user context', async () => {
      const mockResponse = { success: true, message: 'Context updated' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await sendUserContextToBackend('test-user', 'Test User');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.attempts).toBe(1);
      expect(fetch).toHaveBeenCalledWith('/api/set-user-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Context-Key': 'test-user'
        },
        body: JSON.stringify({
          userKey: 'test-user',
          name: 'Test User',
          kind: 'user'
        }),
        signal: expect.any(AbortSignal)
      });
    });

    it('should validate user key is required', async () => {
      await expect(sendUserContextToBackend('', 'Test User')).rejects.toThrow(
        BackendConnectivityError
      );
      await expect(sendUserContextToBackend(null, 'Test User')).rejects.toThrow(
        BackendConnectivityError
      );
      await expect(sendUserContextToBackend(undefined, 'Test User')).rejects.toThrow(
        BackendConnectivityError
      );
    });

    it('should validate user name is string if provided', async () => {
      await expect(sendUserContextToBackend('test-user', 123)).rejects.toThrow(
        BackendConnectivityError
      );
    });

    it('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await sendUserContextToBackend('test-user', 'Test User', {
        enableRetry: false
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(result.attempts).toBe(1);
    });

    it('should handle server errors (5xx)', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      const result = await sendUserContextToBackend('test-user', 'Test User', {
        enableRetry: false
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.SERVER_ERROR);
      expect(result.error.message).toContain('500');
    });

    it('should handle client errors (4xx) without retry', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      const result = await sendUserContextToBackend('test-user', 'Test User');

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.SERVER_ERROR);
      expect(result.error.isRetryable).toBe(false);
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to simulate timeout by rejecting with AbortError
      fetch.mockImplementationOnce(() => 
        Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
      );

      const result = await sendUserContextToBackend('test-user', 'Test User', {
        timeout: 100,
        enableRetry: false
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.TIMEOUT_ERROR);
    });

    it('should retry on retryable errors', async () => {
      // First call fails, second succeeds
      fetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });

      const onRetry = vi.fn();
      
      // Use real timers for this test to avoid timing issues
      vi.useRealTimers();
      
      const result = await sendUserContextToBackend('test-user', 'Test User', {
        enableRetry: true,
        onRetry
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(onRetry).toHaveBeenCalledWith(1, 1000, expect.any(BackendConnectivityError));
      
      // Restore fake timers
      vi.useFakeTimers();
    });

    it('should not retry on non-retryable errors', async () => {
      // Mock a 400 error which is not retryable (client error)
      // Use mockResolvedValue to return the same response for all attempts
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      const result = await sendUserContextToBackend('test-user', 'Test User', {
        enableRetry: true
      });

      expect(result.success).toBe(false);
      expect(result.error.isRetryable).toBe(false);
      expect(result.attempts).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should call success callback on successful request', async () => {
      const mockResponse = { success: true };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const onSuccess = vi.fn();
      const result = await sendUserContextToBackend('test-user', 'Test User', { onSuccess });

      expect(result.success).toBe(true);
      expect(onSuccess).toHaveBeenCalledWith(mockResponse, 0);
    });

    it('should call error callback on failed request', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const onError = vi.fn();
      const result = await sendUserContextToBackend('test-user', 'Test User', {
        enableRetry: false,
        onError
      });

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(BackendConnectivityError));
    });
  });

  describe('checkBackendConnectivity', () => {
    it('should return connected status for successful health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await checkBackendConnectivity();

      expect(result.status).toBe(CONNECTION_STATUS.CONNECTED);
      expect(result.statusCode).toBe(200);
      expect(result.timestamp).toBeDefined();
      expect(fetch).toHaveBeenCalledWith('/api/health', {
        method: 'GET',
        signal: expect.any(AbortSignal)
      });
    });

    it('should return error status for failed health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await checkBackendConnectivity();

      expect(result.status).toBe(CONNECTION_STATUS.ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('should return disconnected status for network error', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await checkBackendConnectivity();

      expect(result.status).toBe(CONNECTION_STATUS.DISCONNECTED);
      expect(result.error).toBe('Failed to fetch');
    });

    it('should handle timeout', async () => {
      // Mock fetch to reject with AbortError to simulate timeout
      fetch.mockImplementationOnce(() => 
        Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
      );

      const result = await checkBackendConnectivity(100);
      
      expect(result.status).toBe(CONNECTION_STATUS.DISCONNECTED);
      expect(result.error).toBe('The operation was aborted');
    });
  });
});