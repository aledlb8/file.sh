package api

import (
	"filesh/storage"
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"
	"encoding/json"
	"io"
	"bufio"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// BatchMetadata represents metadata about a batch of uploaded files
type BatchMetadata struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	ChunkMap  []string  `json:"chunkMap,omitempty"`
}

// MarshalJSON custom JSON marshaler for BatchMetadata to format dates
func (b BatchMetadata) MarshalJSON() ([]byte, error) {
	type Alias BatchMetadata
	return json.Marshal(&struct {
		CreatedAt string `json:"createdAt"`
		ExpiresAt string `json:"expiresAt"`
		*Alias
	}{
		CreatedAt: b.CreatedAt.Format(time.RFC3339),
		ExpiresAt: b.ExpiresAt.Format(time.RFC3339),
		Alias:     (*Alias)(&b),
	})
}

// ChunkInfo represents information about an uploaded chunk
type ChunkInfo struct {
	Index    int       `json:"index"`
	Size     int64     `json:"size"`
	Uploaded time.Time `json:"uploaded"`
}

// MarshalJSON custom JSON marshaler for ChunkInfo to format dates
func (c ChunkInfo) MarshalJSON() ([]byte, error) {
	type Alias ChunkInfo
	return json.Marshal(&struct {
		Uploaded string `json:"uploaded"`
		*Alias
	}{
		Uploaded: c.Uploaded.Format(time.RFC3339),
		Alias:    (*Alias)(&c),
	})
}

