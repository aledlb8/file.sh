package models

import (
	"encoding/json"
	"time"
)

// BatchMetadata represents metadata about a batch of uploaded files
type BatchMetadata struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	ChunkMap  []string  `json:"chunkMap,omitempty"`
}

// MarshalJSON custom JSON marshaler for BatchMetadata to format dates
func (b BatchMetadata) MarshalJSON() ([]byte, error) {
	type Alias BatchMetadata
	return json.Marshal(&struct {
		CreatedAt string `json:"createdAt"`
		ExpiresAt string `json:"expiresAt"`
		*Alias
	}{
		CreatedAt: b.CreatedAt.Format(time.RFC3339),
		ExpiresAt: b.ExpiresAt.Format(time.RFC3339),
		Alias:     (*Alias)(&b),
	})
}

// ChunkInfo represents information about an uploaded chunk
type ChunkInfo struct {
	Index    int       `json:"index"`
	Size     int64     `json:"size"`
	Uploaded time.Time `json:"uploaded"`
}

// MarshalJSON custom JSON marshaler for ChunkInfo to format dates
func (c ChunkInfo) MarshalJSON() ([]byte, error) {
	type Alias ChunkInfo
	return json.Marshal(&struct {
		Uploaded string `json:"uploaded"`
		*Alias
	}{
		Uploaded: c.Uploaded.Format(time.RFC3339),
		Alias:    (*Alias)(&c),
	})
}

// BatchStatus represents the status of a batch with detailed chunk information
type BatchStatus struct {
	ID        string      `json:"id"`
	CreatedAt time.Time   `json:"createdAt"`
	ExpiresAt time.Time   `json:"expiresAt"`
	Chunks    []ChunkInfo `json:"chunks"`
	TotalSize int64       `json:"totalSize"`
}

// MarshalJSON custom JSON marshaler for BatchStatus to format dates
func (b BatchStatus) MarshalJSON() ([]byte, error) {
	type Alias BatchStatus
	return json.Marshal(&struct {
		CreatedAt string `json:"createdAt"`
		ExpiresAt string `json:"expiresAt"`
		*Alias
	}{
		CreatedAt: b.CreatedAt.Format(time.RFC3339),
		ExpiresAt: b.ExpiresAt.Format(time.RFC3339),
		Alias:     (*Alias)(&b),
	})
}

// BatchStats contains statistics about a batch
type BatchStats struct {
	TotalSize    int64     `json:"totalSize"`
	ChunksCount  int       `json:"chunks"`
	LastActivity time.Time `json:"lastActivity"`
}

// MarshalJSON custom JSON marshaler for BatchStats to format dates
func (b BatchStats) MarshalJSON() ([]byte, error) {
	type Alias BatchStats
	return json.Marshal(&struct {
		LastActivity string `json:"lastActivity"`
		*Alias
	}{
		LastActivity: b.LastActivity.Format(time.RFC3339),
		Alias:        (*Alias)(&b),
	})
} 