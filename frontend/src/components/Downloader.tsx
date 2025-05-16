import { useState, useEffect } from 'react';
import { zlibSync, unzlibSync } from 'fflate';
import { importEncryptionKey, decryptFile, batchDecryptChunks, base64ToArrayBuffer, decryptChunkedFile } from '../utils/crypto';

interface DownloadState {
  status: 'idle' | 'loading' | 'downloading' | 'decrypting' | 'preparing' | 'ready' | 'complete' | 'error';
  progress: number;
  message: string;
  fileName?: string;
  fileType?: string;
  downloadUrl?: string;
  fileSize?: number;
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

  // Cleanup effect for download URL
  useEffect(() => {
    return () => {
      // Revoke any ObjectURLs when component unmounts
      if (downloadState.downloadUrl) {
        URL.revokeObjectURL(downloadState.downloadUrl);
      }
    };
  }, [downloadState.downloadUrl]);

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

  const processDownload = async (batchId: string, keyBase64: string) => {
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
      console.log('Encryption key imported successfully');

      // Start downloading chunks
      let chunkIndex = 0;
      let allChunks: ArrayBuffer[] = [];
      let totalDownloaded = 0;
      let downloading = true;
      let hasErrors = false;
      let lastProgressUpdate = Date.now();

      // Create helper to report progress
      const updateDownloadProgress = (newProgress: number, newMessage?: string) => {
        // Throttle updates to avoid excessive re-renders
        const now = Date.now();
        if (now - lastProgressUpdate > 200) { // Update max 5 times per second
          lastProgressUpdate = now;
          setDownloadState(prev => ({
            ...prev,
            progress: newProgress,
            message: newMessage || prev.message
          }));
        }
      };

      setDownloadState({
        status: 'downloading',
        progress: 0,
        message: 'Downloading encrypted data... (Phase 1/3)',
      });

      // Estimate the total number of chunks based on the chunk map if available
      const estimatedTotalChunks = batchInfo.chunkMap ? batchInfo.chunkMap.length : 10;
      console.log(`Estimated total chunks: ${estimatedTotalChunks}`);

      // First pass - check how many chunks are available before starting the heavy download
      // This helps avoid issues with large files where chunk counting might time out
      let totalDetectedChunks = 0;
      try {
        console.log("Performing quick head scan to count available chunks...");
        const chunkCheckPromises = [];
        // Try checking up to 200 chunks in parallel to quickly determine total count
        for (let i = 0; i < 200; i++) {
          chunkCheckPromises.push(
            fetch(`/api/download/${batchId}/${i}`, { method: 'HEAD' })
              .then(res => {
                if (res.ok) totalDetectedChunks = Math.max(totalDetectedChunks, i + 1);
                return res.ok;
              })
              .catch(() => false)
          );
        }

        // Wait for all HEAD requests to complete
        await Promise.all(chunkCheckPromises);

        if (totalDetectedChunks > 0) {
          console.log(`Detected ${totalDetectedChunks} chunks available for download`);
        } else {
          console.warn("Couldn't detect any chunks with HEAD requests, falling back to sequential download");
        }
      } catch (e) {
        console.warn("HEAD scan failed, falling back to sequential download", e);
      }

      // Track timeout for large files
      const downloadStartTime = Date.now();
      const DOWNLOAD_TIMEOUT = 10 * 60 * 1000; // 10 minutes

      // Try to download chunks with better error handling and timeouts
      while (downloading && chunkIndex < 1000) { // Increased safety limit for very large files
        if (Date.now() - downloadStartTime > DOWNLOAD_TIMEOUT) {
          console.error(`Download timed out after ${DOWNLOAD_TIMEOUT / 1000} seconds`);
          throw new Error(`Download timed out. Try downloading again or with a better connection.`);
        }

        try {
          // Update progress message with explicit phase counter
          if (chunkIndex === 0 || chunkIndex % 10 === 0) {
            updateDownloadProgress(
              Math.min(95 * (chunkIndex / (totalDetectedChunks || estimatedTotalChunks)), 90),
              `Downloading encrypted data... (Phase 1/3) [${chunkIndex}/${totalDetectedChunks || '?'} chunks]`
            );
          }

          // Download chunk with a timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout per chunk

          try {
            console.log(`Downloading chunk ${chunkIndex}...`);
            const chunkResponse = await fetch(`/api/download/${batchId}/${chunkIndex}`, {
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!chunkResponse.ok) {
              // If we get a 404, we've downloaded all chunks
              if (chunkResponse.status === 404) {
                console.log(`Reached end of chunks at index ${chunkIndex}`);
                downloading = false;
                break;
              }

              // For other errors, log and try to continue
              console.warn(`Server returned ${chunkResponse.status} for chunk ${chunkIndex}`);

              // If we've already got some chunks but hit an error, it might be the end
              if (chunkIndex > 0 && (chunkResponse.status === 500 || chunkResponse.status === 404)) {
                console.log(`Assuming we reached the end of chunks at index ${chunkIndex} due to error response`);
                downloading = false;
                break;
              }

              // Otherwise, mark as error and proceed to next chunk
              hasErrors = true;
              chunkIndex++;
              continue;
            }

            // Process this chunk
            const chunkArrayBuffer = await chunkResponse.arrayBuffer();

            if (chunkArrayBuffer.byteLength === 0) {
              console.warn(`Received empty chunk ${chunkIndex}, skipping`);
              hasErrors = true;
              chunkIndex++;
              continue;
            }

            console.log(`Downloaded chunk ${chunkIndex}, size: ${chunkArrayBuffer.byteLength} bytes`);

            // Get chunk info from headers if available
            const xChunkIndex = chunkResponse.headers.get('X-Chunk-Index');
            if (xChunkIndex && parseInt(xChunkIndex) !== chunkIndex) {
              console.warn(`Chunk index mismatch: requested ${chunkIndex}, got ${xChunkIndex}`);
            }

            // Store the chunk
            allChunks.push(chunkArrayBuffer);
            totalDownloaded += chunkArrayBuffer.byteLength;

            // Update progress based on estimated total or chunk count
            if (totalDetectedChunks > 0) {
              updateDownloadProgress(Math.min((chunkIndex + 1) / totalDetectedChunks * 90, 90));
            } else {
              // If we don't know how many chunks, use a more conservative progress indicator
              updateDownloadProgress(Math.min(50 + chunkIndex * 2, 90));
            }

            // Move to next chunk
            chunkIndex++;
          } catch (timeoutError: any) {
            clearTimeout(timeoutId);

            if (timeoutError.name === 'AbortError') {
              console.error(`Timeout downloading chunk ${chunkIndex}`);
              hasErrors = true;

              // If we've already got some chunks, we'll try to process what we have
              if (allChunks.length > 0) {
                console.warn(`Continuing with ${allChunks.length} successfully downloaded chunks`);
                downloading = false;
                break;
              } else {
                throw new Error(`Download timed out while retrieving chunk ${chunkIndex}`);
              }
            } else {
              throw timeoutError;
            }
          }
        } catch (error: any) {
          console.error(`Error downloading chunk ${chunkIndex}:`, error);

          // If network error and we have at least one chunk, try to process what we have
          if (allChunks.length > 0 && (error.message?.includes('network') || error.name === 'TypeError')) {
            console.warn(`Network error, but proceeding with ${allChunks.length} downloaded chunks`);
            hasErrors = true;
            downloading = false;
            break;
          }

          throw error;
        }
      }

      // If we didn't download any chunks, show error
      if (allChunks.length === 0) {
        throw new Error('No data found or download failed');
      }

      // Get the first file's metadata if available
      const fileMetadata = metadata.length > 0 ? metadata[0] : null;
      console.log('File metadata:', fileMetadata);

      // Decrypt the file
      setDownloadState({
        status: 'decrypting',
        progress: 95,
        message: 'Decrypting data... (Phase 2/3)',
        fileName: fileMetadata?.name,
        fileType: fileMetadata?.type,
        fileSize: totalDownloaded,
      });

      try {
        console.log(`Starting decryption of ${allChunks.length} chunks, total size: ${totalDownloaded} bytes`);
        console.time('decryption');

        // Use the specialized chunked decryption method for better reliability
        const decryptedArrayBuffer = await decryptChunkedFile(allChunks, key);

        console.timeEnd('decryption');
        console.log(`Decryption complete. Decrypted size: ${decryptedArrayBuffer.byteLength} bytes`);

        // Prepare the decrypted file for download
        setDownloadState({
          status: 'preparing',
          progress: 98,
          message: 'Creating download link... (Phase 3/3)',
          fileName: fileMetadata?.name || `download-${batchId}.bin`,
          fileType: fileMetadata?.type || 'application/octet-stream',
          fileSize: decryptedArrayBuffer.byteLength,
        });

        // Get correct MIME type based on file extension
        const fileName = fileMetadata?.name || `download-${batchId}.bin`;
        const fileType = getFileTypeFromName(fileName, fileMetadata?.type);

        // Create downloadable URL
        const decryptedBlob = new Blob([decryptedArrayBuffer], {
          type: fileType || 'application/octet-stream',
        });

        const url = URL.createObjectURL(decryptedBlob);

        // Update state with download info
        setDownloadState({
          status: 'ready',
          progress: 100,
          message: 'Ready for download',
          fileName: fileName,
          fileType: fileType || 'application/octet-stream',
          downloadUrl: url,
          fileSize: decryptedArrayBuffer.byteLength,
        });
      } catch (decryptionError: any) {
        console.error('Decryption failed:', decryptionError);

        // Try a fallback method for decryption
        try {
          console.log('Attempting alternative decryption method...');
          setDownloadState({
            status: 'decrypting',
            progress: 95,
            message: 'Trying alternative decryption method... (Phase 2/3)',
          });

          // Use the batch decrypt method as a fallback
          const decryptedArrayBuffer = await batchDecryptChunks(allChunks, key);

          console.log(`Fallback decryption complete. Decrypted size: ${decryptedArrayBuffer.byteLength} bytes`);

          // Get correct MIME type based on file extension
          const fileName = fileMetadata?.name || `download-${batchId}.bin`;
          const fileType = getFileTypeFromName(fileName, fileMetadata?.type);

          // Create downloadable URL
          const decryptedBlob = new Blob([decryptedArrayBuffer], {
            type: fileType || 'application/octet-stream',
          });

          const url = URL.createObjectURL(decryptedBlob);

          // Update state with download info
          setDownloadState({
            status: 'ready',
            progress: 100,
            message: 'Ready for download (using fallback method)',
            fileName: fileName,
            fileType: fileType || 'application/octet-stream',
            downloadUrl: url,
            fileSize: decryptedArrayBuffer.byteLength,
          });
        } catch (fallbackError) {
          console.error('Fallback decryption also failed:', fallbackError);
          throw new Error(`Decryption failed: ${decryptionError.message}`);
        }
      }
    } catch (error) {
      console.error('Download process error:', error);
      setDownloadState({
        status: 'error',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  // Helper function to determine file type from name and metadata
  const getFileTypeFromName = (fileName: string, metadataType?: string): string => {
    if (metadataType && metadataType !== 'application/octet-stream') {
      return metadataType;
    }

    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension) return 'application/octet-stream';

    // Common MIME types
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'html': 'text/html',
      'js': 'application/javascript',
      'json': 'application/json',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  };

  const handleStartDownload = () => {
    processDownload(batchId, keyBase64);
  };

  const handleDownloadFile = () => {
    if (downloadState.status === 'ready' && downloadState.downloadUrl) {
      // Create a temporary link to trigger the download
      const a = document.createElement('a');
      a.href = downloadState.downloadUrl;
      a.download = downloadState.fileName || `file-${batchId}.bin`;
      document.body.appendChild(a);
      a.click();

      // Remove the element
      setTimeout(() => {
        document.body.removeChild(a);

        // Update status to complete
        setDownloadState(prev => ({
          ...prev,
          status: 'complete',
          message: 'Download complete!',
        }));
      }, 100);
    }
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

  const resetDownload = () => {
    // Revoke the URL if it exists
    if (downloadState.downloadUrl) {
      URL.revokeObjectURL(downloadState.downloadUrl);
    }

    // Reset to idle state
    setDownloadState({
      status: 'idle',
      progress: 0,
      message: '',
    });
  };

  // Helper function to validate chunk structure for debugging purposes
  const validateChunkStructure = (chunk: ArrayBuffer): string => {
    const data = new Uint8Array(chunk);

    // Check minimum size
    if (data.length < 16) {
      return `Too small: ${data.length} bytes`;
    }

    // Check for reasonable IV size (should be 12 bytes for AES-GCM)
    const possibleIV = data.slice(0, 12);

    // Check if the data looks reasonably random (as encrypted data should)
    let hasZeroSequence = false;
    let hasNonZeroVariation = false;
    let zeroCount = 0;

    // Look for patterns in the first 100 bytes
    const sampleSize = Math.min(100, data.length);
    for (let i = 12; i < sampleSize; i++) {
      if (data[i] === 0) {
        zeroCount++;
        if (zeroCount > 8) {
          hasZeroSequence = true;
        }
      } else {
        zeroCount = 0;
        hasNonZeroVariation = true;
      }
    }

    const result = [];
    if (hasZeroSequence) {
      result.push("Has unusual zero sequences");
    }
    if (!hasNonZeroVariation) {
      result.push("Lacks expected byte variation");
    }

    // Check basic structure expectations for AES-GCM encrypted data
    if (result.length === 0) {
      return `Appears valid (${data.length} bytes with proper IV structure)`;
    } else {
      return `Possible issues: ${result.join(", ")}`;
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
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
              onClick={handleStartDownload}
              disabled={!batchId || !keyBase64 || previewState === 'error'}
            >
              Prepare File
            </button>
          </div>
        </div>
      ) : (
        <div className="download-status">
          {['loading', 'downloading', 'decrypting', 'preparing'].includes(downloadState.status) && (
            <div className="loading-container">
              <div className="loading-spinner">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
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
              <p className="loading-message">{downloadState.message}</p>

              {/* MEGA-like phased download interface */}
              <div className="download-phases">
                {/* Phase 1: Downloading */}
                <div className={`download-phase ${downloadState.status === 'downloading' ? 'active' : downloadState.status === 'decrypting' || downloadState.status === 'preparing' ? 'completed' : ''}`}>
                  <div className="download-phase-icon">
                    {downloadState.status === 'downloading' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : downloadState.status === 'decrypting' || downloadState.status === 'preparing' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" />
                      </svg>
                    )}
                  </div>
                  <div className="download-phase-content">
                    <div className="download-phase-title">Downloading</div>
                    <div className="download-phase-description">
                      {downloadState.status === 'downloading'
                        ? `Downloading encrypted file chunks...`
                        : downloadState.status === 'decrypting' || downloadState.status === 'preparing'
                          ? 'Download complete!'
                          : 'Waiting to start...'}
                    </div>
                    {downloadState.status === 'downloading' && (
                      <div className="download-phase-progress">
                        <div
                          className="download-phase-progress-bar"
                          style={{ width: `${Math.min(100, downloadState.progress * 3)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Phase 2: Decryption */}
                <div className={`download-phase ${downloadState.status === 'decrypting' ? 'active' : downloadState.status === 'preparing' ? 'completed' : ''}`}>
                  <div className="download-phase-icon">
                    {downloadState.status === 'decrypting' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
                        <path d="M21 2L19 4M19 4L21 6M19 4H22M16 2L18 4M18 4L16 6M18 4H15M12.5 6.5C12.5 6.5 15 9 15 11C15 13 13.5 14 11.5 14C9.5 14 8 13 8 11C8 9 10.5 6.5 10.5 6.5M12 22V16M15 19L12 16L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : downloadState.status === 'preparing' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" />
                      </svg>
                    )}
                  </div>
                  <div className="download-phase-content">
                    <div className="download-phase-title">Decryption</div>
                    <div className="download-phase-description">
                      {downloadState.status === 'decrypting'
                        ? 'Decrypting file in your browser...'
                        : downloadState.status === 'preparing'
                          ? 'Decryption complete!'
                          : 'Waiting for download to finish...'}
                    </div>
                    {downloadState.status === 'decrypting' && (
                      <div className="download-phase-progress">
                        <div
                          className="download-phase-progress-bar"
                          style={{ width: `${downloadState.progress > 30 ? (downloadState.progress - 30) * (100 / 40) : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Phase 3: Preparation */}
                <div className={`download-phase ${downloadState.status === 'preparing' ? 'active' : ''}`}>
                  <div className="download-phase-icon">
                    {downloadState.status === 'preparing' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
                        <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" />
                      </svg>
                    )}
                  </div>
                  <div className="download-phase-content">
                    <div className="download-phase-title">Preparing File</div>
                    <div className="download-phase-description">
                      {downloadState.status === 'preparing'
                        ? 'Preparing file for download...'
                        : 'Waiting for decryption to finish...'}
                    </div>
                    {downloadState.status === 'preparing' && (
                      <div className="download-phase-progress">
                        <div
                          className="download-phase-progress-bar"
                          style={{ width: `${downloadState.progress > 75 ? (downloadState.progress - 75) * 4 : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="progress-container">
                <div
                  className="progress-bar"
                  style={{ width: `${downloadState.progress}%` }}
                />
              </div>
              <p className="progress-text">{downloadState.progress}% Complete</p>
              {downloadState.status === 'decrypting' && (
                <p className="decryption-note">
                  Decryption is processing in your browser. For large files, this may take some time.
                </p>
              )}
            </div>
          )}

          {downloadState.status === 'ready' && (
            <div className="file-ready-container">
              <div className="success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="success-message">{downloadState.message}</p>
              <div className="file-details-card">
                <div className="file-icon-large">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="file-name">{downloadState.fileName}</h3>
                <p className="file-meta">
                  {downloadState.fileType} • {formatFileSize(downloadState.fileSize || 0)}
                </p>
                <p className="file-ready-info">
                  Your file has been decrypted and is ready to download.
                </p>
              </div>
              <div className="action-buttons">
                <button
                  className="button button-primary"
                  onClick={handleDownloadFile}
                >
                  Download Now
                </button>
                <button
                  className="button button-secondary"
                  onClick={resetDownload}
                >
                  Prepare Another File
                </button>
              </div>
            </div>
          )}

          {downloadState.status === 'error' && (
            <div className="error-container">
              <div className="error-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="error-message">{downloadState.message}</p>
              <button
                className="button"
                onClick={resetDownload}
              >
                Try Again
              </button>
            </div>
          )}

          {downloadState.status === 'complete' && (
            <div className="success-container">
              <div className="success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="success-message">{downloadState.message}</p>
              <button
                className="button"
                onClick={resetDownload}
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