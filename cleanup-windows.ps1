# Cleanup script for File.sh

Write-Host "Stopping services..." -ForegroundColor Cyan

# Stop backend process
Get-Process -Name "filesh" -ErrorAction SilentlyContinue | Stop-Process -Force

# Find and stop the Node.js process running the dev server
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*vite*"} | Stop-Process -Force

# Stop the MinIO container
docker stop filesh-minio
docker rm filesh-minio

Write-Host "All services stopped." -ForegroundColor Green
