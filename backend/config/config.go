package config

import (
	"os"
	"time"
)

// Config holds all application configuration
type Config struct {
	CorsOrigin string
	Minio      MinioConfig
	FileExpiry time.Duration
}

// MinioConfig holds MinIO configuration
type MinioConfig struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	UseSSL          bool
	BucketName      string
}

// Load configuration from environment or use defaults
func Load() (*Config, error) {
	// Default configuration
	cfg := &Config{
		CorsOrigin: getEnv("CORS_ORIGIN", "http://localhost:5173"), // Default for Vite dev server
		Minio: MinioConfig{
			Endpoint:        getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKeyID:     getEnv("MINIO_ACCESS_KEY", "minioadmin"),
			SecretAccessKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
			UseSSL:          getEnv("MINIO_USE_SSL", "false") == "true",
			BucketName:      getEnv("MINIO_BUCKET_NAME", "filesh"),
		},
		FileExpiry: getEnvDuration("FILE_EXPIRY", 24*7*time.Hour), // 7 days default
	}

	return cfg, nil
}

// Helper function to get environment variable with a default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// Helper function to get duration from environment variable
func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	
	duration, err := time.ParseDuration(value)
	if err != nil {
		return defaultValue
	}
	
	return duration
} 