// BatchStatus represents the status of a batch with detailed chunk information
type BatchStatus struct {
	ID        string     `json:"id"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
	Chunks    []ChunkInfo `json:"chunks"`
	TotalSize int64      `json:"totalSize"`
}

// MarshalJSON custom JSON marshaler for BatchStatus to format dates
func (b BatchStatus) MarshalJSON() ([]byte, error) {
	type Alias BatchStatus
	return json.Marshal(&struct {
		CreatedAt string `json:"createdAt"`
		ExpiresAt string `json:"expiresAt"`
		*Alias
	}{
		CreatedAt: b.CreatedAt.Format(time.RFC3339),
		ExpiresAt: b.ExpiresAt.Format(time.RFC3339),
		Alias:     (*Alias)(&b),
	})
}

// Handler manages the API endpoints
type Handler struct {
	storage storage.ObjectStorage
}

// NewHandler creates a new API handler
func NewHandler(storage storage.ObjectStorage) *Handler {
	return &Handler{
		storage: storage,
	}
}

// CreateBatch creates a new upload batch
func (h *Handler) CreateBatch(c *gin.Context) {
	// Generate a new UUID for the batch
	batchID := uuid.New().String()

	// Create batch metadata (7 days expiry by default)
	now := time.Now()
	metadata := BatchMetadata{
		ID:        batchID,
		CreatedAt: now,
		ExpiresAt: now.Add(7 * 24 * time.Hour),
	}

	c.JSON(http.StatusOK, metadata)
}

// UploadChunk handles file chunk uploads
func (h *Handler) UploadChunk(c *gin.Context) {
	batchID := c.Param("batchId")
	chunkIndexStr := c.Param("chunkIndex")

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chunk index"})
		return
	}

	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)

	// Get file from request with increased memory limit for large chunks
	// Default is usually 32MB, which can be too small for large encrypted chunks
	maxMemory := int64(100 * 1024 * 1024) // 100MB
	if err := c.Request.ParseMultipartForm(maxMemory); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to parse multipart form: %v", err),
		})
		return
	}

	// Get file from request
	file, err := c.FormFile("chunk")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("No file uploaded or file too large: %v", err),
		})
		return
	}

	// Add more detailed logging for debugging large file uploads
	fmt.Printf("Received chunk %d for batch %s, size: %d bytes, filename: %s\n", 
		chunkIndex, batchID, file.Size, file.Filename)

	// Check for zero-sized file
	if file.Size == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Received empty chunk (zero bytes)",
		})
		return
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to open uploaded file: %v", err),
		})
		return
	}
	defer src.Close()

	// Read a few bytes to verify the file content
	testBuf := make([]byte, 64)
	n, readErr := src.Read(testBuf)
	if readErr != nil && readErr != io.EOF {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to read file content: %v", readErr),
		})
		return
	}
	
	// Log first few bytes for debugging
	if n > 0 {
		fmt.Printf("First %d bytes of chunk %d: %v\n", n, chunkIndex, testBuf[:n])
	}
	
	// Reset the file pointer to the beginning for upload
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to reset file pointer: %v", err),
		})
		return
	}

	// Create context with extended timeout for large files
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute) // Increased timeout
	defer cancel()

	// Upload to object storage with buffer copying to ensure all data is transferred
	startTime := time.Now()
	
	// Create a buffer to ensure chunked copying doesn't cause issues
	// This will help if there are any issues with streaming directly from the request
	bufReader := bufio.NewReader(src)
	
	err = h.storage.UploadObject(ctx, objectName, bufReader, file.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to store file: %v", err),
		})
		return
	}
	uploadDuration := time.Since(startTime)

	// Get object info for the response
	info, err := h.storage.GetObjectInfo(ctx, objectName)
	if err != nil {
		// Even if we can't get info, we still uploaded successfully
		fmt.Printf("Warning: Could not get object info for %s: %v\n", objectName, err)
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"batchId":    batchID,
			"chunkIndex": chunkIndex,
			"size":       file.Size,
			"uploadTime": uploadDuration.String(),
		})
		return
	}

	// Double check that the stored size matches what we intended to upload
	if info.Size != file.Size {
		fmt.Printf("WARNING: Size mismatch for chunk %d in batch %s. Expected: %d bytes, Got: %d bytes\n",
			chunkIndex, batchID, file.Size, info.Size)
	}

	// Log successful upload
	fmt.Printf("Successfully uploaded chunk %d for batch %s, size: %d bytes, took: %v\n", 
		chunkIndex, batchID, info.Size, uploadDuration)

	// Return success with detailed info
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"batchId":    batchID,
		"chunkIndex": chunkIndex,
		"size":       info.Size,
		"etag":       info.ETag,
		"uploaded":   info.LastModified.Format(time.RFC3339),
		"uploadTime": uploadDuration.String(),
	})
}

// CheckChunk handles HEAD requests to check if a chunk exists
func (h *Handler) CheckChunk(c *gin.Context) {
	batchID := c.Param("batchId")
	chunkIndexStr := c.Param("chunkIndex")
	
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chunk index"})
		return
	}

	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)

	// Check if object exists
	ctx := context.Background()
	exists, err := h.storage.CheckObjectExists(ctx, objectName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check chunk"})
		return
	}

	if !exists {
		// For API consistency, return JSON response instead of status code
		c.JSON(http.StatusNotFound, gin.H{
			"exists": false,
			"batchId": batchID, 
			"chunkIndex": chunkIndex,
		})
		return
	}

	// Get object info
	info, err := h.storage.GetObjectInfo(ctx, objectName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get chunk info"})
		return
	}

	// Return chunk information
	c.JSON(http.StatusOK, gin.H{
		"exists":     true,
		"batchId":    batchID,
		"chunkIndex": chunkIndex,
		"size":       info.Size,
		"etag":       info.ETag,
		"uploaded":   info.LastModified.Format(time.RFC3339),
	})
}

// DownloadChunk handles chunk downloads
func (h *Handler) DownloadChunk(c *gin.Context) {
	batchID := c.Param("batchId")
	chunkIndexStr := c.Param("chunkIndex")
	
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Invalid chunk index: %v", err),
		})
		return
	}

	// Calculate object name based on batch ID and chunk index
	objectName := fmt.Sprintf("%s/%d", batchID, chunkIndex)

	// Log download request
	fmt.Printf("Download request for chunk %d of batch %s\n", chunkIndex, batchID)

	// Create context with extended timeout for large files
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Check if object exists
	exists, err := h.storage.CheckObjectExists(ctx, objectName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to check file existence: %v", err),
		})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("Chunk %d not found for batch %s", chunkIndex, batchID),
		})
		return
	}

	// Get object info for size reporting
	info, err := h.storage.GetObjectInfo(ctx, objectName)
	if err == nil && info != nil {
		fmt.Printf("Serving chunk %d from batch %s, size: %d bytes\n", chunkIndex, batchID, info.Size)
	}

	// Get object from storage
	startTime := time.Now()
	objectReader, err := h.storage.DownloadObject(ctx, objectName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to retrieve file: %v", err),
		})
		return
	}
	defer objectReader.Close()

	// Set appropriate headers
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s-%d", batchID, chunkIndex))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Cache-Control", "no-store")
	
	// Add size header if available
	if info != nil {
		c.Header("Content-Length", fmt.Sprintf("%d", info.Size))
	}
	
	// Add custom headers to help client with chunked downloads
	c.Header("X-Chunk-Index", chunkIndexStr)
	c.Header("X-Batch-ID", batchID)
	
	// Stream the file to the client
	c.DataFromReader(http.StatusOK, info.Size, "application/octet-stream", objectReader, nil)
	
	// Log successful download
	downloadDuration := time.Since(startTime)
	if info != nil {
		fmt.Printf("Successfully served chunk %d from batch %s, size: %d bytes, took: %v\n", 
			chunkIndex, batchID, info.Size, downloadDuration)
	} else {
		fmt.Printf("Successfully served chunk %d from batch %s, took: %v\n", 
			chunkIndex, batchID, downloadDuration)
	}
}

// GetBatchInfo retrieves information about a batch
func (h *Handler) GetBatchInfo(c *gin.Context) {
	batchID := c.Param("batchId")

	// List objects with prefix batchID/
	ctx := context.Background()
	listPrefix := fmt.Sprintf("%s/", batchID)
	
	objects, err := h.storage.ListObjects(ctx, listPrefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check batch"})
		return
	}

	if len(objects) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Batch not found"})
		return
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
	metadata := BatchMetadata{
		ID:        batchID,
		CreatedAt: createdAt,
		ExpiresAt: createdAt.Add(7 * 24 * time.Hour), // Expires in 7 days from creation
		ChunkMap:  chunkMap,
	}

	c.JSON(http.StatusOK, gin.H{
		"batch": metadata,
		"stats": gin.H{
			"totalSize": totalSize,
			"chunks":    len(objects),
			"lastActivity": latestChunk.Format(time.RFC3339),
		},
	})
}

// ListChunks lists all chunks in a batch
func (h *Handler) ListChunks(c *gin.Context) {
	batchID := c.Param("batchId")
	
	// List objects with prefix batchID/
	ctx := context.Background()
	listPrefix := fmt.Sprintf("%s/", batchID)
	
	objects, err := h.storage.ListObjects(ctx, listPrefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list batch chunks"})
		return
	}

	chunks := make([]ChunkInfo, 0, len(objects))
	var totalSize int64 = 0
	
	for _, obj := range objects {
		// Extract chunk index from object name
		// Object name format is "batchId/chunkIndex"
		chunkIndexStr := obj.Name[len(listPrefix):]
		chunkIndex, err := strconv.Atoi(chunkIndexStr)
		if err != nil {
			// Skip objects that don't match our expected format
			continue
		}
		
		chunks = append(chunks, ChunkInfo{
			Index:    chunkIndex,
			Size:     obj.Size,
			Uploaded: obj.LastModified,
		})
		
		totalSize += obj.Size
	}
	
	// Create batch status
	now := time.Now()
	batchStatus := BatchStatus{
		ID:        batchID,
		CreatedAt: now.Add(-24 * time.Hour), // Example time, ideally from DB
		ExpiresAt: now.Add(6 * 24 * time.Hour),
		Chunks:    chunks,
		TotalSize: totalSize,
	}
	
	c.JSON(http.StatusOK, batchStatus)
} 