/**
 * Formats a byte size into a human-readable format
 * @param bytes Number of bytes
 * @returns Formatted string like "2.5 MB"
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Formats a timestamp into a locale-specific string
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted date string
 */
export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

/**
 * Formats seconds into minutes and seconds
 * @param seconds Total seconds
 * @returns Formatted string like "2m 45s"
 */
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Calculates upload speed
 * @param uploadedBytes Bytes uploaded
 * @param elapsedSeconds Seconds elapsed
 * @returns Formatted string like "1.2 MB/s"
 */
export const calculateUploadSpeed = (uploadedBytes: number, elapsedSeconds: number): string => {
  if (elapsedSeconds === 0) return '0 B/s';
  
  const bytesPerSecond = uploadedBytes / elapsedSeconds;
  return `${formatFileSize(bytesPerSecond)}/s`;
};

/**
 * Estimates remaining time for upload
 * @param totalBytes Total bytes to upload
 * @param uploadedBytes Bytes already uploaded
 * @param elapsedSeconds Seconds elapsed so far
 * @returns Formatted time string
 */
export const estimateRemainingTime = (
  totalBytes: number, 
  uploadedBytes: number, 
  elapsedSeconds: number
): string => {
  if (uploadedBytes === 0 || elapsedSeconds === 0) return 'Calculating...';
  
  const speed = uploadedBytes / elapsedSeconds;
  const remainingBytes = totalBytes - uploadedBytes;
  const remainingSeconds = remainingBytes / speed;
  
  return formatTime(remainingSeconds);
};

/**
 * Determines the MIME type based on file name and metadata
 * @param fileName Filename with extension
 * @param metadataType Optional MIME type from metadata
 * @returns Appropriate MIME type for the file
 */
export const getFileTypeFromName = (fileName: string, metadataType?: string): string => {
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