import React from 'react';

/**
 * Component for displaying backend connectivity errors with user-friendly messages
 */
const BackendErrorDisplay = ({ 
  error, 
  onRetry, 
  onDismiss, 
  isRetrying = false,
  retryCount = 0,
  showDismiss = true,
  className = ''
}) => {
  if (!error) return null;

  const { title, message, suggestions } = error;

  return (
    <div className={`alert alert-warning alert-dismissible ${className}`} role="alert">
      <div className="d-flex align-items-start">
        <i className="bi bi-exclamation-triangle-fill text-warning me-3 mt-1" style={{ fontSize: '1.2rem' }}></i>
        <div className="flex-grow-1">
          <h6 className="alert-heading mb-2">
            <strong>{title}</strong>
            {retryCount > 0 && (
              <span className="badge bg-secondary ms-2">
                Attempt {retryCount}
              </span>
            )}
          </h6>
          
          <p className="mb-2">{message}</p>
          
          {suggestions && suggestions.length > 0 && (
            <div className="mb-3">
              <small className="text-muted d-block mb-1">Suggestions:</small>
              <ul className="small mb-0 ps-3">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-muted">{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="d-flex gap-2 flex-wrap">
            {onRetry && (
              <button 
                type="button" 
                className="btn btn-sm btn-outline-primary"
                onClick={onRetry}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Retrying...
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-clockwise me-1"></i>
                    Try Again
                  </>
                )}
              </button>
            )}
            
            <button 
              type="button" 
              className="btn btn-sm btn-outline-secondary"
              onClick={() => window.location.reload()}
            >
              <i className="bi bi-arrow-clockwise me-1"></i>
              Refresh Page
            </button>
          </div>
        </div>
        
        {showDismiss && onDismiss && (
          <button 
            type="button" 
            className="btn-close" 
            aria-label="Close"
            onClick={onDismiss}
          ></button>
        )}
      </div>
    </div>
  );
};

export default BackendErrorDisplay;