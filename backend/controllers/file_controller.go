package controllers

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"filesh/services/storage"
	"filesh/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Maximum file size (10GB - configurable via environment)
var maxFileSize = getMaxFileSize()

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
	
	// Object path in storage
	objectPath := fmt.Sprintf("files/%s%s", fileID, extension)
	
	// Upload file to storage
	err = c.storage.UploadObject(context.Background(), objectPath, file, header.Size)
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
	objectsInfo, err := c.storage.ListObjects(context.Background(), "files/" + fileID)
	if err != nil || len(objectsInfo) == 0 {
		c.logger.Printf("Error finding file %s: %v", fileID, err)
		ctx.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}
	
	// Get the first matching object
	objectPath := objectsInfo[0].Name
	
	// Get file from storage
	objectInfo, err := c.storage.GetObjectInfo(context.Background(), objectPath)
	if err != nil {
		c.logger.Printf("Error getting object info %s: %v", objectPath, err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve file info"})
		return
	}
	
	reader, err := c.storage.DownloadObject(context.Background(), objectPath)
	if err != nil {
		c.logger.Printf("Error downloading file %s: %v", objectPath, err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve file"})
		return
	}
	defer reader.Close()
	
	// Fallback to fileID + extension if metadata is missing
	originalFilename := filepath.Base(objectPath)
	
	// Default content type
	contentType := "application/octet-stream"
	
	// Set appropriate headers for download
	ctx.Header("Content-Description", "File Transfer")
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", originalFilename))
	ctx.Header("Content-Type", contentType)
	ctx.Header("Content-Length", fmt.Sprintf("%d", objectInfo.Size))
	
	// Stream file to response
	ctx.Status(http.StatusOK)
	io.Copy(ctx.Writer, reader)
}

// getMaxFileSize returns the maximum file size from environment or default (10GB)
func getMaxFileSize() int64 {
	envSize := os.Getenv("MAX_FILE_SIZE_MB")
	if envSize == "" {
		return 10 * 1024 * 1024 * 1024 // 10GB default
	}

	sizeMB, err := strconv.ParseInt(envSize, 10, 64)
	if err != nil {
		return 10 * 1024 * 1024 * 1024 // 10GB default on error
	}

	return sizeMB * 1024 * 1024 // Convert MB to bytes
}