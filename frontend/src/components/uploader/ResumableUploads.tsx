import React from 'react';
import type { UploadState } from '../../utils/uploadStore';

interface ResumableUploadsProps {
  uploads: UploadState[];
  onResume: (upload: UploadState) => void;
  onDelete: (batchId: string) => void;
  formatDate: (timestamp: number) => string;
  formatFileSize: (bytes: number) => string;
}

const ResumableUploads: React.FC<ResumableUploadsProps> = ({
  uploads,
  onResume,
  onDelete,
  formatDate,
  formatFileSize
}) => {
  if (uploads.length === 0) return null;

  return (
    <div className="resumable-uploads">
      <h3>Resume Previous Uploads</h3>
      {uploads.map(upload => (
        <div className="resumable-item" key={upload.batchId}>
          <div className="resumable-info">
            <p className="resumable-title">
              {upload.metadata.length > 0 ? upload.metadata[0].name : 'Unknown file'}
              {upload.metadata.length > 1 && ` + ${upload.metadata.length - 1} more`}
            </p>
            <p className="resumable-details">
              Started: {formatDate(upload.createdAt || Date.now())} |
              Size: {formatFileSize(upload.totalSize)} |
              Progress: {Math.round((upload.uploadedSize / upload.totalSize) * 100)}%
            </p>
          </div>
          <div className="resumable-actions">
            <button
              className="button button-small"
              onClick={() => onResume(upload)}
            >
              Resume
            </button>
            <button
              className="button button-small button-secondary"
              onClick={() => onDelete(upload.batchId)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ResumableUploads;