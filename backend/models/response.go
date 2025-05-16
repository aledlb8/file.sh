package models

// APIResponse represents a standard API response structure
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// NewSuccessResponse creates a new success response
func NewSuccessResponse(data interface{}) APIResponse {
	return APIResponse{
		Success: true,
		Data:    data,
	}
}

// NewErrorResponse creates a new error response
func NewErrorResponse(message string) APIResponse {
	return APIResponse{
		Success: false,
		Error:   message,
	}
}

// ChunkUploadResponse represents the response for a chunk upload
type ChunkUploadResponse struct {
	Success    bool   `json:"success"`
	BatchID    string `json:"batchId"`
	ChunkIndex int    `json:"chunkIndex"`
	Size       int64  `json:"size"`
	ETag       string `json:"etag,omitempty"`
	Uploaded   string `json:"uploaded,omitempty"`
	UploadTime string `json:"uploadTime,omitempty"`
}

// ChunkStatusResponse represents the response for a chunk status check
type ChunkStatusResponse struct {
	Exists     bool   `json:"exists"`
	BatchID    string `json:"batchId"`
	ChunkIndex int    `json:"chunkIndex"`
	Size       int64  `json:"size,omitempty"`
	ETag       string `json:"etag,omitempty"`
	Uploaded   string `json:"uploaded,omitempty"`
} 