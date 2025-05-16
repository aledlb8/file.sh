# Script to create .env files for File.sh

Write-Host "Creating .env files..." -ForegroundColor Green

# Create root .env
$rootEnv = @"
# File.sh Environment Variables
# Copy this file to .env and customize as needed

#-----------------------------------------------
# Backend API Configuration
#-----------------------------------------------
# Server port (default: 8080 if not set)
PORT=8080

# CORS configuration for frontend
CORS_ORIGIN=http://localhost:5173

# File expiry time in format like "24h", "7d", "168h" (default: 7 days)
FILE_EXPIRY=168h

#-----------------------------------------------
# MinIO Storage Configuration
#-----------------------------------------------
# MinIO server connection details
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=filesh

# MinIO ports (for Docker setup in start scripts)
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
"@

# Create backend .env
$backendEnv = @"
# Backend Environment Variables
# Copy this file to .env and customize as needed

# Server port (default: 8080 if not set)
PORT=8080

# CORS configuration for frontend
CORS_ORIGIN=http://localhost:5173

# File expiry time in format like "24h", "7d", "168h" (default: 7 days)
FILE_EXPIRY=168h

# MinIO server connection details
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=filesh
"@

# Create frontend .env
$frontendEnv = @"
# Frontend Environment Variables
# Copy this file to .env and customize as needed

# Backend API URL for frontend to connect to
VITE_API_URL=http://localhost:8080
"@

# Write the files
$rootEnv | Out-File -FilePath ".env" -Encoding UTF8
$backendEnv | Out-File -FilePath "backend\.env" -Encoding UTF8
$frontendEnv | Out-File -FilePath "frontend\.env" -Encoding UTF8

Write-Host "Created .env files in:" -ForegroundColor Green
Write-Host "  - Root directory" -ForegroundColor Cyan
Write-Host "  - frontend directory" -ForegroundColor Cyan
Write-Host "  - backend directory" -ForegroundColor Cyan
Write-Host ""
Write-Host "To use these files, copy them to .env in the respective directory and customize as needed." -ForegroundColor Yellow 