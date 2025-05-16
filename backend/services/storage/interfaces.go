package storage

import (
	"context"
	"io"
	"time"
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