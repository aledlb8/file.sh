package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration
type Config struct {
	CorsOrigin      string
	Minio           MinioConfig
	FileExpiry      time.Duration
	MaxFileSizeMB   int64
	RequestTimeout  time.Duration
	WriteTimeout    time.Duration
	ReadTimeout     time.Duration
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
		FileExpiry:     getEnvDuration("FILE_EXPIRY", 24*7*time.Hour), // 7 days default
		MaxFileSizeMB:  getEnvInt64("MAX_FILE_SIZE_MB", 10240),        // 10GB default
		RequestTimeout: getEnvDuration("REQUEST_TIMEOUT", 30*time.Minute), // 30 minutes for large uploads
		WriteTimeout:   getEnvDuration("WRITE_TIMEOUT", 30*time.Minute),   // 30 minutes for large uploads
		ReadTimeout:    getEnvDuration("READ_TIMEOUT", 30*time.Minute),    // 30 minutes for large downloads
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

// Helper function to get int64 from environment variable
func getEnvInt64(key string, defaultValue int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	intValue, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return defaultValue
	}

	return intValue
} 