import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { zlibSync } from 'fflate';
import { generateEncryptionKey, encryptFile, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/crypto';
import uploadStore, { type UploadState, type ChunkState, type FileMetadata } from '../utils/uploadStore';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRY_ATTEMPTS = 3;

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
      // Encrypt the file
      const encryptedBlob = await encryptFile(fileItem.file, key);
      
      // Get the key as a base64 string for storage
      const exportedKey = await window.crypto.subtle.exportKey('raw', key);
      const keyBase64 = arrayBufferToBase64(exportedKey);
      
      // Store the initial file and batch state
      const fileMetadata: FileMetadata = {
        id: fileItem.id,
        name: fileItem.file.name,
        type: fileItem.file.type,
        size: fileItem.file.size
      };
      
      await uploadStore.saveUploadState(batch, {
        batchId: batch,
        fileIds: [fileItem.id],
        encryptionKey: keyBase64,
        totalSize: encryptedBlob.size,
        uploadedSize: 0,
        status: 'uploading',
        metadata: [fileMetadata]
      });
      
      // Split the file into chunks of CHUNK_SIZE
      const totalChunks = Math.ceil(encryptedBlob.size / CHUNK_SIZE);
      
      // Initialize chunk states in the database
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, encryptedBlob.size);
        const chunkSize = end - start;
        
        const chunkState: ChunkState = {
          batchId: batch,
          fileId: fileItem.id,
          chunkIndex: i,
          uploaded: false,
          size: chunkSize,
          status: 'pending',
          attempts: 0
        };
        
        await uploadStore.saveChunkState(chunkState);
      }
      
      // Upload each chunk
      for (let i = 0; i < totalChunks && !isPaused; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, encryptedBlob.size);
        const chunkBlob = encryptedBlob.slice(start, end);
        
        // Check if this chunk was already uploaded
        const chunkState = await uploadStore.getChunkState(batch, fileItem.id, i);
        if (chunkState && chunkState.uploaded) {
          // Skip already uploaded chunks
          setFiles(prev => prev.map(f => {
            if (f.id === fileItem.id) {
              const overallProgress = ((i + 1) / totalChunks) * 100;
              return { ...f, progress: overallProgress, status: 'uploading' };
            }
            return f;
          }));
          continue;
        }
        
        // Upload this chunk with retry logic
        let uploadSuccess = false;
        let attempts = chunkState ? chunkState.attempts : 0;
        
        while (!uploadSuccess && attempts < MAX_RETRY_ATTEMPTS && !isPaused) {
          try {
            attempts++;
            await uploadStore.saveChunkState({
              batchId: batch,
              fileId: fileItem.id,
              chunkIndex: i,
              uploaded: false,
              size: chunkBlob.size,
              status: 'uploading',
              attempts
            });
            
            await uploadChunk(fileItem.id, chunkBlob, batch, i, (progress) => {
              setFiles(prev => prev.map(f => {
                if (f.id === fileItem.id) {
                  // Calculate overall progress considering all chunks
                  const chunkProgress = progress / 100;
                  const overallProgress = ((i + chunkProgress) / totalChunks) * 100;
                  return { ...f, progress: overallProgress, status: 'uploading' };
                }
                return f;
              }));
            });
            
            // Mark this chunk as successfully uploaded
            await uploadStore.saveChunkState({
              batchId: batch,
              fileId: fileItem.id,
              chunkIndex: i,
              uploaded: true,
              size: chunkBlob.size,
              status: 'completed',
              attempts
            });
            
            // Update the total uploaded size
            const uploadState = await uploadStore.getUploadState(batch);
            if (uploadState) {
              await uploadStore.saveUploadState(batch, {
                uploadedSize: (uploadState.uploadedSize || 0) + chunkBlob.size
              });
            }
            
            uploadSuccess = true;
          } catch (error) {
            console.error(`Chunk upload error (attempt ${attempts}):`, error);
            
            // Save the failed attempt
            await uploadStore.saveChunkState({
              batchId: batch,
              fileId: fileItem.id,
              chunkIndex: i,
              uploaded: false,
              size: chunkBlob.size,
              status: 'error',
              attempts
            });
            
            // If we've reached max attempts, mark the file as error
            if (attempts >= MAX_RETRY_ATTEMPTS) {
              setFiles(prev => prev.map(f => {
                if (f.id === fileItem.id) {
                  return { 
                    ...f, 
                    status: 'error', 
                    error: `Failed to upload chunk ${i} after ${MAX_RETRY_ATTEMPTS} attempts` 
                  };
                }
                return f;
              }));
              
              // Update upload state
              await uploadStore.saveUploadState(batch, { status: 'error' });
              throw new Error(`Failed to upload chunk ${i} after ${MAX_RETRY_ATTEMPTS} attempts`);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // If paused, break the loop
        if (isPaused) {
          await uploadStore.saveUploadState(batch, { status: 'paused' });
          break;
        }
      }
      
      // If all chunks uploaded successfully and not paused
      if (!isPaused) {
        setFiles(prev => prev.map(f => {
          if (f.id === fileItem.id) {
            return { ...f, progress: 100, status: 'completed' };
          }
          return f;
        }));
        
        await uploadStore.saveUploadState(batch, { status: 'completed' });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => {
        if (f.id === fileItem.id) {
          return { ...f, status: 'error', error: 'Upload failed' };
        }
        return f;
      }));
      
      await uploadStore.saveUploadState(batch, { status: 'error' });
    }
  };

  const uploadChunk = (fileId: string, chunk: Blob, batchId: string, chunkIndex: number, onProgress: (progress: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      // Create a FormData object to send the chunk
      const formData = new FormData();
      formData.append('chunk', chunk, `chunk-${chunkIndex}`);
      
      // Create an XMLHttpRequest to track progress
      const xhr = new XMLHttpRequest();
      
      // Store reference to xhr for potential cancellation
      setActiveXhrs(prev => ({
        ...prev,
        [`${fileId}-${chunkIndex}`]: xhr
      }));
      
      // Configure the request
      xhr.open('POST', `/api/upload/${batchId}/${chunkIndex}`, true);
      
      // Set up progress tracking
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = (event.loaded / event.total) * 100;
          onProgress(percentage);
        }
      };
      
      // Set up completion and error handlers
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Remove from active XHRs on completion
          setActiveXhrs(prev => {
            const newXhrs = { ...prev };
            delete newXhrs[`${fileId}-${chunkIndex}`];
            return newXhrs;
          });
          resolve();
        } else {
          reject(new Error(`Server returned ${xhr.status}: ${xhr.statusText}`));
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };
      
      // Send the request
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setIsPaused(false);
    
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
      setShareLink(shareUrl.toString());
      
      // Upload each file
      for (const fileItem of files) {
        await uploadFile(fileItem, key, newBatchId);
        
        // If paused, break the loop
        if (isPaused) break;
      }
    } catch (error) {
      console.error('Upload process error:', error);
    } finally {
      if (!isPaused) {
        setIsUploading(false);
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
          
          <div 
            className={`drop-zone ${isDragging ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
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