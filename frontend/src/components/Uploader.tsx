import { useState, useRef, useCallback } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import DropZone from './uploader/DropZone';
import FileList from './uploader/FileList';
import ProgressDetails from './uploader/ProgressDetails';
import ResumableUploads from './uploader/ResumableUploads';
import ShareLinkContainer from './uploader/ShareLinkContainer';
import UploadControls from './uploader/UploadControls';
import { formatFileSize, formatDate } from '../utils/formatters';
import { useUploadManager } from '../hooks/useUploadManager';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRY_ATTEMPTS = 5; // 5 for better reliability with large files
const MAX_PARALLEL_UPLOADS = 3; // Limit parallel uploads to prevent browser from being overwhelmed

const Uploader = () => {
  const {
    files,
    batchId,
    encryptionKey,
    shareLink,
    resumableUploads,
    uploadStats,
    isUploading,
    isPaused,
    activeXhrs,
    resetUpload,
    addFiles,
    createBatch,
    uploadFile,
    uploadChunk,
    handleUpload,
    handlePauseUpload,
    handleResumeUpload,
    handleCancelUpload,
    handleDeleteResumableUpload,
    handleCopyLink,
    setFiles,
    setIsPaused,
    setIsUploading
  } = useUploadManager(CHUNK_SIZE, MAX_RETRY_ATTEMPTS, MAX_PARALLEL_UPLOADS);

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  }, [addFiles]);

  return (
    <div className="upload-container">
      {!shareLink ? (
        <div className="upload-area">
          {resumableUploads.length > 0 && (
            <ResumableUploads
              uploads={resumableUploads}
              onResume={handleResumeUpload}
              onDelete={handleDeleteResumableUpload}
              formatDate={formatDate}
              formatFileSize={formatFileSize}
            />
          )}

          {isUploading && (
            <ProgressDetails
              stats={uploadStats}
            />
          )}

          <DropZone
            isDragging={isDragging}
            isUploading={isUploading}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFileDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
            onFileSelect={handleFileSelect}
          />

          {files.length > 0 && (
            <>
              <FileList
                files={files}
                formatFileSize={formatFileSize}
              />

              <UploadControls
                isUploading={isUploading}
                isPaused={isPaused}
                filesCount={files.length}
                onUpload={handleUpload}
                onPause={handlePauseUpload}
                onResume={() => handleResumeUpload()}
                onCancel={handleCancelUpload}
              />
            </>
          )}
        </div>
      ) : (
        <ShareLinkContainer
          shareLink={shareLink}
          onCopyLink={handleCopyLink}
          onReset={resetUpload}
        />
      )}
    </div>
  );
};

export default Uploader;