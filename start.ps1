# Anonymous File Transfer Starter Script for Windows

Write-Host "Starting Anonymous File Transfer..." -ForegroundColor Green
Write-Host "This script will help you set up and run the project." -ForegroundColor Green

# Load environment variables from .env file if it exists
if (Test-Path ".env") {
    Write-Host "Loading environment variables from .env file..." -ForegroundColor Cyan
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($value -match '^"(.*)"$') { $value = $matches[1] }
            if ($value -match "^'(.*)'$") { $value = $matches[1] }
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
            Write-Host "  Set $key environment variable" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "No .env file found. Using default configuration." -ForegroundColor Yellow
    Write-Host "You can create a .env file based on .env.example to customize settings." -ForegroundColor Yellow
}

# Check for required tools
Write-Host "Checking for required tools..." -ForegroundColor Cyan

try {
    $goVersion = go version
    Write-Host "Go is installed: $goVersion" -ForegroundColor Green
} catch {
    Write-Host "Go is not installed. Please install Go 1.16+ from https://golang.org/dl/" -ForegroundColor Red
    exit 1
}

try {
    $nodeVersion = node -v
    Write-Host "Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js is not installed. Please install Node.js 14+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

try {
    $dockerVersion = docker -v
    Write-Host "Docker is installed: $dockerVersion" -ForegroundColor Green
    
    # Get MinIO config from environment or use defaults
    $minioUser = [Environment]::GetEnvironmentVariable("MINIO_ACCESS_KEY")
    if ([string]::IsNullOrEmpty($minioUser)) {
        $minioUser = "minioadmin"
    }

    $minioPass = [Environment]::GetEnvironmentVariable("MINIO_SECRET_KEY")
    if ([string]::IsNullOrEmpty($minioPass)) {
        $minioPass = "minioadmin"
    }

    $minioPort = "9000:9000"
    $minioConsolePort = "9001:9001"
    
    # Start MinIO if docker is available
    Write-Host "Starting MinIO via Docker..." -ForegroundColor Cyan
    docker run -d --name filesh-minio `
        -p $minioPort -p $minioConsolePort `
        -e "MINIO_ROOT_USER=$minioUser" `
        -e "MINIO_ROOT_PASSWORD=$minioPass" `
        minio/minio server /data --console-address ":9001"
    
    Write-Host "MinIO started. Console available at http://localhost:9001" -ForegroundColor Green
    Write-Host "Username: $minioUser, Password: $minioPass" -ForegroundColor Green
} catch {
    Write-Host "Warning: Docker is not installed. MinIO will not be started automatically." -ForegroundColor Yellow
    Write-Host "You can still run the project if you have MinIO installed separately." -ForegroundColor Yellow
}

# Start backend
Write-Host "Building backend..." -ForegroundColor Cyan
Push-Location -Path "backend"
go build -o filesh.exe
Write-Host "Starting backend server..." -ForegroundColor Cyan
Start-Process -FilePath ".\filesh.exe"
Pop-Location

# Start frontend
Write-Host "Setting up frontend..." -ForegroundColor Cyan
Push-Location -Path "frontend"
npm install
Write-Host "Starting frontend development server..." -ForegroundColor Cyan
Start-Process -FilePath "npm" -ArgumentList "run dev"
Pop-Location

Write-Host "=================================="
Write-Host "File.sh is running!" -ForegroundColor Green
Write-Host "=================================="
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:8080" -ForegroundColor Cyan
Write-Host "MinIO Console: http://localhost:9001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop all services, then run cleanup-windows.ps1 to stop all processes." -ForegroundColor Yellow

# Create cleanup script with env var handling
@"
# Cleanup script for File.sh

Write-Host "Stopping services..." -ForegroundColor Cyan

# Stop backend process
Get-Process -Name "filesh" -ErrorAction SilentlyContinue | Stop-Process -Force

# Find and stop the Node.js process running the dev server
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {`$_.CommandLine -like "*vite*"} | Stop-Process -Force

# Stop the MinIO container
docker stop filesh-minio
docker rm filesh-minio

Write-Host "All services stopped." -ForegroundColor Green
"@ | Out-File -FilePath "cleanup-windows.ps1" -Encoding UTF8 