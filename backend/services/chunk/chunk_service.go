package chunk

import (
	"context"
	"filesh/models"
	"filesh/services/storage"
	"fmt"
	"io"
	"log"
	"strconv"
	"time"
)

// Service handles chunk-related operations
type Service struct {
	storage storage.ObjectStorage
	logger  *log.Logger
}

// NewService creates a new chunk service
func NewService(storage storage.ObjectStorage, logger *log.Logger) *Service {
	if logger == nil {
		logger = log.New(log.Writer(), "[CHUNK] ", log.LstdFlags)
	}
	
	return &Service{
		storage: storage,
		logger:  logger,
	}
}

// UploadChunk uploads a file chunk to storage
func (s *Service) UploadChunk(ctx context.Context, batchID string, chunkIndex int, reader io.Reader, size int64) (*models.ChunkUploadResponse, error) {
	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)
	
	// Log chunk details
	s.logger.Printf("Uploading chunk %d for batch %s, size: %d bytes", chunkIndex, batchID, size)
	
	startTime := time.Now()
	
	// Upload the chunk
	err := s.storage.UploadObject(ctx, objectName, reader, size)
	if err != nil {
		return nil, fmt.Errorf("failed to upload chunk: %w", err)
	}
	
	uploadDuration := time.Since(startTime)
	
	// Get object info for the response
	info, err := s.storage.GetObjectInfo(ctx, objectName)
	if err != nil {
		// Even if we can't get info, we still uploaded successfully
		s.logger.Printf("Warning: Could not get object info for %s: %v", objectName, err)
		
		return &models.ChunkUploadResponse{
			Success:    true,
			BatchID:    batchID,
			ChunkIndex: chunkIndex,
			Size:       size,
			UploadTime: uploadDuration.String(),
		}, nil
	}
	
	// Check for size mismatch
	if info.Size != size {
		s.logger.Printf("WARNING: Size mismatch for chunk %d in batch %s. Expected: %d bytes, Got: %d bytes",
			chunkIndex, batchID, size, info.Size)
	}
	
	// Log successful upload
	s.logger.Printf("Successfully uploaded chunk %d for batch %s, size: %d bytes, took: %v", 
		chunkIndex, batchID, info.Size, uploadDuration)
	
	return &models.ChunkUploadResponse{
		Success:    true,
		BatchID:    batchID,
		ChunkIndex: chunkIndex,
		Size:       info.Size,
		ETag:       info.ETag,
		Uploaded:   info.LastModified.Format(time.RFC3339),
		UploadTime: uploadDuration.String(),
	}, nil
}

// CheckChunk checks if a chunk exists
func (s *Service) CheckChunk(ctx context.Context, batchID string, chunkIndex int) (*models.ChunkStatusResponse, error) {
	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)

	// Check if object exists
	exists, err := s.storage.CheckObjectExists(ctx, objectName)
	if err != nil {
		return nil, fmt.Errorf("failed to check chunk: %w", err)
	}

	if !exists {
		return &models.ChunkStatusResponse{
			Exists:     false,
			BatchID:    batchID,
			ChunkIndex: chunkIndex,
		}, nil
	}

	// Get object info
	info, err := s.storage.GetObjectInfo(ctx, objectName)
	if err != nil {
		return nil, fmt.Errorf("failed to get chunk info: %w", err)
	}

	// Return chunk information
	return &models.ChunkStatusResponse{
		Exists:     true,
		BatchID:    batchID,
		ChunkIndex: chunkIndex,
		Size:       info.Size,
		ETag:       info.ETag,
		Uploaded:   info.LastModified.Format(time.RFC3339),
	}, nil
}

// DownloadChunk downloads a chunk from storage
func (s *Service) DownloadChunk(ctx context.Context, batchID string, chunkIndex int) (io.ReadCloser, *storage.ObjectInfo, error) {
	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)
	
	// Log download request
	s.logger.Printf("Download request for chunk %d of batch %s", chunkIndex, batchID)
	
	// Check if object exists
	exists, err := s.storage.CheckObjectExists(ctx, objectName)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to check file existence: %w", err)
	}
	
	if !exists {
		return nil, nil, fmt.Errorf("chunk %d not found for batch %s", chunkIndex, batchID)
	}
	
	// Get object info for size reporting
	info, err := s.storage.GetObjectInfo(ctx, objectName)
	if err != nil {
		s.logger.Printf("Warning: Could not get info for chunk %d of batch %s: %v", chunkIndex, batchID, err)
	} else {
		s.logger.Printf("Serving chunk %d from batch %s, size: %d bytes", chunkIndex, batchID, info.Size)
	}
	
	// Get object from storage
	startTime := time.Now()
	objectReader, err := s.storage.DownloadObject(ctx, objectName)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to retrieve file: %w", err)
	}
	
	// Log successful download
	downloadDuration := time.Since(startTime)
	if info != nil {
		s.logger.Printf("Successfully started download of chunk %d from batch %s, size: %d bytes, setup took: %v", 
			chunkIndex, batchID, info.Size, downloadDuration)
	} else {
		s.logger.Printf("Successfully started download of chunk %d from batch %s, setup took: %v", 
			chunkIndex, batchID, downloadDuration)
	}
	
	return objectReader, info, nil
}

// GetObjectName returns the storage object name for a chunk
func (s *Service) GetObjectName(batchID string, chunkIndex int) string {
	return fmt.Sprintf("%s/%d", batchID, chunkIndex)
}

// ParseChunkIndex parses a chunk index from string
func (s *Service) ParseChunkIndex(chunkIndexStr string) (int, error) {
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		return 0, fmt.Errorf("invalid chunk index '%s': %w", chunkIndexStr, err)
	}
	
	if chunkIndex < 0 {
		return 0, fmt.Errorf("chunk index cannot be negative: %d", chunkIndex)
	}
	
	return chunkIndex, nil
} 