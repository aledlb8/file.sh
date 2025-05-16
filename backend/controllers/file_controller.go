package controllers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"filesh/services/storage"
	"filesh/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Maximum file size (100MB)
const maxFileSize = 100 * 1024 * 1024

// FileController handles direct file uploads and downloads
type FileController struct {
	storage storage.ObjectStorage
	logger  *log.Logger
}

// NewFileController creates a new file controller
func NewFileController(storage storage.ObjectStorage) *FileController {
	return &FileController{
		storage: storage,
		logger:  utils.NewCustomLogger("FILE"),
	}
}

// UploadFile handles direct file upload with size limit
func (c *FileController) UploadFile(ctx *gin.Context) {
	// Get file from form data
	file, header, err := ctx.Request.FormFile("file")
	if err != nil {
		c.logger.Printf("Error getting uploaded file: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid file"})
		return
	}
	defer file.Close()

	// Check file size
	if header.Size > maxFileSize {
		c.logger.Printf("File too large: %d bytes (max %d)", header.Size, maxFileSize)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large. Maximum size is %d MB", maxFileSize/1024/1024),
		})
		return
	}

	// Generate unique file ID
	fileID := uuid.New().String()
	
	// Get original filename and extension
	originalFilename := header.Filename
	extension := filepath.Ext(originalFilename)
	
	// Create metadata
	metadata := map[string]string{
		"original-filename": originalFilename,
		"content-type":      header.Header.Get("Content-Type"),
		"upload-date":       time.Now().Format(time.RFC3339),
		"file-size":         fmt.Sprintf("%d", header.Size),
	}
	
	// Object path in storage
	objectPath := fmt.Sprintf("files/%s%s", fileID, extension)
	
	// Upload file to storage
	_, err = c.storage.PutObject(objectPath, file, header.Size, metadata)
	if err != nil {
		c.logger.Printf("Error uploading file to storage: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store file"})
		return
	}
	
	// Return success response with file ID and download URL
	ctx.JSON(http.StatusOK, gin.H{
		"fileId":       fileID,
		"filename":     originalFilename,
		"size":         header.Size,
		"downloadPath": fmt.Sprintf("/api/file/%s", fileID),
	})
}

// DownloadFile handles file download by ID
func (c *FileController) DownloadFile(ctx *gin.Context) {
	fileID := ctx.Param("fileId")
	if fileID == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Missing file ID"})
		return
	}
	
	// Find the file in storage
	// First we need to get the file extension by listing objects with this prefix
	objectsInfo, err := c.storage.ListObjects("files/" + fileID)
	if err != nil || len(objectsInfo) == 0 {
		c.logger.Printf("Error finding file %s: %v", fileID, err)
		ctx.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}
	
	// Get the first matching object
	objectPath := objectsInfo[0].Key
	
	// Get file from storage
	objectInfo, reader, err := c.storage.GetObject(objectPath)
	if err != nil {
		c.logger.Printf("Error retrieving file %s: %v", objectPath, err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve file"})
		return
	}
	defer reader.Close()
	
	// Get original filename from metadata
	originalFilename := objectInfo.Metadata["original-filename"]
	if originalFilename == "" {
		// Fallback to fileID + extension if metadata is missing
		originalFilename = filepath.Base(objectPath)
	}
	
	// Set content type header
	contentType := objectInfo.Metadata["content-type"]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	
	// Set appropriate headers for download
	ctx.Header("Content-Description", "File Transfer")
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", originalFilename))
	ctx.Header("Content-Type", contentType)
	ctx.Header("Content-Length", fmt.Sprintf("%d", objectInfo.Size))
	
	// Stream file to response
	ctx.Status(http.StatusOK)
	io.Copy(ctx.Writer, reader)
}