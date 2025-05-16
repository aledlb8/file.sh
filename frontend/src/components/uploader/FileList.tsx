import React from 'react';
import type { UploadFile } from '../../hooks/useUploadManager';

interface FileListProps {
  files: UploadFile[];
  formatFileSize: (bytes: number) => string;
}

const FileList: React.FC<FileListProps> = ({ files, formatFileSize }) => {
  return (
    <div className="file-list">
      {files.map(file => (
        <div className="file-item" key={file.id}>
          <div className="file-icon">📄</div>
          <div className="file-info">
            <p className="file-name">{file.file.name}</p>
            <p className="file-size">{formatFileSize(file.file.size)}</p>
            {(file.status === 'uploading' || file.status === 'completed') && (
              <div className="progress-container">
                <div
                  className="progress-bar"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}
            {file.status === 'error' && (
              <p className="error-message">{file.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FileList;