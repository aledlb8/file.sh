package storage

import (
	"filesh/config"
	"context"
	"fmt"
	"io"
	"log"
	"time"
	"bufio"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/lifecycle"
)

// MinioStorage implements ObjectStorage interface using MinIO
type MinioStorage struct {
	client     *minio.Client
	bucketName string
	logger     *log.Logger
}

// NewMinioStorage creates a new MinIO storage handler
func NewMinioStorage(cfg config.MinioConfig, logger *log.Logger) (ObjectStorage, error) {
	if logger == nil {
		logger = log.New(log.Writer(), "[MINIO] ", log.LstdFlags)
	}

	// Initialize MinIO client
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	// Create bucket if it doesn't exist
	exists, err := client.BucketExists(context.Background(), cfg.BucketName)
	if err != nil {
		return nil, fmt.Errorf("failed to check if bucket exists: %w", err)
	}

	if !exists {
		err = client.MakeBucket(context.Background(), cfg.BucketName, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
		logger.Printf("Created bucket %s", cfg.BucketName)

		// Set up lifecycle policy for auto-deletion
		config := lifecycle.NewConfiguration()
		config.Rules = []lifecycle.Rule{
			{
				ID:     "expire-rule",
				Status: "Enabled",
				Expiration: lifecycle.Expiration{
					Days: 7,
				},
			},
		}
		
		err = client.SetBucketLifecycle(context.Background(), cfg.BucketName, config)
		if err != nil {
			logger.Printf("Warning: Failed to set bucket lifecycle: %v", err)
			// Continue even if lifecycle set fails
		}
	}

	return &MinioStorage{
		client:     client,
		bucketName: cfg.BucketName,
		logger:     logger,
	}, nil
}

// UploadObject uploads a file to MinIO
func (s *MinioStorage) UploadObject(ctx context.Context, objectName string, reader io.Reader, objectSize int64) error {
	// Add logging for troubleshooting
	s.logger.Printf("Starting upload of object %s with expected size: %d bytes", objectName, objectSize)

	// Use buffered reader to improve performance and reliability
	bufReader := bufio.NewReader(reader)

	// Upload with retries for large files
	var err error
	maxRetries := 3
	retryDelay := 2 * time.Second

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			s.logger.Printf("Retry #%d for object %s after waiting %v", attempt, objectName, retryDelay)
			time.Sleep(retryDelay)
			retryDelay *= 2 // Exponential backoff
		}

		option := minio.PutObjectOptions{
			ContentType: "application/octet-stream",
			// Specifying part size to ensure proper handling of large files
			PartSize: 64 * 1024 * 1024, // 64MB parts for multipart upload
		}

		info, err := s.client.PutObject(ctx, s.bucketName, objectName, bufReader, objectSize, option)
		if err == nil {
			s.logger.Printf("Successfully uploaded object %s: ETag=%s, Size=%d", objectName, info.ETag, info.Size)
			return nil
		}

		s.logger.Printf("Error on attempt #%d uploading object %s: %v", attempt+1, objectName, err)
		
		// If this was our last attempt, break and return the error
		if attempt == maxRetries {
			break
		}

		// If retry, reset the reader for the next attempt
		if seekable, ok := reader.(io.Seeker); ok {
			if _, err := seekable.Seek(0, io.SeekStart); err != nil {
				s.logger.Printf("Failed to reset reader position: %v", err)
				break // Can't retry if we can't reset the reader
			}
		} else {
			s.logger.Printf("Reader is not seekable, cannot retry")
			break
		}
	}

	return fmt.Errorf("failed to upload object after %d attempts: %w", maxRetries+1, err)
}

// DownloadObject downloads a file from MinIO
func (s *MinioStorage) DownloadObject(ctx context.Context, objectName string) (io.ReadCloser, error) {
	s.logger.Printf("Downloading object: %s", objectName)
	obj, err := s.client.GetObject(ctx, s.bucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to download object: %w", err)
	}
	return obj, nil
}

// CheckObjectExists checks if an object exists in MinIO
func (s *MinioStorage) CheckObjectExists(ctx context.Context, objectName string) (bool, error) {
	_, err := s.client.StatObject(ctx, s.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		// Check if the error is a Not Found error
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return false, nil
		}
		return false, fmt.Errorf("failed to check object: %w", err)
	}
	return true, nil
}

// GetObjectInfo gets information about an object
func (s *MinioStorage) GetObjectInfo(ctx context.Context, objectName string) (*ObjectInfo, error) {
	info, err := s.client.StatObject(ctx, s.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get object info: %w", err)
	}
	
	return &ObjectInfo{
		Size:         info.Size,
		LastModified: info.LastModified,
		ETag:         info.ETag,
		Name:         info.Key,
	}, nil
}

// ListObjects lists objects with the given prefix
func (s *MinioStorage) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	objectCh := s.client.ListObjects(ctx, s.bucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	var objects []ObjectInfo
	for object := range objectCh {
		if object.Err != nil {
			return nil, fmt.Errorf("error listing objects: %w", object.Err)
		}
		
		objects = append(objects, ObjectInfo{
			Size:         object.Size,
			LastModified: object.LastModified,
			ETag:         object.ETag,
			Name:         object.Key,
		})
	}
	
	return objects, nil
}

// GetBucketName returns the bucket name
func (s *MinioStorage) GetBucketName() string {
	return s.bucketName
} 