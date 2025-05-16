package router

import (
	"filesh/controllers"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes configures all the API routes
func RegisterRoutes(r *gin.Engine, healthController *controllers.HealthController, 
	batchController *controllers.BatchController, chunkController *controllers.ChunkController) {
	
	// Configure API group
	api := r.Group("/api")
	{
		// Health check route
		api.GET("/health", healthController.HealthCheck)

		// Batch routes
		api.POST("/batch", batchController.CreateBatch)
		api.GET("/batch/:batchId", batchController.GetBatchInfo)
		api.GET("/batch/:batchId/chunks", batchController.ListChunks)

		// Chunk routes
		api.POST("/upload/:batchId/:chunkIndex", chunkController.UploadChunk)
		api.HEAD("/upload/:batchId/:chunkIndex", chunkController.CheckChunk)
		api.HEAD("/download/:batchId/:chunkIndex", chunkController.CheckChunk) // Allow HEAD for download path too
		api.GET("/download/:batchId/:chunkIndex", chunkController.DownloadChunk)
	}
} 