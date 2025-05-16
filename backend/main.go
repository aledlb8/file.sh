package main

import (
	"log"
	"os"
	"time"
	"fmt"
	"io"

	"filesh/api"
	"filesh/config"
	"filesh/storage"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Configure logging
	setupLogging()
	
	// Log startup information
	log.Printf("File.sh server starting up...")
	
	// Set Gin to release mode in production
	gin.SetMode(gin.ReleaseMode)

	// Create a new Gin router with no middleware
	router := gin.New()

	// Do not use the default logger to avoid logging IPs and user info
	// Only log critical errors and requests to /api endpoints
	router.Use(gin.Recovery())
	router.Use(customLogger())

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize object storage
	log.Printf("Connecting to storage backend (%s)...", cfg.Minio.Endpoint)
	objectStorage, err := storage.NewMinioStorage(cfg.Minio)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	log.Printf("Successfully connected to storage backend, bucket: %s", objectStorage.GetBucketName())

	// Configure CORS - only allow your frontend domain in production
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{cfg.CorsOrigin}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "HEAD", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "X-Upload-Batch-Id", "Tus-Resumable"}
	router.Use(cors.New(corsConfig))
	
	// Configure router for handling large files
	router.MaxMultipartMemory = 100 << 20 // 100 MiB (increased from default 8 MiB)
	
	// Add health check endpoint
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
			"version": "1.0.0",
		})
	})

	// Initialize API handler
	apiHandler := api.NewHandler(objectStorage)

	// File upload/download routes
	router.POST("/api/batch", apiHandler.CreateBatch)
	router.POST("/api/upload/:batchId/:chunkIndex", apiHandler.UploadChunk)
	router.HEAD("/api/upload/:batchId/:chunkIndex", apiHandler.CheckChunk)
	router.HEAD("/api/download/:batchId/:chunkIndex", apiHandler.CheckChunk) // Allow HEAD for download path too
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
	log.Printf("Frontend CORS origin: %s", cfg.CorsOrigin)
	
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// setupLogging configures the global logging
func setupLogging() {
	// Create log file with timestamp
	logFileName := fmt.Sprintf("filesh_%s.log", time.Now().Format("2006-01-02"))
	
	// Try to open log file, but don't fail if we can't
	logFile, err := os.OpenFile(logFileName, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		// Just write to stdout if we can't create a log file
		log.Printf("Warning: Could not create log file: %v", err)
		return
	}
	
	// Use both stdout and file for logging
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(multiWriter)
	
	// Include timestamp and file info in logs
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
}

// customLogger returns a Gin middleware for logging API requests
func customLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Start timer
		start := time.Now()
		path := c.Request.URL.Path
		
		// Process request
		c.Next()
		
		// Skip logging for non-API paths to reduce noise
		if len(path) < 4 || path[:4] != "/api" {
			return
		}
		
		// Calculate latency
		latency := time.Since(start)
		
		// Log the request details
		log.Printf(
			"[API] %s %s %d %s",
			c.Request.Method,
			path,
			c.Writer.Status(),
			latency,
		)
	}
} 