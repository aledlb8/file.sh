package controllers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// HealthController handles health check endpoints
type HealthController struct {
	version string
}

// NewHealthController creates a new health controller
func NewHealthController(version string) *HealthController {
	return &HealthController{
		version: version,
	}
}

// HealthCheck returns the health status of the API
func (c *HealthController) HealthCheck(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"timestamp": time.Now().Format(time.RFC3339),
		"version":   c.version,
	})
} 