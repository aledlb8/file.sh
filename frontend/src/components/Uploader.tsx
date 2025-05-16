import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { zlibSync } from 'fflate';
import { generateEncryptionKey, encryptFile, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/crypto';
import uploadStore, { type UploadState, type ChunkState, type FileMetadata, prepareFileChunks } from '../utils/uploadStore';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRY_ATTEMPTS = 5; // Increased from 3 to 5 for better reliability with large files
const MAX_PARALLEL_UPLOADS = 3; // Limit parallel uploads to prevent browser from being overwhelmed

const Uploader = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [resumableUploads, setResumableUploads] = useState<UploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeXhrs, setActiveXhrs] = useState<Record<string, XMLHttpRequest>>({});
  const [uploadStats, setUploadStats] = useState<{
    totalChunks: number;
    uploadedChunks: number;
    currentChunk: number;
    chunkProgress: number;
    phase: 'encrypting' | 'uploading' | 'processing' | 'complete';
    startTime: number;
  }>({
    totalChunks: 0,
    uploadedChunks: 0,
    currentChunk: 0,
    chunkProgress: 0,
    phase: 'encrypting',
    startTime: 0
  });

  // Load any incomplete uploads on mount
  useEffect(() => {
    const loadIncompleteUploads = async () => {
      try {
        await uploadStore.cleanupOldUploads();
        const incomplete = await uploadStore.getIncompleteUploads();
        if (incomplete.length > 0) {
          setResumableUploads(incomplete);
        }
      } catch (error) {
        console.error('Error loading incomplete uploads:', error);
      }
    };

    loadIncompleteUploads();
  }, []);

  const resetUpload = async () => {
    // Cancel any active requests
    if (isUploading) {
      Object.values(activeXhrs).forEach(xhr => xhr.abort());
    }

    // Clear current upload state
    setFiles([]);
    setBatchId(null);
    setEncryptionKey(null);
    setShareLink(null);
    setIsUploading(false);
    setIsPaused(false);
    setActiveXhrs({});

    // Remove batch from storage if it exists
    if (batchId) {
      try {
        await uploadStore.deleteUploadState(batchId);
      } catch (error) {
        console.error('Error cleaning up upload state:', error);
      }
    }
  };

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
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  }, []);

  const addFiles = (fileList: FileList) => {
    const newFiles: UploadFile[] = [];

    Array.from(fileList).forEach(file => {
      newFiles.push({
        id: Math.random().toString(36).substring(2, 11),
        file,
        progress: 0,
        status: 'pending',
      });
    });

    setFiles(prev => [...prev, ...newFiles]);
  };

  const createBatch = async () => {
    try {
      const response = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to create batch');
      }

      const data = await response.json();
      return data.id;
    } catch (error) {
      console.error('Error creating batch:', error);
      throw error;
    }
  };

  const uploadFile = async (fileItem: UploadFile, key: CryptoKey, batch: string) => {
    try {
      setFiles(prev => prev.map(f =>
        f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      // Make sure upload stats is in encrypting state and reset for this file
      setUploadStats(prev => ({
        ...prev,
        totalChunks: 0,
        uploadedChunks: 0,
        currentChunk: 0,
        chunkProgress: 0,
        phase: 'encrypting'
      }));

      console.log(`Starting encryption of file: ${fileItem.file.name}, size: ${fileItem.file.size} bytes`);

      // Encrypt the file
      try {
        const encryptedBlob = await encryptFile(fileItem.file, key);
        console.log(`Encryption complete. Encrypted size: ${encryptedBlob.size} bytes`);

        // Get the key as a base64 string for storage
        const exportedKey = await window.crypto.subtle.exportKey('raw', key);
        const keyBase64 = arrayBufferToBase64(exportedKey);

        // Store the initial file metadata for resume
        const fileMetadata: FileMetadata = {
          id: fileItem.id,
          name: fileItem.file.name,
          type: fileItem.file.type,
          size: fileItem.file.size
        };

        // Prepare all the chunks for upload
        const chunks = prepareFileChunks(encryptedBlob, CHUNK_SIZE);
        console.log(`File will be uploaded in ${chunks.length} chunks of ${CHUNK_SIZE} bytes each (last chunk may be smaller)`);

        // Update upload stats to show we're now in uploading phase and set chunk count
        setUploadStats(prev => ({
          ...prev,
          totalChunks: chunks.length,
          phase: 'uploading'
        }));

        // Initialize chunk states
        const chunkStates: ChunkState[] = [];
        for (let i = 0; i < chunks.length; i++) {
          chunkStates.push({
            batchId: batch,
            fileId: fileItem.id,
            chunkIndex: i,
            uploaded: false,
            size: chunks[i].size,
            status: 'pending',
            attempts: 0
          });
        }

        // Store upload state for potential resume
        await uploadStore.saveUploadState(batch, {
          batchId: batch,
          fileIds: [fileItem.id],
          encryptionKey: keyBase64,
          totalSize: encryptedBlob.size,
          uploadedSize: 0,
          status: 'uploading',
          metadata: [fileMetadata]
        });

        // Save initial chunk states
        for (const chunkState of chunkStates) {
          await uploadStore.saveChunkState(chunkState);
        }

        // Keep track of overall file progress
        const updateOverallProgress = () => {
          const completedChunks = chunkStates.filter(cs => cs.status === 'completed').length;
          const averageProgress = Math.floor((completedChunks / chunks.length) * 100);

          setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, progress: averageProgress } : f
          ));

          // Update uploaded chunks count in stats
          setUploadStats(prev => ({
            ...prev,
            uploadedChunks: completedChunks
          }));

          // Force a render update by logging stats
          console.log(`Upload progress: ${completedChunks}/${chunks.length} chunks (${averageProgress}%)`);
        };

        // Upload all chunks with proper error handling and retry
        const MAX_RETRIES = 3;
        const MAX_CONCURRENT = 3; // Maximum concurrent uploads
        let activeUploads = 0;
        let chunkIndex = 0;
        let failedChunks = 0;

        // Log chunk size for first (IV-containing) chunk
        if (chunks.length > 0) {
          console.log(`First chunk (with IV) size: ${chunks[0].size} bytes`);
        }

        // Create a queue for processing chunks
        const processNextChunk = async () => {
          // Continue until we've processed all chunks
          while (chunkIndex < chunks.length && !isPaused) {
            // Wait if we're at the concurrent limit
            if (activeUploads >= MAX_CONCURRENT) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const currentIndex = chunkIndex++;
            activeUploads++;

            // Skip already uploaded chunks
            if (chunkStates[currentIndex].uploaded) {
              activeUploads--;

              // Update stats for skipped chunks
              setUploadStats(prev => ({
                ...prev,
                uploadedChunks: prev.uploadedChunks + 1,
                currentChunk: currentIndex,
                chunkProgress: 100
              }));

              continue;
            }

            // Update chunk status
            chunkStates[currentIndex].status = 'uploading';
            await uploadStore.saveChunkState(chunkStates[currentIndex]);

            // Update current chunk in stats
            setUploadStats(prev => ({
              ...prev,
              currentChunk: currentIndex,
              chunkProgress: 0
            }));

            // Try to upload this chunk with retries
            try {
              await uploadChunk(
                fileItem.id,
                chunks[currentIndex],
                batch,
                currentIndex,
                progress => {
                  // Update progress via UI callback only, don't store this temporary state
                  setFiles(prev => prev.map(f => {
                    if (f.id === fileItem.id) {
                      const overallProgress = Math.floor(
                        (chunkStates.filter(cs => cs.uploaded).length + progress / 100) /
                        chunks.length * 100
                      );
                      return { ...f, progress: overallProgress };
                    }
                    return f;
                  }));

                  // Update chunk progress in stats - do this EVERY time progress updates
                  setUploadStats(prev => ({
                    ...prev,
                    chunkProgress: progress
                  }));
                }
              );

              // Mark this chunk as completed
              chunkStates[currentIndex].status = 'completed';
              chunkStates[currentIndex].uploaded = true;

              // Save to database
              await uploadStore.saveChunkState(chunkStates[currentIndex]);
              await uploadStore.addUploadedChunk(batch, currentIndex);

              // Update progress after completion
              updateOverallProgress();

            } catch (error) {
              console.error(`Error uploading chunk ${currentIndex}:`, error);

              // Handle chunk upload failure
              chunkStates[currentIndex].attempts++;
              chunkStates[currentIndex].status = 'error';
              await uploadStore.saveChunkState(chunkStates[currentIndex]);

              if (chunkStates[currentIndex].attempts >= MAX_RETRIES) {
                failedChunks++;

                if (failedChunks > Math.min(5, Math.floor(chunks.length * 0.1))) {
                  // Too many failures, abort the whole upload
                  throw new Error(`Upload failed after ${failedChunks} chunk failures. Please try again later.`);
                }
              } else {
                // Reset status and queue for retry
                chunkStates[currentIndex].status = 'pending';
                chunkIndex--; // Try this chunk again
              }
            } finally {
              activeUploads--;
              updateOverallProgress();
            }
          }
        };

        // Start multiple upload workers
        const workers = [];
        for (let i = 0; i < MAX_CONCURRENT; i++) {
          workers.push(processNextChunk());
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        // Switch to processing phase once all chunks are uploaded
        setUploadStats(prev => ({
          ...prev,
          phase: 'processing'
        }));

        // Final check to make sure we uploaded all chunks
        const allCompleted = chunkStates.every(chunk => chunk.status === 'completed');
        if (!allCompleted && !isPaused) {
          const pending = chunkStates.filter(chunk => chunk.status !== 'completed').length;
          throw new Error(`Upload incomplete: ${pending} chunks failed to upload.`);
        }

        if (isPaused) {
          console.log('Upload paused by user');
          return;
        }

        // Update file status to completed
        setFiles(prev => prev.map(f =>
          f.id === fileItem.id ? { ...f, status: 'completed', progress: 100 } : f
        ));

        // Mark upload as complete in stats
        setUploadStats(prev => ({
          ...prev,
          phase: 'complete',
          uploadedChunks: chunks.length,
          chunkProgress: 100
        }));

        console.log(`File "${fileItem.file.name}" uploaded successfully in ${chunks.length} chunks`);

        // Update the upload state to completed
        await uploadStore.saveUploadState(batch, {
          status: 'completed',
          uploadedSize: encryptedBlob.size
        });

      } catch (encryptError) {
        console.error('Encryption error:', encryptError);
        setFiles(prev => prev.map(f =>
          f.id === fileItem.id ? {
            ...f,
            status: 'error',
            error: `Encryption failed: ${encryptError instanceof Error ? encryptError.message : 'Unknown error'}`
          } : f
        ));
        throw encryptError;
      }
    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f =>
        f.id === fileItem.id ? {
          ...f,
          status: 'error',
          error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        } : f
      ));
      throw error;
    }
  };

  const uploadChunk = (fileId: string, chunk: Blob, batchId: string, chunkIndex: number, onProgress: (progress: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Increase timeout for large chunks (default is often too short)
      const UPLOAD_TIMEOUT = 120000; // 2 minutes

      // Keep track of this XHR so we can abort it if needed
      setActiveXhrs(prev => ({ ...prev, [`${fileId}-${chunkIndex}`]: xhr }));

      xhr.open('POST', `/api/upload/${batchId}/${chunkIndex}`);
      xhr.timeout = UPLOAD_TIMEOUT;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // For debugging: Log server response
            const response = JSON.parse(xhr.responseText);
            console.log(`Server confirmed chunk ${chunkIndex} upload:`,
              response.size ? `${response.size} bytes` : 'size unknown',
              response.etag ? `etag: ${response.etag}` : '');
          } catch (e) {
            console.warn(`Could not parse response for chunk ${chunkIndex}:`, e);
          }

          // Clean up XHR reference
          setActiveXhrs(prev => {
            const newState = { ...prev };
            delete newState[`${fileId}-${chunkIndex}`];
            return newState;
          });

          console.log(`Chunk ${chunkIndex} uploaded successfully (${chunk.size} bytes)`);
          resolve();
        } else {
          const errorMessage = `Server error ${xhr.status}: ${xhr.statusText || 'Unknown error'}`;
          console.error(`Chunk ${chunkIndex} upload failed:`, errorMessage);

          // Clean up XHR reference
          setActiveXhrs(prev => {
            const newState = { ...prev };
            delete newState[`${fileId}-${chunkIndex}`];
            return newState;
          });

          reject(new Error(errorMessage));
        }
      };

      xhr.onerror = () => {
        console.error(`Network error uploading chunk ${chunkIndex}`);

        // Clean up XHR reference
        setActiveXhrs(prev => {
          const newState = { ...prev };
          delete newState[`${fileId}-${chunkIndex}`];
          return newState;
        });

        reject(new Error('Network error during upload'));
      };

      xhr.ontimeout = () => {
        console.error(`Timeout uploading chunk ${chunkIndex} after ${UPLOAD_TIMEOUT}ms`);

        // Clean up XHR reference
        setActiveXhrs(prev => {
          const newState = { ...prev };
          delete newState[`${fileId}-${chunkIndex}`];
          return newState;
        });

        reject(new Error(`Upload timeout after ${UPLOAD_TIMEOUT / 1000} seconds`));
      };

      xhr.onabort = () => {
        console.log(`Upload of chunk ${chunkIndex} aborted by user`);

        // Clean up XHR reference
        setActiveXhrs(prev => {
          const newState = { ...prev };
          delete newState[`${fileId}-${chunkIndex}`];
          return newState;
        });

        reject(new Error('Upload aborted'));
      };

      // Create FormData
      const formData = new FormData();

      // Log exact size before upload for debugging
      console.log(`Uploading chunk ${chunkIndex}, exact size: ${chunk.size} bytes`);

      // Add the chunk data with proper filename format
      formData.append('chunk', chunk, `chunk-${batchId}-${chunkIndex}`);

      // Send the FormData
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setIsPaused(false);

    // Initialize upload stats with current timestamp
    setUploadStats({
      totalChunks: 0,
      uploadedChunks: 0,
      currentChunk: 0,
      chunkProgress: 0,
      phase: 'encrypting',
      startTime: Date.now()
    });

    console.log("Starting upload process, initialized stats in 'encrypting' phase");

    try {
      // Generate encryption key
      const key = await generateEncryptionKey();
      setEncryptionKey(key);

      // Create a batch for upload
      const newBatchId = await createBatch();
      setBatchId(newBatchId);

      // Export the key to share with the receiver
      const exportedKey = await window.crypto.subtle.exportKey('raw', key);
      const keyBase64 = arrayBufferToBase64(exportedKey);

      // Create file metadata for storage
      const fileMetadata = files.map(f => ({
        id: f.id,
        name: f.file.name,
        type: f.file.type,
        size: f.file.size
      }));

      // Store metadata in local storage for download page to use
      localStorage.setItem(`file-metadata-${newBatchId}`, JSON.stringify(fileMetadata));

      // Create share link with batch ID and encryption key
      const compressedKey = zlibSync(new TextEncoder().encode(keyBase64));
      const compressedKeyBase64 = arrayBufferToBase64(compressedKey);

      // Compress and encode file metadata for URL
      const metadataStr = JSON.stringify(fileMetadata);
      const compressedMetadata = zlibSync(new TextEncoder().encode(metadataStr));
      const metadataBase64 = arrayBufferToBase64(compressedMetadata);

      const shareUrl = new URL(window.location.href);
      shareUrl.pathname = '/';
      shareUrl.searchParams.set('batch', newBatchId);
      shareUrl.searchParams.set('key', compressedKeyBase64);
      shareUrl.searchParams.set('meta', metadataBase64);

      // Upload each file
      for (const fileItem of files) {
        await uploadFile(fileItem, key, newBatchId);

        // If paused, break the loop
        if (isPaused) break;
      }

      // Only set the share link at the very end of the successful upload
      // This delays showing the "upload complete" screen until everything is done
      if (!isPaused) {
        setShareLink(shareUrl.toString());
      }
    } catch (error) {
      console.error('Upload process error:', error);
    } finally {
      if (!isPaused) {
        setIsUploading(false);
        // Reset upload stats when completely done
        setUploadStats(prev => ({
          ...prev,
          phase: 'complete'
        }));
      }
    }
  };

  const handlePauseUpload = async () => {
    setIsPaused(true);

    // Cancel all ongoing uploads
    Object.values(activeXhrs).forEach(xhr => {
      xhr.abort();
    });
    setActiveXhrs({});

    if (batchId) {
      await uploadStore.saveUploadState(batchId, { status: 'paused' });
    }
  };

  const handleResumeUpload = async (uploadState?: UploadState) => {
    if (uploadState) {
      try {
        // Load the upload state
        setIsPaused(false);
        setIsUploading(true);
        setBatchId(uploadState.batchId);

        // Import the encryption key
        const keyData = base64ToArrayBuffer(uploadState.encryptionKey);
        const key = await window.crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        setEncryptionKey(key);

        // Set up the files from metadata
        const fileItems: UploadFile[] = uploadState.metadata.map(meta => ({
          id: meta.id,
          file: new File([], meta.name, { type: meta.type }),
          progress: 0,
          status: 'pending',
        }));
        setFiles(fileItems);

        // Update upload state
        await uploadStore.saveUploadState(uploadState.batchId, { status: 'uploading' });

        // Resume upload for each file
        for (const fileItem of fileItems) {
          await uploadFile(fileItem, key, uploadState.batchId);

          // If paused again, break the loop
          if (isPaused) break;
        }
      } catch (error) {
        console.error('Resume upload error:', error);
      } finally {
        if (!isPaused) {
          setIsUploading(false);

          // Remove from resumable uploads
          setResumableUploads(prev => prev.filter(u => u.batchId !== uploadState.batchId));
        }
      }
    } else if (batchId) {
      // Resume current upload
      setIsPaused(false);
      setIsUploading(true);
      await uploadStore.saveUploadState(batchId, { status: 'uploading' });

      // Continue uploading files
      for (const fileItem of files.filter(f => f.status !== 'completed')) {
        if (encryptionKey && batchId) {
          await uploadFile(fileItem, encryptionKey, batchId);

          // If paused again, break the loop
          if (isPaused) break;
        }
      }

      if (!isPaused) {
        setIsUploading(false);
      }
    }
  };

  const handleCancelUpload = async () => {
    await resetUpload();
  };

  const handleDeleteResumableUpload = async (batchId: string) => {
    try {
      await uploadStore.deleteUploadState(batchId);
      setResumableUploads(prev => prev.filter(u => u.batchId !== batchId));
    } catch (error) {
      console.error('Error deleting upload state:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink)
        .then(() => {
          // Add a class to show copied animation
          const linkElement = document.querySelector('.download-link');
          if (linkElement) {
            linkElement.classList.add('copied');
            // Remove the class after animation completes
            setTimeout(() => {
              linkElement.classList.remove('copied');
            }, 1500);
          }
        })
        .catch(err => console.error('Failed to copy link:', err));
    }
  };

  // Add the renderProgressDetails function
  const renderProgressDetails = () => {
    if (!isUploading) {
      console.log("Not rendering progress details - upload not in progress");
      return null;
    }

    console.log("Rendering progress details:", uploadStats);

    const { totalChunks, uploadedChunks, currentChunk, chunkProgress, phase, startTime } = uploadStats;
    const elapsedSeconds = Math.max(1, (Date.now() - startTime) / 1000);
    const uploadRate = elapsedSeconds > 0 ? (uploadedChunks / elapsedSeconds).toFixed(2) : '0';
    const estimatedTotalTime = elapsedSeconds > 0 && uploadedChunks > 0
      ? ((elapsedSeconds / uploadedChunks) * totalChunks).toFixed(0)
      : '?';
    const estimatedRemaining = elapsedSeconds > 0 && uploadedChunks > 0 && uploadedChunks < totalChunks
      ? ((elapsedSeconds / uploadedChunks) * (totalChunks - uploadedChunks)).toFixed(0)
      : '0';

    return (
      <div className="progress-details">
        <div className="progress-header">
          <h3>Upload Progress</h3>
          <div className="phase-indicator">
            Phase: <span className={`phase-${phase}`}>
              {phase === 'encrypting' ? 'Encrypting' :
                phase === 'uploading' ? 'Uploading' :
                  phase === 'processing' ? 'Processing' : 'Complete'}
            </span>
          </div>
        </div>

        <div className="progress-metrics">
          <div className="metric">
            <span className="metric-label">Chunks:</span>
            <span className="metric-value">{uploadedChunks} / {totalChunks || '?'}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Current Chunk:</span>
            <span className="metric-value">{currentChunk} ({chunkProgress}%)</span>
          </div>
          <div className="metric">
            <span className="metric-label">Upload Rate:</span>
            <span className="metric-value">{uploadRate} chunks/sec</span>
          </div>
          <div className="metric">
            <span className="metric-label">Elapsed Time:</span>
            <span className="metric-value">{Math.floor(elapsedSeconds / 60)}m {Math.floor(elapsedSeconds % 60)}s</span>
          </div>
          <div className="metric">
            <span className="metric-label">Estimated Total:</span>
            <span className="metric-value">{estimatedTotalTime !== '?' ? `${Math.floor(Number(estimatedTotalTime) / 60)}m ${Math.floor(Number(estimatedTotalTime) % 60)}s` : 'Calculating...'}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Remaining:</span>
            <span className="metric-value">{estimatedRemaining !== '0' ? `${Math.floor(Number(estimatedRemaining) / 60)}m ${Math.floor(Number(estimatedRemaining) % 60)}s` : 'Almost done...'}</span>
          </div>
        </div>

        <div className="progress-bar-container">
          <div className="progress-chunks">
            {Array.from({ length: Math.min(totalChunks || 10, 50) }).map((_, index) => {
              const chunkStatus = index < uploadedChunks
                ? 'complete'
                : index === uploadedChunks
                  ? 'active'
                  : 'pending';
              return (
                <div
                  key={index}
                  className={`progress-chunk ${chunkStatus}`}
                  style={{
                    width: `${100 / Math.min(totalChunks || 10, 50)}%`,
                    opacity: chunkStatus === 'pending' ? 0.3 + (0.7 * (1 - (index - uploadedChunks) / Math.min(totalChunks || 10, 20))) : 1
                  }}
                >
                  {chunkStatus === 'active' && <div
                    className="chunk-progress"
                    style={{ width: `${chunkProgress}%` }}
                  />}
                </div>
              );
            })}
          </div>
          <div className="progress-percentage">
            {totalChunks ? Math.round((uploadedChunks / totalChunks) * 100) : 0}%
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="upload-container">
      {!shareLink ? (
        <div className="upload-area">
          {resumableUploads.length > 0 && (
            <div className="resumable-uploads">
              <h3>Resume Previous Uploads</h3>
              {resumableUploads.map(upload => (
                <div className="resumable-item" key={upload.batchId}>
                  <div className="resumable-info">
                    <p className="resumable-title">
                      {upload.metadata.length > 0 ? upload.metadata[0].name : 'Unknown file'}
                      {upload.metadata.length > 1 && ` + ${upload.metadata.length - 1} more`}
                    </p>
                    <p className="resumable-details">
                      Started: {formatDate(upload.createdAt)} |
                      Size: {formatFileSize(upload.totalSize)} |
                      Progress: {Math.round((upload.uploadedSize / upload.totalSize) * 100)}%
                    </p>
                  </div>
                  <div className="resumable-actions">
                    <button
                      className="button button-small"
                      onClick={() => handleResumeUpload(upload)}
                    >
                      Resume
                    </button>
                    <button
                      className="button button-small button-secondary"
                      onClick={() => handleDeleteResumableUpload(upload.batchId)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isUploading && renderProgressDetails()}

          <div
            className={`drop-zone ${isDragging ? 'active' : ''} ${isUploading ? 'minimized' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFileDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <div className="drop-zone-content">
              <strong>Drag & Drop Files Here</strong>
              <p>or click to select files</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              style={{ display: 'none' }}
            />
          </div>

          {files.length > 0 && (
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

              <div className="button-group">
                {!isUploading && (
                  <button
                    className="button"
                    onClick={handleUpload}
                    disabled={files.length === 0}
                  >
                    Upload Files
                  </button>
                )}

                {isUploading && !isPaused && (
                  <button
                    className="button"
                    onClick={handlePauseUpload}
                  >
                    Pause Upload
                  </button>
                )}

                {isUploading && isPaused && (
                  <button
                    className="button"
                    onClick={() => handleResumeUpload()}
                  >
                    Resume Upload
                  </button>
                )}

                <button
                  className="button button-secondary"
                  onClick={handleCancelUpload}
                  disabled={isUploading && !isPaused}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="share-link-container">
          <h2>Upload Complete!</h2>
          <div
            className="download-link"
            onClick={handleCopyLink}
          >
            {shareLink}
          </div>
          <p className="warning">
            <strong>Important:</strong> This link contains the encryption key.
            We don't store it on our servers - without this link, <span className="highlight">no one can decrypt your files.</span>
          </p>
          <button className="button" onClick={resetUpload}>
            Upload More Files
          </button>
        </div>
      )}
    </div>
  );
};

export default Uploader;