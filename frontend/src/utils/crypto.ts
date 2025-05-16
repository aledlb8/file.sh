/**
 * Crypto utilities for end-to-end encryption
 * Using the Web Crypto API for all cryptographic operations
 */

// AES-GCM parameters
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes

/**
 * Generate a new encryption key
 */
export const generateEncryptionKey = async (): Promise<CryptoKey> => {
  return window.crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
};

/**
 * Import an encryption key from base64
 */
export const importEncryptionKey = async (keyBase64: string): Promise<CryptoKey> => {
  const keyData = base64ToArrayBuffer(keyBase64);
  return window.crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false, // not extractable
    ['decrypt']
  );
};

/**
 * Encrypt a file with the provided key
 */
export const encryptFile = async (file: File, key: CryptoKey): Promise<Blob> => {
  // Generate random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  console.log('Generated IV for encryption:', Array.from(iv));
  
  // For large files, we'll encrypt in chunks to avoid memory issues
  if (file.size > 25 * 1024 * 1024) { // 25MB
    return encryptLargeFile(file, key, iv);
  }
  
  try {
    // Read the file as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    
    // Encrypt the file
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      fileBuffer
    );
    
    // Combine IV and encrypted data
    // IMPORTANT: This IV must be preserved with the first chunk for decryption
    const encryptedArray = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    encryptedArray.set(iv, 0);
    encryptedArray.set(new Uint8Array(encryptedBuffer), iv.length);
    
    console.log(`Encryption successful: ${encryptedArray.length} bytes (includes ${iv.length} bytes IV)`);
    
    // Return as Blob
    return new Blob([encryptedArray], { type: 'application/octet-stream' });
  } catch (error) {
    console.error('Error during file encryption:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Encrypt a large file in chunks
 * NOTE: For AES-GCM, we encrypt the entire file as one unit but process the reading/writing in chunks
 */
async function encryptLargeFile(file: File, key: CryptoKey, iv: Uint8Array): Promise<Blob> {
  console.log(`Using chunked reading for large file encryption (${file.size} bytes)`);
  
  // For truly massive files (>500MB), we need to use a streaming approach
  if (file.size > 500 * 1024 * 1024) {
    return encryptStreamingLargeFile(file, key, iv);
  }
  
  try {
    // Read the file in chunks to avoid memory issues
    const CHUNK_READ_SIZE = 50 * 1024 * 1024; // 50MB chunks for reading
    const totalChunks = Math.ceil(file.size / CHUNK_READ_SIZE);
    
    console.log(`Reading file in ${totalChunks} chunks of ${CHUNK_READ_SIZE} bytes`);
    
    // Prepare a buffer for the entire file
    const fileBuffer = new ArrayBuffer(file.size);
    const fileView = new Uint8Array(fileBuffer);
    
    // Read the file in chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_READ_SIZE;
      const end = Math.min(start + CHUNK_READ_SIZE, file.size);
      
      console.log(`Reading chunk ${i+1}/${totalChunks}: ${start}-${end} (${end - start} bytes)`);
      
      // Read this chunk
      const chunkBlob = file.slice(start, end);
      const chunkBuffer = await chunkBlob.arrayBuffer();
      
      // Copy into the main buffer
      fileView.set(new Uint8Array(chunkBuffer), start);
      
      // Give the browser a moment to breathe between large chunks
      if (i % 2 === 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log(`File read complete. Encrypting ${fileBuffer.byteLength} bytes...`);
    
    // Encrypt the entire file in one operation
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      fileBuffer
    );
    
    console.log(`Encryption complete: ${encryptedBuffer.byteLength} bytes`);
    
    // Combine IV with encrypted data
    const resultArray = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    resultArray.set(iv, 0);
    resultArray.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Return as blob for chunked uploading
    return new Blob([resultArray], { type: 'application/octet-stream' });
  } catch (error) {
    console.error('Error during large file encryption:', error);
    throw new Error(`Large file encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypt extremely large files using a streaming approach
 * This divides the file into segments and encrypts each separately
 */
async function encryptStreamingLargeFile(file: File, key: CryptoKey, iv: Uint8Array): Promise<Blob> {
  console.log(`Using streaming approach for very large file encryption (${file.size} bytes)`);
  
  try {
    // For extremely large files, we encrypt in segments but ensure we create proper final chunks
    // that match our chunk upload size (CHUNK_SIZE from Uploader.tsx which is 5MB)
    const SEGMENT_SIZE = 100 * 1024 * 1024; // 100MB segments for processing
    const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for final output
    const totalSegments = Math.ceil(file.size / SEGMENT_SIZE);
    
    console.log(`Will encrypt file in ${totalSegments} segments of ~${SEGMENT_SIZE} bytes each`);
    console.log(`Final output should produce approximately ${Math.ceil((file.size + IV_LENGTH + 16) / UPLOAD_CHUNK_SIZE)} upload chunks of ~${UPLOAD_CHUNK_SIZE} bytes each`);
    
    // Create an array to hold all encrypted data
    // For AES-GCM, each segment will be slightly larger due to auth tag
    const encryptedSegments: ArrayBuffer[] = [];
    let totalEncryptedSize = IV_LENGTH; // Start with IV size
    
    // First segment needs special handling to include IV
    console.log(`Processing first segment with IV...`);
    const firstSegmentEnd = Math.min(SEGMENT_SIZE, file.size);
    const firstSegmentBlob = file.slice(0, firstSegmentEnd);
    const firstSegmentBuffer = await firstSegmentBlob.arrayBuffer();
    
    console.log(`First segment raw size: ${firstSegmentBuffer.byteLength} bytes`);
    
    // Encrypt first segment
    const firstEncryptedSegment = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      firstSegmentBuffer
    );
    
    // Store size for later
    totalEncryptedSize += firstEncryptedSegment.byteLength;
    
    // Create final data with IV at the beginning
    const firstSegmentWithIV = new Uint8Array(IV_LENGTH + firstEncryptedSegment.byteLength);
    firstSegmentWithIV.set(iv, 0);
    firstSegmentWithIV.set(new Uint8Array(firstEncryptedSegment), IV_LENGTH);
    
    // Add to encrypted segments
    encryptedSegments.push(firstSegmentWithIV.buffer);
    
    console.log(`First segment encrypted: ${firstSegmentWithIV.length} bytes (includes ${IV_LENGTH} bytes IV)`);
    
    // For debugging, log the first few bytes to verify IV is included properly
    const firstFewBytes = Array.from(firstSegmentWithIV.slice(0, 16));
    console.log(`First 16 bytes of encrypted data (should start with IV): ${JSON.stringify(firstFewBytes)}`);
    
    // Process remaining segments if any
    for (let i = 1; i < totalSegments; i++) {
      const segmentStart = i * SEGMENT_SIZE;
      const segmentEnd = Math.min(segmentStart + SEGMENT_SIZE, file.size);
      const segmentSize = segmentEnd - segmentStart;
      
      console.log(`Processing segment ${i+1}/${totalSegments}: ${segmentStart}-${segmentEnd} (${segmentSize} bytes)`);
      
      // Read this segment
      const segmentBlob = file.slice(segmentStart, segmentEnd);
      const segmentBuffer = await segmentBlob.arrayBuffer();
      
      // Encrypt this segment - note we must use the same IV for decryption to work properly
      const encryptedSegment = await window.crypto.subtle.encrypt(
        {
          name: ALGORITHM,
          iv: iv,
        },
        key,
        segmentBuffer
      );
      
      // Add to encrypted segments
      encryptedSegments.push(encryptedSegment);
      totalEncryptedSize += encryptedSegment.byteLength;
      
      console.log(`Segment ${i+1} encrypted: ${encryptedSegment.byteLength} bytes`);
      
      // Force a small delay to let the browser breathe
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`All segments encrypted. Total encrypted size: ${totalEncryptedSize} bytes`);
    
    // Create a blob from all encrypted segments - this will be the final blob
    // that prepareFileChunks will divide into proper 5MB chunks for upload
    const finalBlob = new Blob(encryptedSegments, { type: 'application/octet-stream' });
    
    console.log(`Final encrypted blob size: ${finalBlob.size} bytes`);
    
    // Verify the final size matches what we calculated
    if (finalBlob.size !== totalEncryptedSize) {
      console.warn(`Size mismatch! Calculated: ${totalEncryptedSize}, Actual: ${finalBlob.size}`);
    }
    
    // For debugging, sample a few bytes from different parts of the final blob
    try {
      // Sample beginning (should contain IV in first segment)
      const startSample = await finalBlob.slice(0, 16).arrayBuffer();
      const startBytes = new Uint8Array(startSample);
      console.log(`First 16 bytes of final blob: ${Array.from(startBytes)}`);
      
      // Sample middle (if blob is large enough)
      if (finalBlob.size > UPLOAD_CHUNK_SIZE * 3) {
        const middleSample = await finalBlob.slice(UPLOAD_CHUNK_SIZE * 2, UPLOAD_CHUNK_SIZE * 2 + 16).arrayBuffer();
        const middleBytes = new Uint8Array(middleSample);
        console.log(`16 bytes from middle of blob: ${Array.from(middleBytes)}`);
      }
      
      // Final check - make sure our blob can be divided into chunks
      const expectedChunks = Math.ceil(finalBlob.size / UPLOAD_CHUNK_SIZE);
      console.log(`Final blob can be divided into approximately ${expectedChunks} upload chunks of ${UPLOAD_CHUNK_SIZE} bytes each`);
    } catch (debugErr) {
      console.error('Error during debug sampling:', debugErr);
      // Continue with normal operation
    }
    
    // Return the final blob for chunking and upload
    return finalBlob;
  } catch (error) {
    console.error('Error during streaming encryption:', error);
    throw new Error(`Streaming encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt a file with the provided key
 */
export const decryptFile = async (encryptedBlob: Blob, key: CryptoKey): Promise<Blob> => {
  try {
    console.log(`Attempting to decrypt blob of size ${encryptedBlob.size} bytes`);
    
    // For very large files, let's use a chunk-based approach
    if (encryptedBlob.size > 10 * 1024 * 1024) { // 10MB
      console.log('Large file detected, using chunked decryption approach');
      return await decryptLargeFile(encryptedBlob, key);
    }
    
    // Standard approach for smaller files
    // Read the encrypted blob as ArrayBuffer
    const encryptedBuffer = await encryptedBlob.arrayBuffer();
    const encryptedArray = new Uint8Array(encryptedBuffer);
    
    // Make sure we have enough data for the IV
    if (encryptedArray.length < IV_LENGTH) {
      throw new Error(`Encrypted data too small (${encryptedArray.length} bytes) to contain IV (${IV_LENGTH} bytes)`);
    }
    
    // Extract IV from the beginning of the data
    const iv = encryptedArray.slice(0, IV_LENGTH);
    console.log('IV for decryption:', Array.from(iv));
    
    // Extract encrypted data (everything after IV)
    const encryptedData = encryptedArray.slice(IV_LENGTH);
    console.log(`Attempting to decrypt ${encryptedData.length} bytes of data`);
    
    // Check for empty data
    if (encryptedData.length === 0) {
      throw new Error('No encrypted data found after IV');
    }
    
    // Decrypt the data
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      encryptedData
    );
    
    console.log(`Decryption successful, got ${decryptedBuffer.byteLength} bytes of data`);
    
    // Return as Blob
    return new Blob([decryptedBuffer], { type: 'application/octet-stream' });
  } catch (error) {
    console.error('Error during file decryption:', error);
    
    // Try with special handling for certain error types
    if (error instanceof DOMException && error.message.includes('operation-specific reason')) {
      try {
        console.log('Attempting alternative decryption approach...');
        
        // Sometimes AES-GCM decryption fails due to tag verification
        // Let's try to re-run the decryption with a different approach
        const encryptedBuffer = await encryptedBlob.arrayBuffer();
        const encryptedArray = new Uint8Array(encryptedBuffer);
        
        // For files from certain sources, IV might be stored differently
        // Try a few different IV sizes/locations
        
        // Standard approach (IV at beginning)
        const iv = encryptedArray.slice(0, IV_LENGTH);
        
        // Try to decrypt with just raw data (if IV is perhaps not included)
        if (encryptedArray.length > 1000) { // Only try for reasonably sized data
          try {
            // If the data is very large, let's just decrypt a subset to test
            const testSlice = encryptedArray.slice(0, 1000);
            console.log('Testing decryption with a subset of data...');
            
            // Try to decrypt it
            await window.crypto.subtle.decrypt(
              {
                name: ALGORITHM, 
                iv
              },
              key,
              testSlice
            );
            
            // If it works, continue with the full data
            console.log('Test decryption succeeded, proceeding with full data');
          } catch (subsetError) {
            console.warn('Test decryption failed:', subsetError);
            // Continue with the normal fallback approach
          }
        }
        
        // Last resort: try to decrypt the raw blob as is
        console.log('Trying raw decryption...');
        const rawDecryptedBuffer = await window.crypto.subtle.decrypt(
          {
            name: ALGORITHM,
            iv,
          },
          key,
          encryptedArray
        );
        
        console.log(`Raw decryption successful, got ${rawDecryptedBuffer.byteLength} bytes`);
        return new Blob([rawDecryptedBuffer], { type: 'application/octet-stream' });
      } catch (fallbackError) {
        console.error('Alternative decryption approach failed:', fallbackError);
        // Let's try the chunked approach as a final fallback
        try {
          return await decryptLargeFile(encryptedBlob, key);
        } catch (chunkError) {
          console.error('Chunked decryption also failed:', chunkError);
          // Throw the original error if all fallbacks fail
          throw error;
        }
      }
    }
    
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Special function to decrypt very large files by processing them in smaller chunks
 */
async function decryptLargeFile(encryptedBlob: Blob, key: CryptoKey): Promise<Blob> {
  console.log('Attempting chunked decryption for large file');
  
  // First, extract the IV from the beginning of the blob
  const ivBuffer = await encryptedBlob.slice(0, IV_LENGTH).arrayBuffer();
  const iv = new Uint8Array(ivBuffer);
  console.log('Using IV for chunked decryption:', Array.from(iv));
  
  // Create smaller chunks for decryption to avoid memory issues
  const DECRYPT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for decryption
  const totalChunks = Math.ceil((encryptedBlob.size - IV_LENGTH) / DECRYPT_CHUNK_SIZE);
  console.log(`Splitting large file into ${totalChunks} chunks for decryption`);
  
  // Array to store all decrypted chunks
  const decryptedChunks: Uint8Array[] = [];
  let successfulDecryption = false;
  
  // Try decrypting one small chunk first to validate approach
  try {
    // Get the first chunk after the IV
    const firstChunkBlob = encryptedBlob.slice(IV_LENGTH, IV_LENGTH + Math.min(1024 * 1024, encryptedBlob.size - IV_LENGTH));
    const firstChunkData = new Uint8Array(await firstChunkBlob.arrayBuffer());
    
    // Try decrypting just this chunk to see if our approach works
    const testDecrypted = await window.crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      firstChunkData
    );
    
    console.log('Test chunk decryption successful, proceeding with full file');
    successfulDecryption = true;
    
    // Proceed with the actual chunked decryption
    // We need to re-combine the chunks in a different way for AES-GCM
    // This ensures we handle the authentication tag correctly
    
    // Get all the encrypted data after the IV
    const encryptedData = new Uint8Array(await encryptedBlob.slice(IV_LENGTH).arrayBuffer());
    
    // Process in smaller chunks while maintaining memory efficiency
    for (let i = 0; i < totalChunks; i++) {
      const start = i * DECRYPT_CHUNK_SIZE;
      const end = Math.min(start + DECRYPT_CHUNK_SIZE, encryptedData.length);
      
      // Only process if we have data in this range
      if (start < encryptedData.length) {
        const chunkData = encryptedData.slice(start, end);
        
        try {
          // Try decrypting this chunk
          const decryptedChunk = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            chunkData
          );
          
          decryptedChunks.push(new Uint8Array(decryptedChunk));
          console.log(`Successfully decrypted chunk ${i+1}/${totalChunks}, size: ${decryptedChunk.byteLength} bytes`);
          
          // Give browser a moment to breathe after a few chunks
          if (i % 3 === 2) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (chunkError) {
          console.error(`Failed to decrypt chunk ${i+1}:`, chunkError);
          throw chunkError;
        }
      }
    }
  } catch (error) {
    console.error('Chunked decryption approach failed:', error);
    
    // If individual chunk decryption didn't work, try decrypting the entire content at once
    if (!successfulDecryption) {
      try {
        console.log('Trying alternate approach: decrypt entire content at once');
        const encryptedData = new Uint8Array(await encryptedBlob.slice(IV_LENGTH).arrayBuffer());
        
        // Attempt to decrypt all data at once
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          encryptedData
        );
        
        console.log(`Full file decryption successful, got ${decryptedBuffer.byteLength} bytes`);
        return new Blob([decryptedBuffer], { type: 'application/octet-stream' });
      } catch (finalError) {
        console.error('All decryption approaches failed:', finalError);
        throw new Error('Failed to decrypt file: all approaches exhausted');
      }
    }
  }
  
  // Combine all successfully decrypted chunks
  if (decryptedChunks.length > 0) {
    // Calculate total size
    const totalSize = decryptedChunks.reduce((size, chunk) => size + chunk.byteLength, 0);
    const combinedData = new Uint8Array(totalSize);
    
    // Combine the chunks
    let offset = 0;
    for (const chunk of decryptedChunks) {
      combinedData.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    console.log(`Combined ${decryptedChunks.length} decrypted chunks (${totalSize} bytes)`);
    return new Blob([combinedData], { type: 'application/octet-stream' });
  }
  
  throw new Error('Failed to decrypt any chunks of the file');
}

/**
 * Batch decrypt multiple chunks with the same key and IV
 * This is more efficient than decrypting each chunk separately
 */
export const batchDecryptChunks = async (
  encryptedChunks: ArrayBuffer[], 
  key: CryptoKey
): Promise<ArrayBuffer> => {
  if (encryptedChunks.length === 0) {
    throw new Error('No chunks to decrypt');
  }
  
  try {
    // First chunk contains the IV
    const firstChunk = new Uint8Array(encryptedChunks[0]);
    
    // Make sure we have enough data for the IV
    if (firstChunk.length < IV_LENGTH) {
      throw new Error('First chunk is too small to contain IV');
    }
    
    const iv = firstChunk.slice(0, IV_LENGTH);
    
    // For safety, let's log the IV
    console.log('IV for decryption:', Array.from(iv));
    
    // Important: For AES-GCM, we can't simply concatenate encrypted chunks
    // Each chunk needs separate decryption because of the authentication tag
    
    // First approach: try to decrypt each chunk separately and combine the results
    console.log(`Attempting to decrypt ${encryptedChunks.length} chunks separately`);
    
    // Array to hold decrypted chunks
    const decryptedChunks: ArrayBuffer[] = [];
    
    // Special handling for first chunk which contains the IV
    try {
      const firstChunkData = firstChunk.slice(IV_LENGTH);
      if (firstChunkData.length > 0) {
        // Decrypt the first chunk (skipping the IV)
        console.log(`Decrypting first chunk, size: ${firstChunkData.length} bytes`);
        const firstDecrypted = await window.crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          firstChunkData
        );
        
        decryptedChunks.push(firstDecrypted);
        console.log(`First chunk decrypted, size: ${firstDecrypted.byteLength} bytes`);
      }
      
      // Process remaining chunks with possible pausing for memory cleanup
      for (let i = 1; i < encryptedChunks.length; i++) {
        const chunkData = new Uint8Array(encryptedChunks[i]);
        console.log(`Decrypting chunk ${i}, size: ${chunkData.length} bytes`);
        
        // Give browser some breathing room every few chunks
        if (i % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        try {
          const decrypted = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            chunkData
          );
          
          decryptedChunks.push(decrypted);
          console.log(`Chunk ${i} decrypted, size: ${decrypted.byteLength} bytes`);
        } catch (chunkError) {
          console.error(`Failed to decrypt chunk ${i}:`, chunkError);
          
          // Try with tagless approach as fallback for this chunk
          try {
            // Sometimes chunks have 16-byte auth tag at start or end
            // Try removing first 16 bytes (potential auth tag)
            if (chunkData.length > 16) {
              const trimmedStart = chunkData.slice(16);
              const decryptedTrimmed = await window.crypto.subtle.decrypt(
                { name: ALGORITHM, iv },
                key,
                trimmedStart
              );
              
              decryptedChunks.push(decryptedTrimmed);
              console.log(`Chunk ${i} decrypted after trimming 16 bytes from start, size: ${decryptedTrimmed.byteLength} bytes`);
              continue;
            }
          } catch (trimStartError) {
            console.warn(`Failed to decrypt chunk ${i} even with trimming:`, trimStartError);
          }
          
          // If we still can't decrypt, just skip this chunk
          console.warn(`Skipping chunk ${i} due to decryption failure`);
        }
      }
      
      // If we have any decrypted chunks, combine them
      if (decryptedChunks.length > 0) {
        // Calculate the total size
        const totalSize = decryptedChunks.reduce((size, chunk) => size + chunk.byteLength, 0);
        console.log(`Combining ${decryptedChunks.length} decrypted chunks, total size: ${totalSize} bytes`);
        
        // Create a combined buffer
        const combinedData = new Uint8Array(totalSize);
        let offset = 0;
        
        // Copy each chunk's data
        for (const chunk of decryptedChunks) {
          combinedData.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        
        return combinedData.buffer;
      }
    } catch (separateChunkError) {
      console.error('Individual chunk decryption approach failed:', separateChunkError);
      // Fall through to the alternative approaches
    }
    
    // If we reach here, try the alternative approach: whole file at once
    console.log('Trying alternative approach: decrypting entire file at once');
    
    try {
      // Create a blob from all the chunks for unified decryption
      const combinedBlob = new Blob(encryptedChunks, { type: 'application/octet-stream' });
      
      // Use our large file decryption function as a fallback
      const decryptedBlob = await decryptLargeFile(combinedBlob, key);
      return await decryptedBlob.arrayBuffer();
    } catch (wholeFileError) {
      console.error('Whole file decryption approach also failed:', wholeFileError);
      
      // Last resort - try with direct array manipulation
      console.log('Trying last resort approach with pure array manipulation');
      
      // Calculate total size carefully to avoid overflow
      let totalSize = 0;
      for (let i = 0; i < encryptedChunks.length; i++) {
        const chunkSize = encryptedChunks[i].byteLength;
        totalSize += chunkSize - (i === 0 ? IV_LENGTH : 0);
      }
      
      console.log(`Preparing buffer for ${totalSize} bytes of data`);
      
      // Create a buffer for the combined data
      const combinedEncrypted = new Uint8Array(totalSize);
      let offset = 0;
      
      // Copy data from all chunks into a single buffer
      for (let i = 0; i < encryptedChunks.length; i++) {
        const chunkData = new Uint8Array(encryptedChunks[i]);
        
        // Skip the IV in the first chunk
        const dataStart = i === 0 ? IV_LENGTH : 0;
        const dataLength = chunkData.length - dataStart;
        
        // Check for invalid chunks
        if (dataLength <= 0) {
          console.warn(`Skipping chunk ${i}: Invalid length ${dataLength}`);
          continue;
        }
        
        // Copy this chunk's data (skipping IV if it's the first chunk)
        const dataSlice = chunkData.slice(dataStart);
        
        // Make sure we don't overflow the buffer
        if (offset + dataSlice.length > combinedEncrypted.length) {
          console.warn(`Buffer overflow prevented: chunk ${i} would exceed allocated space`);
          break;
        }
        
        combinedEncrypted.set(dataSlice, offset);
        offset += dataSlice.length;
      }
      
      // Trim if we didn't fill the buffer
      const actualData = offset < totalSize ? 
        combinedEncrypted.slice(0, offset) : 
        combinedEncrypted;
      
      console.log(`Final attempt: decrypting ${actualData.length} bytes with IV`);
      
      try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          actualData
        );
        
        console.log(`Last resort decryption successful, got ${decryptedBuffer.byteLength} bytes`);
        return decryptedBuffer;
      } catch (finalError) {
        console.error('All decryption attempts failed:', finalError);
        throw new Error('Unable to decrypt the file after multiple attempts');
      }
    }
  } catch (error) {
    console.error('Error during batch decryption:', error);
    throw new Error(`Batch decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Convert ArrayBuffer to Base64 string
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

/**
 * Convert Base64 string to ArrayBuffer
 */
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Specialized decryption for files uploaded in chunks
 * This handles the peculiarities of AES-GCM authentication and chunking
 */
export const decryptChunkedFile = async (encryptedChunks: ArrayBuffer[], key: CryptoKey): Promise<ArrayBuffer> => {
  if (!encryptedChunks.length) {
    throw new Error('No chunks provided for decryption');
  }
  
  try {
    console.log(`Attempting to decrypt ${encryptedChunks.length} chunks with specialized chunked approach`);
    console.log(`Total encrypted size: ${encryptedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0)} bytes`);
    
    // Extract the IV from the first chunk
    const firstChunkData = new Uint8Array(encryptedChunks[0]);
    if (firstChunkData.length < IV_LENGTH) {
      throw new Error(`First chunk too small (${firstChunkData.length}) to contain IV (${IV_LENGTH})`);
    }
    
    const iv = firstChunkData.slice(0, IV_LENGTH);
    console.log('Using IV for decryption:', Array.from(iv));
    
    // CRITICAL FIX: The entire encryption was done as a single operation
    // Even though we upload/download in chunks, we need to reconstruct the
    // full data exactly as it was encrypted
    
    // Determine total size (accounting for IV in first chunk)
    let totalDataSize = 0;
    encryptedChunks.forEach((chunk, i) => {
      totalDataSize += chunk.byteLength - (i === 0 ? IV_LENGTH : 0);
    });
    console.log(`Reconstructing ${totalDataSize} bytes of encrypted data from ${encryptedChunks.length} chunks`);
    
    // Show detailed chunk info for debugging
    encryptedChunks.forEach((chunk, i) => {
      console.log(`Chunk ${i}: ${chunk.byteLength} bytes${i === 0 ? ` (includes ${IV_LENGTH} bytes IV)` : ''}`);
    });
    
    // Reconstruct the original encrypted data
    let combinedEncryptedData = new Uint8Array(totalDataSize);
    let offset = 0;
    
    // Copy data from chunks (skipping IV in first chunk)
    for (let i = 0; i < encryptedChunks.length; i++) {
      const chunkData = new Uint8Array(encryptedChunks[i]);
      const dataStart = i === 0 ? IV_LENGTH : 0;
      const dataToAdd = chunkData.slice(dataStart);
      
      if (offset + dataToAdd.length > combinedEncryptedData.length) {
        console.warn(`Buffer overflow prevented: chunk ${i} would exceed allocated space. Adjusting buffer size.`);
        
        // Create a larger buffer
        const newBuffer = new Uint8Array(offset + dataToAdd.length);
        newBuffer.set(combinedEncryptedData.slice(0, offset), 0);
        combinedEncryptedData = newBuffer;
      }
      
      combinedEncryptedData.set(dataToAdd, offset);
      offset += dataToAdd.length;
      
      if (i % 10 === 0 || i === encryptedChunks.length - 1) {
        console.log(`Progress: Added ${i+1}/${encryptedChunks.length} chunks (${offset} bytes so far)`);
      }
    }
    
    // If we didn't use the entire buffer, trim it
    const finalEncryptedData = offset < combinedEncryptedData.length 
      ? combinedEncryptedData.slice(0, offset) 
      : combinedEncryptedData;
    
    console.log(`Assembled ${finalEncryptedData.length} bytes of encrypted data for decryption`);
    
    // Create a status display method similar to what mega.nz does
    const updateStatus = (phase: string, detail: string) => {
      console.log(`Decryption status: ${phase} - ${detail}`);
      // You could emit an event or use a callback here if you want to show this in the UI
    };
    
    // Try different decryption approaches in sequence
    updateStatus("Phase 1/4", "Attempting direct decryption");
    
    // Approach 1: Try straightforward decryption of the whole data
    try {
      updateStatus("Phase 1/4", `Processing ${finalEncryptedData.length} bytes`);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        finalEncryptedData
      );
      updateStatus("Complete", `Decryption successful! Got ${decryptedBuffer.byteLength} bytes`);
      return decryptedBuffer;
    } catch (error) {
      console.error('Direct decryption failed:', error);
      updateStatus("Phase 1/4", "Failed - trying alternative approaches");
      // Continue to next approach
    }
    
    // Approach 2: Handle potential AES-GCM authentication tag placement issues
    updateStatus("Phase 2/4", "Checking for authentication tag issues");
    try {
      // Some implementations place the auth tag at the end, some in each chunk
      // Let's try removing 16 bytes (standard auth tag size) from the end
      if (finalEncryptedData.length > 16) {
        updateStatus("Phase 2/4", "Removing authentication tag from end");
        const dataWithoutEndTag = finalEncryptedData.slice(0, finalEncryptedData.length - 16);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          dataWithoutEndTag
        );
        updateStatus("Complete", `Decryption successful with auth tag adjustment! Got ${decryptedBuffer.byteLength} bytes`);
        return decryptedBuffer;
      }
    } catch (error) {
      console.error('Auth tag adjustment approach failed:', error);
      updateStatus("Phase 2/4", "Failed - continuing with next approach");
      // Continue to next approach
    }
    
    // Approach 3: Try with different chunk arrangements
    updateStatus("Phase 3/4", "Trying alternative chunk arrangements");
    try {
      // Sometimes we need to try decrypting specific chunks or combinations
      
      // Try first chunk only (most common case for small files)
      if (encryptedChunks.length > 0) {
        updateStatus("Phase 3/4", "Trying with first chunk only");
        
        // Extract first chunk data (without IV)
        const firstChunkContent = firstChunkData.slice(IV_LENGTH);
        
        if (firstChunkContent.length > 0) {
          const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            firstChunkContent
          );
          updateStatus("Complete", `Single chunk decryption successful! Got ${decryptedBuffer.byteLength} bytes`);
          return decryptedBuffer;
        }
      }
      
      // Try with pairs of chunks if we have at least 2
      if (encryptedChunks.length >= 2) {
        updateStatus("Phase 3/4", "Trying with first two chunks combined");
        
        const chunk1Data = new Uint8Array(encryptedChunks[0]).slice(IV_LENGTH);
        const chunk2Data = new Uint8Array(encryptedChunks[1]);
        
        const combinedData = new Uint8Array(chunk1Data.length + chunk2Data.length);
        combinedData.set(chunk1Data, 0);
        combinedData.set(chunk2Data, chunk1Data.length);
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          combinedData
        );
        updateStatus("Complete", `Two-chunk decryption successful! Got ${decryptedBuffer.byteLength} bytes`);
        return decryptedBuffer;
      }
    } catch (error) {
      console.error('Alternative chunk arrangement approach failed:', error);
      updateStatus("Phase 3/4", "Failed - trying last resort approach");
    }
    
    // Approach 4: Last resort - try with raw data of all chunks
    updateStatus("Phase 4/4", "Attempting last resort approach");
    try {
      // Create blob with all chunks and try to decrypt it
      const combinedBlob = new Blob(encryptedChunks);
      const rawData = new Uint8Array(await combinedBlob.arrayBuffer());
      
      updateStatus("Phase 4/4", `Processing ${rawData.length} bytes of raw data`);
      
      // Extract IV again for safety
      const rawIv = rawData.slice(0, IV_LENGTH);
      const rawContent = rawData.slice(IV_LENGTH);
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: ALGORITHM, iv: rawIv },
        key,
        rawContent
      );
      
      updateStatus("Complete", `Last resort decryption successful! Got ${decryptedBuffer.byteLength} bytes`);
      return decryptedBuffer;
    } catch (error) {
      console.error('All decryption approaches failed:', error);
      updateStatus("Failed", "All decryption methods unsuccessful");
      throw new Error('Unable to decrypt file after trying multiple approaches');
    }
  } catch (error) {
    console.error('Error during chunked file decryption:', error);
    throw new Error(`Chunked decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 