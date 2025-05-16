# File.sh

A truly lean, anonymous, end-to-end encrypted file uploader designed for privacy-conscious users. It supports batch uploading and downloading of encrypted files with resumable, chunked transfers, delivers lightning-fast performance, and deliberately avoids any tracking, ads, or bloat.

## Key Features

* **Anonymity & No Logs**: No IPs, headers, cookies, or user metadata are ever collected or stored.
* **End-to-End Encryption**: All encryption and decryption happen in the browser using WebCrypto; the server only stores ciphertext.
* **Batch Upload/Download**: Drag-and-drop interface for multiple files; encrypted chunks can be uploaded/downloaded in parallel.
* **Resumable, Chunked Transfers**: Implements chunking (e.g. 5 MiB chunks) with automatic retry and IndexedDB-based state persistence.
* **Zero Tracking & Zero Ads**: No third-party scripts, analytics, trackers, or ad networks.
* **Self-Hosted & Scalable**: Stateless API design allows horizontal scaling; optional Tor hidden-service deployment for added anonymity.

## Prerequisites

- Go (1.24+)
- Node.js (22+)
- MinIO (or any S3-compatible object storage)
- Docker (recommended for MinIO)

## Quick Start

For a quick start on Windows:
```
./start.ps1
```

For Linux/Mac:
```
./start.sh
```

These scripts will:
1. Load environment variables from `.env` if present
2. Start MinIO in a Docker container
3. Build and start the backend API
4. Set up and start the frontend development server

## Configuration

### Environment Variables

Windows
```sh
.\create-env.ps1
```

Linux
```sh
.\create-env.sh
```

## Manual Setup

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Build the backend:
   ```
   go build -o filesh
   ```

3. Run MinIO locally:
   ```
   docker run -p 9000:9000 -p 9001:9001 -e "MINIO_ROOT_USER=minioadmin" -e "MINIO_ROOT_PASSWORD=minioadmin" minio/minio server /data --console-address ":9001"
   ```

4. Run the backend service:
   ```
   ./filesh
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build for production:
   ```
   npm run build
   ```

## Architecture

```
[Browser Client]  ↔ [Go/Gin API] ↔ [MinIO Object Store]
```

* Client handles all encryption via WebCrypto.
* API is stateless: only manages batch lifecycle; no user data beyond ciphertext.
* Storage bucket paths organized by `batchID/chunkIndex`.