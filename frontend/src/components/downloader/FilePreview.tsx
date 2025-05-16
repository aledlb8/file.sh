import React from 'react';
import type { Batch, FileMetadata } from '../../hooks/useDownloadManager';

interface FilePreviewProps {
  metadata: FileMetadata[];
  batchInfo: Batch;
  formatDate: (timestamp: number) => string;
  formatFileSize: (bytes: number) => string;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  metadata,
  batchInfo,
  formatDate,
  formatFileSize
}) => {
  return (
    <div className="file-preview">
      <h3>Available Files</h3>
      {metadata && metadata.length > 0 ? (
        <div className="file-list preview">
          {metadata.map((file, index) => (
            <div className="file-item preview" key={index}>
              <div className="file-info">
                <div className="file-header">
                  <span className="file-icon">📄</span>
                  <p className="file-name">{file.name}</p>
                </div>
                <div className="file-details">
                  <span className="file-size">{formatFileSize(file.size)}</span>
                  <span className="file-separator">•</span>
                  <span className="file-type">{file.type || 'Unknown type'}</span>
                </div>
              </div>
            </div>
          ))}
          <p className="expiry-info">
            Expires: {formatDate(new Date(batchInfo.expiresAt).getTime())}
          </p>
        </div>
      ) : (
        <div className="file-preview-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>No file information available</p>
          <p className="expiry-info">
            Expires: {formatDate(new Date(batchInfo.expiresAt).getTime())}
          </p>
        </div>
      )}
    </div>
  );
};

export default FilePreview;