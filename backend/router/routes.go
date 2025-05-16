package router

import (
	"filesh/controllers"
	"filesh/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes configures all the API routes
func RegisterRoutes(r *gin.Engine, healthController *controllers.HealthController, 
	batchController *controllers.BatchController, chunkController *controllers.ChunkController,
	fileController *controllers.FileController) {
	
	// Create a rate limiter (5 requests per minute per IP)
	rateLimiter := middleware.NewRateLimiter(5)
	
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
	
	// Public file API (with rate limiting but no CORS restrictions)
	// This makes the file API accessible from anywhere
	publicApi := r.Group("/api/file")
	publicApi.Use(rateLimiter.Limit())
	{
		publicApi.POST("", fileController.UploadFile)
		publicApi.GET("/:fileId", fileController.DownloadFile)
	}
} 