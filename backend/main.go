package main

import (
	"log"
	"os"

	"filesh/api"
	"filesh/config"
	"filesh/storage"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Set Gin to release mode in production
	gin.SetMode(gin.ReleaseMode)

	// Create a new Gin router with no middleware
	router := gin.New()

	// Do not use the default logger to avoid logging IPs and user info
	// Only log critical errors
	router.Use(gin.Recovery())

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize object storage
	objectStorage, err := storage.NewMinioStorage(cfg.Minio)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	// Configure CORS - only allow your frontend domain in production
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{cfg.CorsOrigin}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "HEAD", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "X-Upload-Batch-Id", "Tus-Resumable"}
	router.Use(cors.New(corsConfig))

	// Initialize API handler
	apiHandler := api.NewHandler(objectStorage)

	// File upload/download routes
	router.POST("/api/batch", apiHandler.CreateBatch)
	router.POST("/api/upload/:batchId/:chunkIndex", apiHandler.UploadChunk)
	router.HEAD("/api/upload/:batchId/:chunkIndex", apiHandler.CheckChunk)
	router.GET("/api/download/:batchId/:chunkIndex", apiHandler.DownloadChunk)
	router.GET("/api/batch/:batchId", apiHandler.GetBatchInfo)
	router.GET("/api/batch/:batchId/chunks", apiHandler.ListChunks)

	// Static file serving for frontend - need to change this to avoid conflict with /api
	// Change from "/" to any path not starting with "/api"
	router.NoRoute(func(c *gin.Context) {
		// Only serve static files for non-API paths
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.AbortWithStatus(404)
			return
		}
		// Serve static files from frontend/dist
		c.FileFromFS(c.Request.URL.Path, gin.Dir("../frontend/dist", false))
	})

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
} 