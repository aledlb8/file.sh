package main

import (
	"os"

	"filesh/config"
	"filesh/controllers"
	"filesh/middleware"
	"filesh/router"
	"filesh/services/batch"
	"filesh/services/chunk"
	"filesh/services/storage"
	"filesh/utils"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Application version
const version = "1.0.0"

func main() {
	// Configure logging
	logger := utils.SetupLogging()
	
	// Log startup information
	logger.Printf("File.sh server starting up (v%s)...", version)
	
	// Set Gin to release mode in production
	gin.SetMode(gin.ReleaseMode)

	// Create a new Gin router with no middleware
	r := gin.New()

	// Use recovery middleware
	r.Use(gin.Recovery())
	
	// Use custom logger middleware
	r.Use(middleware.APILogger(logger))

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize object storage
	storageLogger := utils.NewCustomLogger("STORAGE")
	logger.Printf("Connecting to storage backend (%s)...", cfg.Minio.Endpoint)
	objectStorage, err := storage.NewMinioStorage(cfg.Minio, storageLogger)
	if err != nil {
		logger.Fatalf("Failed to initialize storage: %v", err)
	}
	logger.Printf("Successfully connected to storage backend, bucket: %s", objectStorage.GetBucketName())

	// Initialize services
	batchService := batch.NewService(objectStorage, utils.NewCustomLogger("BATCH"))
	chunkService := chunk.NewService(objectStorage, utils.NewCustomLogger("CHUNK"))

	// Initialize controllers
	healthController := controllers.NewHealthController(version)
	batchController := controllers.NewBatchController(batchService)
	chunkController := controllers.NewChunkController(chunkService)

	// Configure CORS - only allow your frontend domain in production
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{cfg.CorsOrigin}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "HEAD", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "X-Upload-Batch-Id", "Tus-Resumable"}
	r.Use(cors.New(corsConfig))
	
	// Configure router for handling large files
	r.MaxMultipartMemory = 100 << 20 // 100 MiB (increased from default 8 MiB)
	
	// Register all API routes
	router.RegisterRoutes(r, healthController, batchController, chunkController)

	// Static file serving for frontend
	r.NoRoute(func(c *gin.Context) {
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

	logger.Printf("Starting server on :%s", port)
	logger.Printf("Frontend CORS origin: %s", cfg.CorsOrigin)
	
	if err := r.Run(":" + port); err != nil {
		logger.Fatalf("Failed to start server: %v", err)
	}
} 