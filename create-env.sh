#!/bin/bash

# Script to create .env files for File.sh

echo -e "\e[32mCreating .env files...\e[0m"

# Create root .env
cat > .env << EOL
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
EOL

# Create backend .env
mkdir -p backend
cat > backend/.env << EOL
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
EOL

# Create frontend .env
mkdir -p frontend
cat > frontend/.env << EOL
# Frontend Environment Variables
# Copy this file to .env and customize as needed

# Backend API URL for frontend to connect to
VITE_API_URL=http://localhost:8080
EOL

echo -e "\e[32mCreated .env files in:\e[0m"
echo -e "\e[36m  - Root directory\e[0m"
echo -e "\e[36m  - frontend directory\e[0m"
echo -e "\e[36m  - backend directory\e[0m"
echo ""
echo -e "\e[33mTo use these files, copy them to .env in the respective directory and customize as needed.\e[0m"

# Make the script executable
chmod +x create-env.sh 