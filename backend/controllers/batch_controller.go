package controllers

import (
	"filesh/models"
	"filesh/services/batch"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// BatchController handles batch-related API endpoints
type BatchController struct {
	batchService *batch.Service
}

// NewBatchController creates a new batch controller
func NewBatchController(batchService *batch.Service) *BatchController {
	return &BatchController{
		batchService: batchService,
	}
}

// CreateBatch creates a new upload batch
func (c *BatchController) CreateBatch(ctx *gin.Context) {
	// Create a new batch using the batch service
	metadata := c.batchService.CreateBatch()

	// Return the batch metadata as JSON
	ctx.JSON(http.StatusOK, metadata)
}

// GetBatchInfo retrieves information about a batch
func (c *BatchController) GetBatchInfo(ctx *gin.Context) {
	batchID := ctx.Param("batchId")
	if batchID == "" {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Batch ID is required"))
		return
	}

	// Get batch info from the service
	metadata, stats, err := c.batchService.GetBatchInfo(ctx.Request.Context(), batchID)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.NewErrorResponse(fmt.Sprintf("Batch not found: %v", err)))
		return
	}

	// Return both metadata and stats in the response
	response := gin.H{
		"id":           metadata.ID,
		"createdAt":    metadata.CreatedAt.Format(time.RFC3339),
		"expiresAt":    metadata.ExpiresAt.Format(time.RFC3339),
		"totalSize":    stats.TotalSize,
		"chunksCount":  stats.ChunksCount,
		"lastActivity": stats.LastActivity.Format(time.RFC3339),
	}
	
	ctx.JSON(http.StatusOK, models.NewSuccessResponse(response))
}

// ListChunks lists all chunks in a batch
func (c *BatchController) ListChunks(ctx *gin.Context) {
	batchID := ctx.Param("batchId")
	if batchID == "" {
		ctx.JSON(http.StatusBadRequest, models.NewErrorResponse("Batch ID is required"))
		return
	}

	// Get batch chunks from the service
	batchStatus, err := c.batchService.ListChunks(ctx.Request.Context(), batchID)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.NewErrorResponse(fmt.Sprintf("Failed to list chunks: %v", err)))
		return
	}

	ctx.JSON(http.StatusOK, models.NewSuccessResponse(batchStatus))
} 