package utils

import (
	"fmt"
	"io"
	"log"
	"os"
	"time"
)

// SetupLogging configures the global logging
func SetupLogging() *log.Logger {
	// Create log file with timestamp
	logFileName := fmt.Sprintf("filesh_%s.log", time.Now().Format("2006-01-02"))
	
	// Try to open log file, but don't fail if we can't
	logFile, err := os.OpenFile(logFileName, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		// Just write to stdout if we can't create a log file
		log.Printf("Warning: Could not create log file: %v", err)
		return log.New(os.Stdout, "", log.Ldate|log.Ltime|log.Lshortfile)
	}
	
	// Use both stdout and file for logging
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	
	// Create a new logger with timestamp and file info
	logger := log.New(multiWriter, "", log.Ldate|log.Ltime|log.Lshortfile)
	
	return logger
}

// NewCustomLogger creates a new logger with a specific prefix
func NewCustomLogger(prefix string) *log.Logger {
	// Get the global logger's output
	return log.New(log.Writer(), fmt.Sprintf("[%s] ", prefix), log.Ldate|log.Ltime|log.Lshortfile)
} 