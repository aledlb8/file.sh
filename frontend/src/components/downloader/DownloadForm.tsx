import React from 'react';
import type { ChangeEvent } from 'react';
import FilePreview from './FilePreview';
import type { Batch, FileMetadata } from '../../hooks/useDownloadManager';

interface DownloadFormProps {
  batchId: string;
  keyBase64: string;
  metadata: FileMetadata[];
  batchInfo: Batch | null;
  previewState: 'idle' | 'loading' | 'success' | 'error';
  formatDate: (timestamp: number) => string;
  formatFileSize: (bytes: number) => string;
  onBatchIdChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onStartDownload: () => void;
}

const DownloadForm: React.FC<DownloadFormProps> = ({
  batchId,
  keyBase64,
  metadata,
  batchInfo,
  previewState,
  formatDate,
  formatFileSize,
  onBatchIdChange,
  onKeyChange,
  onStartDownload
}) => {
  return (
    <div className="download-form">
      <div className="input-group">
        <label htmlFor="batchId">Batch ID</label>
        <input
          type="text"
          id="batchId"
          value={batchId}
          onChange={onBatchIdChange}
          placeholder="Enter the batch ID"
        />
      </div>

      <div className="input-group">
        <label htmlFor="encryptionKey">Encryption Key</label>
        <input
          type="text"
          id="encryptionKey"
          value={keyBase64}
          onChange={onKeyChange}
          placeholder="Enter the encryption key"
        />
      </div>

      {previewState === 'loading' && (
        <div className="preview-loading">
          <div className="loading-spinner-small">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
              <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" />
              <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
              <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4" />
              <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
              <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
              <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="1" />
              <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
              <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" />
            </svg>
          </div>
          <span>Checking file info...</span>
        </div>
      )}

      {previewState === 'success' && batchInfo && (
        <FilePreview
          metadata={metadata}
          batchInfo={batchInfo}
          formatDate={formatDate}
          formatFileSize={formatFileSize}
        />
      )}

      {previewState === 'error' && (
        <div className="preview-error">
          Could not verify batch information. The batch ID may be invalid or expired.
        </div>
      )}

      <p className="info-text">
        Tip: Use the complete shared link instead of copying parts separately.
      </p>

      <div className="button-group">
        <button
          className="button"
          onClick={onStartDownload}
          disabled={!batchId || !keyBase64 || previewState === 'error'}
        >
          Prepare File
        </button>
      </div>
    </div>
  );
};

export default DownloadForm;