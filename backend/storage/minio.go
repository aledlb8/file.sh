package storage

import (
	"filesh/config"
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/minio/minio-go/v7/pkg/lifecycle"
)

// ObjectStorage defines the interface for storage operations
type ObjectStorage interface {
	UploadObject(ctx context.Context, objectName string, reader io.Reader, objectSize int64) error
	DownloadObject(ctx context.Context, objectName string) (io.ReadCloser, error)
	CheckObjectExists(ctx context.Context, objectName string) (bool, error)
	GetObjectInfo(ctx context.Context, objectName string) (*ObjectInfo, error)
	ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error)
	GetBucketName() string
}

// ObjectInfo contains information about a stored object
type ObjectInfo struct {
	Size         int64
	LastModified time.Time
	ETag         string
	Name         string
}

// MinioStorage implements ObjectStorage interface using MinIO
type MinioStorage struct {
	client     *minio.Client
	bucketName string
}

// NewMinioStorage creates a new MinIO storage handler
func NewMinioStorage(cfg config.MinioConfig) (ObjectStorage, error) {
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
		log.Printf("Created bucket %s", cfg.BucketName)

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
			log.Printf("Warning: Failed to set bucket lifecycle: %v", err)
			// Continue even if lifecycle set fails
		}
	}

	return &MinioStorage{
		client:     client,
		bucketName: cfg.BucketName,
	}, nil
}

// UploadObject uploads a file to MinIO
func (s *MinioStorage) UploadObject(ctx context.Context, objectName string, reader io.Reader, objectSize int64) error {
	_, err := s.client.PutObject(ctx, s.bucketName, objectName, reader, objectSize, minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	if err != nil {
		return fmt.Errorf("failed to upload object: %w", err)
	}
	return nil
}

// DownloadObject downloads a file from MinIO
func (s *MinioStorage) DownloadObject(ctx context.Context, objectName string) (io.ReadCloser, error) {
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