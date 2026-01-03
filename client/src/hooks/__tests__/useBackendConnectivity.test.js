import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBackendConnectivity } from '../useBackendConnectivity';
import * as backendConnectivity from '../../utils/backendConnectivity';

// Mock the backend connectivity utilities
vi.mock('../../utils/backendConnectivity', () => ({
  sendUserContextToBackend: vi.fn(),
  checkBackendConnectivity: vi.fn(),
  CONNECTION_STATUS: {
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    ERROR: 'ERROR'
  },
  createUserFriendlyErrorMessage: vi.fn(),
  BackendConnectivityError: class BackendConnectivityError extends Error {
    constructor(message, type) {
      super(message);
      this.type = type;
    }
  },
  ERROR_TYPES: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    SERVER_ERROR: 'SERVER_ERROR'
  }
}));

describe('useBackendConnectivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with connecting status', () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });

    const { result } = renderHook(() => useBackendConnectivity());

    expect(result.current.connectionStatus).toBe(backendConnectivity.CONNECTION_STATUS.CONNECTING);
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isFrontendOnlyMode).toBe(false);
  });

  it('should check initial connectivity on mount', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      // Wait for the effect to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(backendConnectivity.checkBackendConnectivity).toHaveBeenCalled();
    expect(result.current.connectionStatus).toBe(backendConnectivity.CONNECTION_STATUS.CONNECTED);
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle initial connectivity failure', async () => {
    const mockError = new Error('Connection failed');
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.DISCONNECTED,
      error: 'Connection failed'
    });
    
    backendConnectivity.createUserFriendlyErrorMessage.mockReturnValue({
      title: 'Connection Problem',
      message: 'Unable to connect'
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.connectionStatus).toBe(backendConnectivity.CONNECTION_STATUS.DISCONNECTED);
    expect(result.current.isFrontendOnlyMode).toBe(true);
    expect(result.current.userFriendlyError).toEqual({
      title: 'Connection Problem',
      message: 'Unable to connect'
    });
  });

  it('should send user context successfully', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });
    
    backendConnectivity.sendUserContextToBackend.mockResolvedValue({
      success: true,
      data: { message: 'Success' },
      attempts: 1
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      const response = await result.current.sendUserContext('test-user', 'Test User');
      expect(response.success).toBe(true);
    });

    expect(backendConnectivity.sendUserContextToBackend).toHaveBeenCalledWith(
      'test-user',
      'Test User',
      expect.objectContaining({
        enableRetry: true,
        onRetry: expect.any(Function),
        onError: expect.any(Function),
        onSuccess: expect.any(Function)
      })
    );

    expect(result.current.connectionStatus).toBe(backendConnectivity.CONNECTION_STATUS.CONNECTED);
    expect(result.current.lastError).toBeNull();
    expect(result.current.userFriendlyError).toBeNull();
  });

  it('should handle send user context failure', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });

    const mockError = new backendConnectivity.BackendConnectivityError(
      'Network error',
      backendConnectivity.ERROR_TYPES.NETWORK_ERROR
    );

    backendConnectivity.sendUserContextToBackend.mockResolvedValue({
      success: false,
      error: mockError,
      attempts: 3
    });

    backendConnectivity.createUserFriendlyErrorMessage.mockReturnValue({
      title: 'Connection Problem',
      message: 'Network error occurred'
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await result.current.sendUserContext('test-user', 'Test User');
    });

    expect(result.current.connectionStatus).toBe(backendConnectivity.CONNECTION_STATUS.ERROR);
    expect(result.current.lastError).toBe(mockError);
    expect(result.current.userFriendlyError).toEqual({
      title: 'Connection Problem',
      message: 'Network error occurred'
    });
    expect(result.current.isFrontendOnlyMode).toBe(true);
  });

  it('should handle retry callbacks', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });

    let onRetryCallback;
    backendConnectivity.sendUserContextToBackend.mockImplementation((userKey, userName, options) => {
      onRetryCallback = options.onRetry;
      return Promise.resolve({ success: true, attempts: 2 });
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await result.current.sendUserContext('test-user', 'Test User');
    });

    // Simulate retry callback
    await act(async () => {
      if (onRetryCallback) {
        onRetryCallback(1, 1000, new Error('Test error'));
      }
    });

    expect(result.current.isRetrying).toBe(true);
    expect(result.current.retryCount).toBe(1);
  });

  it('should retry connection', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.ERROR
    });

    backendConnectivity.sendUserContextToBackend.mockResolvedValue({
      success: true,
      attempts: 1
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for initial check
    });

    await act(async () => {
      await result.current.retryConnection('test-user', 'Test User');
    });

    expect(backendConnectivity.sendUserContextToBackend).toHaveBeenCalled();
  });

  it('should not retry when already connecting', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.CONNECTED
    });

    // Mock sendUserContextToBackend to return a pending promise
    let resolveSendContext;
    const pendingPromise = new Promise((resolve) => {
      resolveSendContext = resolve;
    });
    backendConnectivity.sendUserContextToBackend.mockReturnValue(pendingPromise);

    const { result } = renderHook(() => useBackendConnectivity());

    // Start connecting (don't await)
    act(() => {
      result.current.sendUserContext('test-user', 'Test User');
    });

    // Clear the mock to check if retry is called
    vi.clearAllMocks();

    // Try to retry while still connecting
    await act(async () => {
      await result.current.retryConnection('test-user', 'Test User');
    });

    expect(backendConnectivity.sendUserContextToBackend).not.toHaveBeenCalled();

    // Clean up by resolving the pending promise
    resolveSendContext({ success: true });
  });

  it('should clear error state', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.DISCONNECTED,
      error: 'Test error'
    });

    backendConnectivity.createUserFriendlyErrorMessage.mockReturnValue({
      title: 'Error',
      message: 'Test error'
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.lastError).toBeTruthy();
    expect(result.current.userFriendlyError).toBeTruthy();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.lastError).toBeNull();
    expect(result.current.userFriendlyError).toBeNull();
  });

  it('should compute frontend-only mode correctly', async () => {
    backendConnectivity.checkBackendConnectivity.mockResolvedValue({
      status: backendConnectivity.CONNECTION_STATUS.ERROR
    });

    const { result } = renderHook(() => useBackendConnectivity());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.isFrontendOnlyMode).toBe(true);

    // Change to connected status
    await act(async () => {
      // Simulate status change to connected
      result.current.connectionStatus = backendConnectivity.CONNECTION_STATUS.CONNECTED;
    });
  });
});