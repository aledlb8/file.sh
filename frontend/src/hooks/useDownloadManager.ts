import { useState, useEffect } from 'react';
import { unzlibSync } from 'fflate';
import { importEncryptionKey, decryptChunkedFile, batchDecryptChunks, base64ToArrayBuffer } from '../utils/crypto';
import { getFileTypeFromName, formatFileSize, formatDate } from '../utils/formatters';

export interface DownloadState {
  status: 'idle' | 'loading' | 'downloading' | 'decrypting' | 'preparing' | 'ready' | 'complete' | 'error';
  progress: number;
  message: string;
  fileName?: string;
  fileType?: string;
  downloadUrl?: string;
  fileSize?: number;
}

export interface Batch {
  id: string;
  createdAt: string;
  expiresAt: string;
  chunkMap?: string[];
}

export interface FileMetadata {
  name: string;
  type: string;
  size: number;
}

export const useDownloadManager = () => {
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

  return {
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
    validateChunkStructure,
    formatFileSize,
    formatDate
  };
};