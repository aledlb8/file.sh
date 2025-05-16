import React from 'react';

interface DownloadErrorProps {
  message: string;
  onReset: () => void;
}

const DownloadError: React.FC<DownloadErrorProps> = ({ message, onReset }) => {
  return (
    <div className="download-error">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h2>Download Error</h2>
      <p className="error-message">{message}</p>

      <div className="error-help">
        <h3>Possible solutions:</h3>
        <ul>
          <li>Check your internet connection and try again</li>
          <li>Make sure the batch ID and encryption key are correct</li>
          <li>The file might have expired or been deleted</li>
          <li>Try using a different browser</li>
        </ul>
      </div>

      <button className="button" onClick={onReset}>
        Try Again
      </button>
    </div>
  );
};

export default DownloadError;