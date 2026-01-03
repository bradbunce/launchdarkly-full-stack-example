import React from 'react';
import { CONNECTION_STATUS } from '../utils/backendConnectivity';

/**
 * Component for displaying backend connection status
 */
const ConnectionStatusIndicator = ({ 
  connectionStatus, 
  isRetrying = false, 
  retryCount = 0,
  className = '',
  showLabel = true 
}) => {
  const getStatusConfig = () => {
    if (isRetrying) {
      return {
        icon: 'bi-arrow-clockwise',
        color: 'text-warning',
        bgColor: 'bg-warning',
        label: `Connecting... (${retryCount > 0 ? `Retry ${retryCount}` : 'Initial'})`,
        pulse: true
      };
    }

    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return {
          icon: 'bi-check-circle-fill',
          color: 'text-success',
          bgColor: 'bg-success',
          label: 'Backend Connected',
          pulse: false
        };
      
      case CONNECTION_STATUS.CONNECTING:
        return {
          icon: 'bi-arrow-clockwise',
          color: 'text-primary',
          bgColor: 'bg-primary',
          label: 'Connecting...',
          pulse: true
        };
      
      case CONNECTION_STATUS.DISCONNECTED:
        return {
          icon: 'bi-x-circle-fill',
          color: 'text-danger',
          bgColor: 'bg-danger',
          label: 'Backend Unavailable',
          pulse: false
        };
      
      case CONNECTION_STATUS.ERROR:
        return {
          icon: 'bi-exclamation-triangle-fill',
          color: 'text-warning',
          bgColor: 'bg-warning',
          label: 'Connection Error',
          pulse: false
        };
      
      default:
        return {
          icon: 'bi-question-circle',
          color: 'text-secondary',
          bgColor: 'bg-secondary',
          label: 'Unknown Status',
          pulse: false
        };
    }
  };

  const { icon, color, bgColor, label, pulse } = getStatusConfig();

  return (
    <div className={`d-flex align-items-center ${className}`}>
      <i 
        className={`bi ${icon} ${color} me-2 ${pulse ? 'spin' : ''}`}
        style={{ fontSize: '1rem' }}
      ></i>
      {showLabel && (
        <span className="small text-muted">{label}</span>
      )}
      

    </div>
  );
};

export default ConnectionStatusIndicator;