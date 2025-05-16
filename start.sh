#!/bin/bash

# Anonymous File Transfer Starter Script

echo -e "\e[32mStarting Anonymous File Transfer...\e[0m"
echo -e "This script will help you set up and run the project."

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    echo -e "\e[36mLoading environment variables from .env file...\e[0m"
    export $(grep -v '^#' .env | xargs)
    echo -e "\e[90mEnvironment variables loaded.\e[0m"
else
    echo -e "\e[33mNo .env file found. Using default configuration.\e[0m"
    echo -e "\e[33mYou can create a .env file based on .env.example to customize settings.\e[0m"
fi

# Check for required tools
echo -e "\e[36mChecking for required tools...\e[0m"

if command -v go >/dev/null 2>&1; then
    echo -e "\e[32mGo is installed: $(go version)\e[0m"
else
    echo -e "\e[31mGo is not installed. Please install Go 1.16+ from https://golang.org/dl/\e[0m"
    exit 1
fi

if command -v node >/dev/null 2>&1; then
    echo -e "\e[32mNode.js is installed: $(node -v)\e[0m"
else
    echo -e "\e[31mNode.js is not installed. Please install Node.js 14+ from https://nodejs.org/\e[0m"
    exit 1
fi

# Get MinIO config from environment or use defaults
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadmin}
MINIO_PORT=${MINIO_PORT:-9000}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT:-9001}

if command -v docker >/dev/null 2>&1; then
    echo -e "\e[32mDocker is installed: $(docker -v)\e[0m"
    
    # Start MinIO if docker is available
    echo -e "\e[36mStarting MinIO via Docker...\e[0m"
    docker run -d --name filesh-minio \
        -p ${MINIO_PORT}:9000 -p ${MINIO_CONSOLE_PORT}:9001 \
        -e "MINIO_ROOT_USER=${MINIO_ACCESS_KEY}" \
        -e "MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}" \
        minio/minio server /data --console-address ":9001"
    
    echo -e "\e[32mMinIO started. Console available at http://localhost:${MINIO_CONSOLE_PORT}\e[0m"
    echo -e "\e[32mUsername: ${MINIO_ACCESS_KEY}, Password: ${MINIO_SECRET_KEY}\e[0m"
else
    echo -e "\e[33mWarning: Docker is not installed. MinIO will not be started automatically.\e[0m"
    echo -e "\e[33mYou can still run the project if you have MinIO installed separately.\e[0m"
fi

# Start backend
echo -e "\e[36mBuilding backend...\e[0m"
cd backend
go build -o filesh
echo -e "\e[36mStarting backend server...\e[0m"
./filesh &
BACKEND_PID=$!
cd ..

# Start frontend
echo -e "\e[36mSetting up frontend...\e[0m"
cd frontend
npm install
echo -e "\e[36mStarting frontend development server...\e[0m"
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "=================================="
echo -e "\e[32mFile.sh is running!\e[0m"
echo -e "=================================="
echo -e "\e[36mFrontend: http://localhost:5173\e[0m"
echo -e "\e[36mBackend API: http://localhost:8080\e[0m"
echo -e "\e[36mMinIO Console: http://localhost:${MINIO_CONSOLE_PORT}\e[0m"
echo ""
echo -e "\e[33mPress Ctrl+C to stop all services.\e[0m"

# Create cleanup function
cleanup() {
    echo -e "\e[36mStopping services...\e[0m"
    
    # Kill processes
    kill $FRONTEND_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    
    # Stop the MinIO container
    docker stop filesh-minio 2>/dev/null
    docker rm filesh-minio 2>/dev/null
    
    echo -e "\e[32mAll services stopped.\e[0m"
    exit 0
}

# Register the cleanup function to run on script termination
trap cleanup SIGINT SIGTERM

# Wait for Ctrl+C
while true; do
    sleep 1
done 