import React from 'react';
import { useDownloadManager } from '../hooks/useDownloadManager';
import DownloadForm from './downloader/DownloadForm';
import DownloadStatus from './downloader/DownloadStatus';

const Downloader = () => {
  const {
    batchId,
    keyBase64,
    metadata,
    downloadState,
    previewState,
    batchInfo,
    handleStartDownload,
    handleDownloadFile,
    handleBatchIdChange,
    handleKeyChange,
    resetDownload,
    formatFileSize,
    formatDate
  } = useDownloadManager();

  return (
    <div className="download-container">
      {downloadState.status === 'idle' ? (
        <DownloadForm
          batchId={batchId}
          keyBase64={keyBase64}
          metadata={metadata}
          batchInfo={batchInfo}
          previewState={previewState}
          formatDate={formatDate}
          formatFileSize={formatFileSize}
          onBatchIdChange={handleBatchIdChange}
          onKeyChange={handleKeyChange}
          onStartDownload={handleStartDownload}
        />
      ) : (
        <DownloadStatus
          downloadState={downloadState}
          onDownloadFile={handleDownloadFile}
          onReset={resetDownload}
          formatFileSize={formatFileSize}
        />
      )}
    </div>
  );
};

export default Downloader;