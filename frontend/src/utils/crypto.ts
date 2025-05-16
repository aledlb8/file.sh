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
  
  // Read file as ArrayBuffer
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
  const encryptedArray = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  encryptedArray.set(iv, 0);
  encryptedArray.set(new Uint8Array(encryptedBuffer), iv.length);
  
  // Return as Blob
  return new Blob([encryptedArray], { type: 'application/octet-stream' });
};

/**
 * Decrypt a file with the provided key
 */
export const decryptFile = async (encryptedBlob: Blob, key: CryptoKey): Promise<Blob> => {
  // Read the encrypted blob as ArrayBuffer
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  const encryptedArray = new Uint8Array(encryptedBuffer);
  
  // Extract IV from the beginning of the data
  const iv = encryptedArray.slice(0, IV_LENGTH);
  
  // Extract encrypted data (everything after IV)
  const encryptedData = encryptedArray.slice(IV_LENGTH);
  
  // Decrypt the data
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    encryptedData
  );
  
  // Return as Blob
  return new Blob([decryptedBuffer], { type: 'application/octet-stream' });
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