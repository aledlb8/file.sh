package batch

import (
	"context"
	"filesh/models"
	"filesh/services/storage"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// Service handles batch-related operations
type Service struct {
	storage storage.ObjectStorage
	logger  *log.Logger
}

// NewService creates a new batch service
func NewService(storage storage.ObjectStorage, logger *log.Logger) *Service {
	if logger == nil {
		logger = log.New(log.Writer(), "[BATCH] ", log.LstdFlags)
	}
	
	return &Service{
		storage: storage,
		logger:  logger,
	}
}

// CreateBatch creates a new batch with a unique ID
func (s *Service) CreateBatch() models.BatchMetadata {
	// Generate a new UUID for the batch
	batchID := uuid.New().String()

	// Create batch metadata (7 days expiry by default)
	now := time.Now()
	metadata := models.BatchMetadata{
		ID:        batchID,
		CreatedAt: now,
		ExpiresAt: now.Add(7 * 24 * time.Hour),
	}

	s.logger.Printf("Created new batch: %s, expires: %s", batchID, metadata.ExpiresAt.Format(time.RFC3339))
	return metadata
}

// GetBatchInfo retrieves information about a batch
func (s *Service) GetBatchInfo(ctx context.Context, batchID string) (*models.BatchMetadata, *models.BatchStats, error) {
	// List objects with prefix batchID/
	listPrefix := fmt.Sprintf("%s/", batchID)
	
	objects, err := s.storage.ListObjects(ctx, listPrefix)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to list batch objects: %w", err)
	}

	if len(objects) == 0 {
		return nil, nil, fmt.Errorf("batch not found")
	}

	// Get the latest modified time from chunks to estimate batch creation time
	var earliestChunk time.Time
	var latestChunk time.Time
	var totalSize int64 = 0
	chunkMap := make([]string, 0, len(objects))
	
	for i, obj := range objects {
		totalSize += obj.Size
		chunkMap = append(chunkMap, obj.Name[len(listPrefix):])
		
		// Initialize with first object
		if i == 0 {
			earliestChunk = obj.LastModified
			latestChunk = obj.LastModified
			continue
		}
		
		// Update earliest and latest times
		if obj.LastModified.Before(earliestChunk) {
			earliestChunk = obj.LastModified
		}
		if obj.LastModified.After(latestChunk) {
			latestChunk = obj.LastModified
		}
	}
	
	// Use earliest chunk as creation time or fallback to current time - 24h
	createdAt := earliestChunk
	if createdAt.IsZero() {
		createdAt = time.Now().Add(-24 * time.Hour)
	}
	
	// Create batch metadata with chunk information
	metadata := &models.BatchMetadata{
		ID:        batchID,
		CreatedAt: createdAt,
		ExpiresAt: createdAt.Add(7 * 24 * time.Hour), // Expires in 7 days from creation
		ChunkMap:  chunkMap,
	}

	// Create batch stats
	stats := &models.BatchStats{
		TotalSize:    totalSize,
		ChunksCount:  len(objects),
		LastActivity: latestChunk,
	}

	return metadata, stats, nil
}

// ListChunks lists all chunks in a batch
func (s *Service) ListChunks(ctx context.Context, batchID string) (*models.BatchStatus, error) {
	// List objects with prefix batchID/
	listPrefix := fmt.Sprintf("%s/", batchID)
	
	objects, err := s.storage.ListObjects(ctx, listPrefix)
	if err != nil {
		return nil, fmt.Errorf("failed to list batch chunks: %w", err)
	}

	chunks := make([]models.ChunkInfo, 0, len(objects))
	var totalSize int64 = 0
	var earliestChunk time.Time
	
	for i, obj := range objects {
		// Extract chunk index from object name
		// Object name format is "batchId/chunkIndex"
		chunkIndexStr := obj.Name[len(listPrefix):]
		chunkIndex, err := strconv.Atoi(chunkIndexStr)
		if err != nil {
			// Skip objects that don't match our expected format
			continue
		}
		
		chunks = append(chunks, models.ChunkInfo{
			Index:    chunkIndex,
			Size:     obj.Size,
			Uploaded: obj.LastModified,
		})
		
		totalSize += obj.Size
		
		// Track earliest chunk for creation time
		if i == 0 || obj.LastModified.Before(earliestChunk) {
			earliestChunk = obj.LastModified
		}
	}
	
	// Use earliest chunk as creation time or fallback to current time - 24h
	createdAt := earliestChunk
	if createdAt.IsZero() {
		createdAt = time.Now().Add(-24 * time.Hour)
	}
	
	// Create batch status
	batchStatus := &models.BatchStatus{
		ID:        batchID,
		CreatedAt: createdAt,
		ExpiresAt: createdAt.Add(7 * 24 * time.Hour),
		Chunks:    chunks,
		TotalSize: totalSize,
	}
	
	return batchStatus, nil
} 