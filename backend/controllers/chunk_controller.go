package controllers

import (
	"bufio"
	"filesh/models"
	"filesh/services/chunk"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ChunkController handles chunk-related API endpoints
type ChunkController struct {
	chunkService *chunk.Service
}

// NewChunkController creates a new chunk controller
func NewChunkController(chunkService *chunk.Service) *ChunkController {
	return &ChunkController{
		chunkService: chunkService,
	}
}

// UploadChunk handles file chunk uploads
func (c *ChunkController) UploadChunk(ctx *gin.Context) {
	// Extract batch ID and chunk index from URL parameters
	batchID := ctx.Param("batchId")
	chunkIndexStr := ctx.Param("chunkIndex")

	// Validate batch ID
	if batchID == "" {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Batch ID is required"))
		return
	}

	// Parse and validate chunk index
	chunkIndex, err := c.chunkService.ParseChunkIndex(chunkIndexStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse(fmt.Sprintf("Invalid chunk index: %v", err)))
		return
	}

	// Parse multipart form for the uploaded file - reduced memory usage
	maxMemory := int64(32 * 1024 * 1024) // 32MB - optimized for chunk processing
	if err := ctx.Request.ParseMultipartForm(maxMemory); err != nil {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse(fmt.Sprintf("Failed to parse form: %v", err)))
		return
	}

	// Get file from request
	file, err := ctx.FormFile("chunk")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse(fmt.Sprintf("No file uploaded or file too large: %v", err)))
		return
	}

	// Check for zero-sized file
	if file.Size == 0 {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Received empty chunk (zero bytes)"))
		return
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.NewErrorResponse(fmt.Sprintf("Failed to open uploaded file: %v", err)))
		return
	}
	defer src.Close()

	// Create a buffered reader with limited buffer size for memory efficiency
	bufReader := bufio.NewReaderSize(src, 64*1024) // 64KB buffer

	// Upload the chunk using chunk service
	result, err := c.chunkService.UploadChunk(ctx.Request.Context(), batchID, chunkIndex, bufReader, file.Size)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.NewErrorResponse(fmt.Sprintf("Upload failed: %v", err)))
		return
	}

	ctx.JSON(http.StatusOK, result)
}

// CheckChunk checks if a chunk exists
func (c *ChunkController) CheckChunk(ctx *gin.Context) {
	// Extract batch ID and chunk index from URL parameters
	batchID := ctx.Param("batchId")
	chunkIndexStr := ctx.Param("chunkIndex")

	// Validate batch ID
	if batchID == "" {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Batch ID is required"))
		return
	}

	// Parse and validate chunk index
	chunkIndex, err := c.chunkService.ParseChunkIndex(chunkIndexStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse(fmt.Sprintf("Invalid chunk index: %v", err)))
		return
	}

	// Check if the chunk exists using chunk service
	result, err := c.chunkService.CheckChunk(ctx.Request.Context(), batchID, chunkIndex)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.NewErrorResponse(fmt.Sprintf("Failed to check chunk: %v", err)))
		return
	}

	if result.Exists {
		// Set appropriate headers for existing chunks
		ctx.Header("Content-Length", fmt.Sprintf("%d", result.Size))
		ctx.Header("ETag", fmt.Sprintf("\"%s\"", result.ETag))
		ctx.Header("Last-Modified", result.Uploaded)
		ctx.Status(http.StatusOK)
	} else {
		// Not found
		ctx.Status(http.StatusNotFound)
	}
}

// DownloadChunk downloads a file chunk
func (c *ChunkController) DownloadChunk(ctx *gin.Context) {
	// Extract batch ID and chunk index from URL parameters
	batchID := ctx.Param("batchId")
	chunkIndexStr := ctx.Param("chunkIndex")

	// Validate batch ID
	if batchID == "" {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Batch ID is required"))
		return
	}

	// Parse and validate chunk index
	chunkIndex, err := c.chunkService.ParseChunkIndex(chunkIndexStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse(fmt.Sprintf("Invalid chunk index: %v", err)))
		return
	}

	// Get chunk data using chunk service
	reader, info, err := c.chunkService.DownloadChunk(ctx.Request.Context(), batchID, chunkIndex)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.NewErrorResponse(fmt.Sprintf("Failed to download chunk: %v", err)))
		return
	}
	defer reader.Close()

	// Set appropriate headers
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s_%d\"", batchID, chunkIndex))
	ctx.Header("Content-Type", "application/octet-stream")
	if info != nil {
		ctx.Header("Content-Length", strconv.FormatInt(info.Size, 10))
		ctx.Header("ETag", fmt.Sprintf("\"%s\"", info.ETag))
		ctx.Header("Last-Modified", info.LastModified.Format(time.RFC1123))
	}

	// Stream the file to the client
	ctx.DataFromReader(http.StatusOK, info.Size, "application/octet-stream", reader, nil)
} 