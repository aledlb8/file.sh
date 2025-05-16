# File.sh

<div align="center">

![File.sh Logo](frontend/public/logo.svg)

**Privacy-First Secure File Transfer Platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Backend: Go](https://img.shields.io/badge/Backend-Go-00ADD8?logo=go)](https://golang.org/)
[![Frontend: React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react)](https://reactjs.org/)
[![Storage: MinIO](https://img.shields.io/badge/Storage-MinIO-C72E49?logo=minio)](https://min.io/)
[![Encryption: AES-GCM](https://img.shields.io/badge/Encryption-AES--GCM-2C5BB4)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm)

</div>

## Overview

File.sh is a privacy-first file transfer solution that provides end-to-end encryption with zero server-side knowledge of file contents. Designed for privacy-conscious users, File.sh offers a clean and efficient architecture that can be self-hosted or deployed in cloud environments.

### Security & Privacy Highlights

- **Zero-Knowledge Architecture**: All encryption and decryption operations occur exclusively in the client browser
- **Strong Encryption**: Implements AES-GCM 256-bit encryption via the Web Crypto API
- **No Logs or Tracking**: No IP logging, device fingerprinting, or user tracking
- **Ephemeral Storage**: Configurable auto-expiration for all uploaded content
- **Privacy-by-Design**: Built from the ground up with privacy as a core principle

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Deployment](#deployment)
  - [Quick Start](#quick-start)
  - [Automatic Setup](#automatic-setup)
  - [Manual Setup](#manual-setup)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Backend Development](#backend-development)
  - [Frontend Development](#frontend-development)
- [Security Considerations](#security-considerations)
- [License](#license)

## Features

### Privacy & Security

- **End-to-End Encryption**: All files are encrypted before leaving the client browser using AES-GCM 256-bit encryption
- **Secure Key Management**: Encryption keys are never transmitted to or stored on the server
- **Zero-Knowledge Design**: Server has no capability to access or decrypt user data
- **No Authentication Required**: Minimizes attack surface by eliminating credential storage

### Advanced File Transfer Capabilities

- **Resumable Transfer Protocol**: Upload resilience with automatic session recovery
- **Chunk-Based Transfer System**: Optimized for large files with configurable chunk sizes
- **Transfer State Persistence**: IndexedDB-based state tracking for recovery from network interruptions or browser crashes
- **Batch Operations**: Upload and download multiple files in a single operation

### Performance & Simplicity

- **Horizontal Scalability**: Stateless API design allows scaling across multiple servers
- **Parallel Processing**: Concurrent chunk uploads/downloads for maximum throughput
- **Object Storage Integration**: Native integration with MinIO and S3-compatible storage systems
- **Minimal Resource Footprint**: Lightweight implementation with optimized resource utilization

## Architecture

File.sh implements a modern, scalable architecture:

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│                 │     │                   │     │                      │
│  Browser Client │────▶│  Go/Gin REST API  │────▶│  Object Storage      │
│  (React + Vite) │     │  (Stateless)      │     │  (MinIO/S3)          │
│                 │     │                   │     │                      │
└─────────────────┘     └───────────────────┘     └──────────────────────┘
        │                                                   │
        │                                                   │
        ▼                                                   ▼
┌─────────────────┐                               ┌──────────────────────┐
│ WebCrypto API   │                               │ Lifecycle Management │
│ (Encryption)    │                               │ (Auto-expiration)    │
└─────────────────┘                               └──────────────────────┘
```

- **Frontend**: React with TypeScript, optimized with Vite for performance
- **Backend API**: Go with high-performance Gin framework providing RESTful endpoints
- **Storage Layer**: S3-compatible object storage (MinIO) with lifecycle policies
- **Security Layer**: Client-side WebCrypto API handles all cryptographic operations

## Deployment

### Quick Start

For development and testing environments:

**Windows**
```powershell
./start.ps1
```

**Linux/macOS**
```bash
./start.sh
```

These scripts handle:
- Environment configuration loading
- MinIO deployment via Docker
- Backend API compilation and execution
- Frontend development server setup

### Automatic Setup

To quickly set up all components and generate configuration files:

1. Generate environment configuration files:
   **Windows**
   ```powershell
   .\create-env.ps1
   ```
   
   **Linux/macOS**
   ```bash
   ./create-env.sh
   ```

2. Start the application:
   **Windows**
   ```powershell
   .\start.ps1
   ```
   
   **Linux/macOS**
   ```bash
   ./start.sh
   ```

3. Access the application:
   - Frontend: http://localhost:5173
   - MinIO Console: http://localhost:9001 (user: minioadmin, password: minioadmin)

4. To stop all services:
   **Windows**
   ```powershell
   .\cleanup-windows.ps1
   ```
   
   **Linux/macOS**
   ```bash
   ./cleanup.sh
   ```

### Manual Setup

#### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Build the backend:
   ```bash
   go build -o filesh
   ```

3. Run MinIO locally:
   ```bash
   docker run -p 9000:9000 -p 9001:9001 -e "MINIO_ROOT_USER=minioadmin" -e "MINIO_ROOT_PASSWORD=minioadmin" minio/minio server /data --console-address ":9001"
   ```

4. Run the backend service:
   ```bash
   ./filesh
   ```

#### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

Generate environment configuration templates:

**Windows**
```powershell
.\create-env.ps1
```

**Linux/macOS**
```bash
./create-env.sh
```

Core configuration parameters:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Backend API port | `8080` | No |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` | Yes |
| `MINIO_ENDPOINT` | MinIO/S3 endpoint | `localhost:9000` | Yes |
| `MINIO_ACCESS_KEY` | Storage access key | `minioadmin` | Yes |
| `MINIO_SECRET_KEY` | Storage secret key | `minioadmin` | Yes |
| `MINIO_USE_SSL` | Enable SSL for storage | `false` | No |
| `MINIO_BUCKET_NAME` | Storage bucket name | `filesh` | No |
| `FILE_RETENTION_DAYS` | File expiration period | `7` | No |

## Development

### Prerequisites

- **Backend**: Go 1.16+
- **Frontend**: Node.js 14+
- **Storage**: Docker (for MinIO) or access to S3-compatible storage

### Backend Development

```bash
cd backend
go mod download
go run main.go
```

Backend API will be available at http://localhost:8080

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Frontend development server will be available at http://localhost:5173

## Security Considerations

- **Browser Support**: File.sh requires browsers with WebCrypto API support
- **HTTPS Deployment**: Production deployments should always use HTTPS
- **Key Management**: Ensure users securely store their download links which contain encryption keys
- **Network Security**: Implement appropriate network-level security measures for your deployment

## Performance Optimization

For high-throughput deployments:

- Adjust chunk size based on expected file sizes and network conditions
- Configure appropriate connection pooling on the backend
- Implement a CDN for static asset delivery
- Consider distributed object storage for multi-region deployments

## License

This project is licensed under the MIT License.

---

<div align="center">
<p>Designed with security and privacy as first principles.</p>
</div>