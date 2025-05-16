package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// APILogger creates a middleware for logging API requests
func APILogger(logger *log.Logger) gin.HandlerFunc {
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
		logger.Printf(
			"[API] %s %s %d %s",
			c.Request.Method,
			path,
			c.Writer.Status(),
			latency,
		)
	}
} 