import { useState, useEffect } from 'react';
import { zlibSync, unzlibSync } from 'fflate';
import { importEncryptionKey, decryptFile, base64ToArrayBuffer } from '../utils/crypto';

interface DownloadState {
  status: 'idle' | 'loading' | 'downloading' | 'complete' | 'error';
  progress: number;
  message: string;
}

interface Batch {
  id: string;
  createdAt: string;
  expiresAt: string;
  chunkMap?: string[];
}

interface FileMetadata {
  name: string;
  type: string;
  size: number;
}

const Downloader = () => {
  const [batchId, setBatchId] = useState<string>('');
  const [keyBase64, setKeyBase64] = useState<string>('');
  const [metadata, setMetadata] = useState<FileMetadata[]>([]);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: 'idle',
    progress: 0,
    message: '',
  });
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [batchInfo, setBatchInfo] = useState<Batch | null>(null);

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const batchParam = params.get('batch');
    const keyParam = params.get('key');
    const metaParam = params.get('meta');

    if (batchParam) {
      setBatchId(batchParam);
      
      // Try to get metadata from localStorage
      const storedMetadata = localStorage.getItem(`file-metadata-${batchParam}`);
      if (storedMetadata) {
        try {
          setMetadata(JSON.parse(storedMetadata));
        } catch (e) {
          console.error('Error parsing stored metadata:', e);
        }
      }
    }

    if (keyParam) {
      try {
        // Decompress the key
        const compressedKey = base64ToArrayBuffer(keyParam);
        const decompressedKey = unzlibSync(new Uint8Array(compressedKey));
        const decodedKey = new TextDecoder().decode(decompressedKey);
        setKeyBase64(decodedKey);
      } catch (error) {
        console.error('Error decompressing key:', error);
      }
    }
    
    if (metaParam) {
      try {
        // Decompress and parse the metadata
        const compressedMeta = base64ToArrayBuffer(metaParam);
        const decompressedMeta = unzlibSync(new Uint8Array(compressedMeta));
        const metaStr = new TextDecoder().decode(decompressedMeta);
        const parsedMeta = JSON.parse(metaStr);
        setMetadata(parsedMeta);
      } catch (error) {
        console.error('Error decompressing metadata:', error);
      }
    }
  }, []);

  // Effect to preview batch info when both batch ID and key are available
  useEffect(() => {
    const previewBatchInfo = async () => {
      // Only try to fetch preview if both fields are filled with reasonable values
      if (batchId.length < 4 || keyBase64.length < 10) {
        setPreviewState('idle');
        return;
      }

      setPreviewState('loading');
      
      try {
        const info = await fetchBatchInfo(batchId);
        setBatchInfo(info);
        setPreviewState('success');
      } catch (error) {
        console.error('Error fetching batch info for preview:', error);
        setPreviewState('error');
      }
    };

    // Debounce the preview fetch to avoid too many requests
    const timeoutId = setTimeout(() => {
      previewBatchInfo();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [batchId, keyBase64]);

  const fetchBatchInfo = async (batchId: string) => {
    try {
      const response = await fetch(`/api/batch/${batchId}`);
      
      if (!response.ok) {
        throw new Error('Batch not found or expired');
      }
      
      const data = await response.json();
      // The API now returns { batch: {...}, stats: {...} }
      return data.batch || data;
    } catch (error) {
      console.error('Error fetching batch info:', error);
      throw error;
    }
  };

  const downloadAndDecryptFile = async (batchId: string, keyBase64: string) => {
    try {
      if (!batchId || !keyBase64) {
        setDownloadState({
          status: 'error',
          progress: 0,
          message: 'Missing batch ID or encryption key',
        });
        return;
      }

      // Get batch info to check existence
      setDownloadState({
        status: 'loading',
        progress: 0,
        message: 'Checking batch information...',
      });
      
      const batchInfo = await fetchBatchInfo(batchId);
      console.log('Batch info:', batchInfo);

      // Import the encryption key
      const key = await importEncryptionKey(keyBase64);
      
      // Start downloading chunks and decrypting
      let chunkIndex = 0;
      let allChunks: ArrayBuffer[] = [];
      let downloading = true;
      
      setDownloadState({
        status: 'downloading',
        progress: 0,
        message: 'Downloading encrypted chunks...',
      });
      
      while (downloading) {
        try {
          // Download chunk
          const chunkResponse = await fetch(`/api/download/${batchId}/${chunkIndex}`);
          
          if (!chunkResponse.ok) {
            // If we get a 404, we've downloaded all chunks
            if (chunkResponse.status === 404) {
              downloading = false;
              break;
            }
            throw new Error(`Failed to download chunk ${chunkIndex}`);
          }
          
          // Get chunk as ArrayBuffer
          const encryptedChunk = await chunkResponse.arrayBuffer();
          allChunks.push(encryptedChunk);
          
          // Update progress (estimated)
          setDownloadState(prev => ({
            ...prev,
            progress: Math.min(95, (chunkIndex + 1) * 10), // Rough estimation
            message: `Downloaded chunk ${chunkIndex + 1}...`,
          }));
          
          // Move to next chunk
          chunkIndex++;
        } catch (error) {
          console.error(`Error downloading chunk ${chunkIndex}:`, error);
          if (chunkIndex === 0) {
            throw error; // Fail if we can't even get the first chunk
          }
          downloading = false; // Otherwise stop downloading
        }
      }
      
      if (allChunks.length === 0) {
        throw new Error('No chunks found for this batch');
      }
      
      // Combine all chunks into a single encrypted blob
      const combinedChunks = new Blob(allChunks, { type: 'application/octet-stream' });
      
      setDownloadState({
        status: 'downloading',
        progress: 98,
        message: 'Decrypting files...',
      });
      
      // Decrypt the file
      const decryptedBlob = await decryptFile(combinedChunks, key);
      
      // Get file name and type from metadata if available
      let fileName = `file-${batchId}.bin`;
      let fileType = 'application/octet-stream';
      
      if (metadata && metadata.length > 0) {
        // Use the first file's info
        const fileInfo = metadata[0];
        
        // Extract extension from original filename
        if (fileInfo.name) {
          const lastDotIndex = fileInfo.name.lastIndexOf('.');
          if (lastDotIndex !== -1) {
            const extension = fileInfo.name.substring(lastDotIndex);
            fileName = `file-${batchId}${extension}`;
          } else {
            fileName = fileInfo.name;
          }
        }
        
        // Use the original MIME type if available
        if (fileInfo.type) {
          fileType = fileInfo.type;
        }
      }
      
      // Create a blob with the correct type
      const typedBlob = new Blob([decryptedBlob], { type: fileType });
      
      // Create download link
      const downloadUrl = URL.createObjectURL(typedBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      setDownloadState({
        status: 'complete',
        progress: 100,
        message: 'Download complete!',
      });
    } catch (error) {
      console.error('Download error:', error);
      setDownloadState({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'An error occurred during download',
      });
    }
  };

  const handleDownload = () => {
    downloadAndDecryptFile(batchId, keyBase64);
  };

  const handleBatchIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBatchId(e.target.value);
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyBase64(e.target.value);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      // Check if date is valid
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
      return 'Date unavailable';
    } catch (error) {
      return 'Date unavailable';
    }
  };

  return (
    <div className="download-container">
      {downloadState.status === 'idle' ? (
        <div className="download-form">
          <div className="input-group">
            <label htmlFor="batchId">Batch ID</label>
            <input
              type="text"
              id="batchId"
              value={batchId}
              onChange={handleBatchIdChange}
              placeholder="Enter the batch ID"
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="encryptionKey">Encryption Key</label>
            <input
              type="text"
              id="encryptionKey"
              value={keyBase64}
              onChange={handleKeyChange}
              placeholder="Enter the encryption key"
            />
          </div>
          
          {previewState === 'loading' && (
            <div className="preview-loading">
              <div className="loading-spinner-small">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
                  <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3"/>
                  <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
                  <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4"/>
                  <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7"/>
                  <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
                  <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="1"/>
                  <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6"/>
                  <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2"/>
                </svg>
              </div>
              <span>Checking file info...</span>
            </div>
          )}
          
          {previewState === 'success' && batchInfo && (
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
                    Expires: {formatDate(batchInfo.expiresAt)}
                  </p>
                </div>
              ) : (
                <div className="file-preview-placeholder">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>No file information available</p>
                  <p className="expiry-info">
                    Expires: {formatDate(batchInfo.expiresAt)}
                  </p>
                </div>
              )}
            </div>
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
              onClick={handleDownload}
              disabled={!batchId || !keyBase64 || previewState === 'error'}
            >
              Download Files
            </button>
          </div>
        </div>
      ) : (
        <div className="download-status">
          {['loading', 'downloading'].includes(downloadState.status) && (
            <div className="loading-container">
              <div className="loading-spinner">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
                  <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3"/>
                  <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
                  <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4"/>
                  <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7"/>
                  <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
                  <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="1"/>
                  <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6"/>
                  <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2"/>
                </svg>
              </div>
              <p className="loading-message">{downloadState.message}</p>
              <div className="progress-container">
                <div
                  className="progress-bar"
                  style={{ width: `${downloadState.progress}%` }}
                />
              </div>
              <p className="progress-text">{downloadState.progress}% Complete</p>
            </div>
          )}
          
          {downloadState.status === 'error' && (
            <div className="error-container">
              <div className="error-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="error-message">{downloadState.message}</p>
              <button
                className="button"
                onClick={() => setDownloadState({ status: 'idle', progress: 0, message: '' })}
              >
                Try Again
              </button>
            </div>
          )}
          
          {downloadState.status === 'complete' && (
            <div className="success-container">
              <div className="success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="success-message">{downloadState.message}</p>
              <button
                className="button"
                onClick={() => setDownloadState({ status: 'idle', progress: 0, message: '' })}
              >
                Download More Files
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Downloader; 