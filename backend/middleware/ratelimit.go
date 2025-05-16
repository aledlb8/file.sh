package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter implements a simple rate limiting middleware
type RateLimiter struct {
	// Maximum requests per minute per IP
	ratePerMinute int
	// Map to track request counts and timestamps
	clients map[string]*clientLimit
	mu      sync.Mutex
}

type clientLimit struct {
	count       int
	lastRequest time.Time
}

// NewRateLimiter creates a new rate limiter middleware
func NewRateLimiter(ratePerMinute int) *RateLimiter {
	return &RateLimiter{
		ratePerMinute: ratePerMinute,
		clients:       make(map[string]*clientLimit),
	}
}

// Limit creates a middleware function for rate limiting
func (rl *RateLimiter) Limit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		
		rl.mu.Lock()
		
		// Clean up old records every so often (only keep records for the last 2 minutes)
		if len(rl.clients) > 0 && time.Now().Second()%30 == 0 {
			for ip, client := range rl.clients {
				if time.Since(client.lastRequest) > 2*time.Minute {
					delete(rl.clients, ip)
				}
			}
		}
		
		// Get or create client limit record
		client, exists := rl.clients[ip]
		if !exists {
			client = &clientLimit{
				count:       0,
				lastRequest: time.Now(),
			}
			rl.clients[ip] = client
		}
		
		// Reset count if a minute has passed
		if time.Since(client.lastRequest) > time.Minute {
			client.count = 0
			client.lastRequest = time.Now()
		}
		
		// Increment request count
		client.count++
		exceed := client.count > rl.ratePerMinute
		
		rl.mu.Unlock()
		
		// Return 429 if rate limit exceeded
		if exceed {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}
		
		c.Next()
	}
} 