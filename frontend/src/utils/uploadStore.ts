import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

/**
 * Fixed chunk handling for large file uploads
 * Ensures that files are properly divided into the intended chunk size
 */
export const prepareFileChunks = (file: Blob, chunkSize: number = 2 * 1024 * 1024): Blob[] => {
  const chunks: Blob[] = [];
  const totalChunks = Math.ceil(file.size / chunkSize);
  console.log(`Preparing ${totalChunks} chunks of ${chunkSize} bytes for file of size ${file.size} bytes`);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    chunks.push(chunk);
    
    if (i === 0 || i === totalChunks - 1 || i % 10 === 0) {
      console.log(`Prepared chunk ${i+1}/${totalChunks}, size: ${chunk.size} bytes`);
    }
  }
  
  console.log(`Total chunks prepared: ${chunks.length}`);
  return chunks;
}

// Define database schema
interface UploadDB extends DBSchema {
  'upload-state': {
    key: string;
    value: UploadState;
    indexes: {
      'by-date': number;
    };
  };
  'chunk-state': {
    key: string; // batchId-fileId-chunkIndex
    value: ChunkState;
  };
}

export interface UploadState {
  batchId: string;
  fileIds: string[];
  encryptionKey: string; // Base64 encoded encryption key
  totalSize: number;
  uploadedSize: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  createdAt: number;
  updatedAt: number;
  metadata: FileMetadata[];
}

export interface FileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface ChunkState {
  batchId: string;
  fileId: string;
  chunkIndex: number;
  uploaded: boolean;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  attempts: number;
}

const DB_NAME = 'filesh-uploads';
const DB_VERSION = 1;

class UploadStore {
  private db: Promise<IDBPDatabase<UploadDB>>;

  constructor() {
    this.db = this.initDB();
  }

  private async initDB() {
    return openDB<UploadDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create upload state store
        if (!db.objectStoreNames.contains('upload-state')) {
          const uploadStore = db.createObjectStore('upload-state');
          uploadStore.createIndex('by-date', 'updatedAt');
        }

        // Create chunk state store
        if (!db.objectStoreNames.contains('chunk-state')) {
          db.createObjectStore('chunk-state');
        }
      },
    });
  }

  // Save or update an upload state
  async saveUploadState(batchId: string, state: Partial<UploadState>): Promise<void> {
    const db = await this.db;
    const tx = db.transaction('upload-state', 'readwrite');
    const store = tx.objectStore('upload-state');
    
    // Get existing state or create new one
    const existingState = await store.get(batchId) || {
      batchId,
      fileIds: [],
      encryptionKey: '',
      totalSize: 0,
      uploadedSize: 0,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: [],
    } as UploadState;

    // Update with new values
    const updatedState = {
      ...existingState,
      ...state,
      updatedAt: Date.now(), // Always update the timestamp
    };

    await store.put(updatedState, batchId);
    await tx.done;
  }

  // Get an upload state by batchId
  async getUploadState(batchId: string): Promise<UploadState | undefined> {
    const db = await this.db;
    return db.get('upload-state', batchId);
  }

  // Delete an upload state
  async deleteUploadState(batchId: string): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['upload-state', 'chunk-state'], 'readwrite');
    
    // Delete the upload state
    await tx.objectStore('upload-state').delete(batchId);
    
    // Delete all associated chunks
    const chunkStore = tx.objectStore('chunk-state');
    const allChunks = await db.getAllKeys('chunk-state');
    
    for (const key of allChunks) {
      if (typeof key === 'string' && key.startsWith(`${batchId}-`)) {
        await chunkStore.delete(key);
      }
    }
    
    await tx.done;
  }

  // Save or update a chunk state
  async saveChunkState(state: ChunkState): Promise<void> {
    const db = await this.db;
    const key = `${state.batchId}-${state.fileId}-${state.chunkIndex}`;
    await db.put('chunk-state', state, key);
  }

  // Get a chunk state
  async getChunkState(batchId: string, fileId: string, chunkIndex: number): Promise<ChunkState | undefined> {
    const db = await this.db;
    const key = `${batchId}-${fileId}-${chunkIndex}`;
    return db.get('chunk-state', key);
  }

  // Get all chunks for a specific file
  async getChunkStates(batchId: string, fileId: string): Promise<ChunkState[]> {
    const db = await this.db;
    const allChunks = await db.getAll('chunk-state');
    return allChunks.filter(chunk => chunk.batchId === batchId && chunk.fileId === fileId);
  }

  // Get all chunks for a batch
  async getAllChunks(batchId: string): Promise<ChunkState[]> {
    const db = await this.db;
    const allChunks = await db.getAll('chunk-state');
    return allChunks.filter(chunk => chunk.batchId === batchId);
  }

  // Get all incomplete uploads
  async getIncompleteUploads(): Promise<UploadState[]> {
    const db = await this.db;
    const tx = db.transaction('upload-state', 'readonly');
    const store = tx.objectStore('upload-state');
    const index = store.index('by-date');
    
    const allUploads = await index.getAll();
    return allUploads.filter(
      upload => upload.status !== 'completed' && upload.status !== 'error'
    );
  }

  // Add a chunk to the uploaded list
  async addUploadedChunk(batchId: string, chunkIndex: number): Promise<void> {
    const state = await this.getUploadState(batchId);
    if (!state) return;

    // Mark the chunk as uploaded
    const chunkStates = await this.getAllChunks(batchId);
    const matchingChunk = chunkStates.find(c => c.chunkIndex === chunkIndex);

    if (matchingChunk) {
      await this.saveChunkState({
        ...matchingChunk,
        uploaded: true,
        status: 'completed'
      });
    }
  }

  // Clean up old uploads (older than 7 days)
  async cleanupOldUploads(): Promise<void> {
    const db = await this.db;
    const tx = db.transaction('upload-state', 'readwrite');
    const store = tx.objectStore('upload-state');
    
    const allUploads = await store.getAll();
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    for (const upload of allUploads) {
      if (upload.updatedAt < sevenDaysAgo) {
        await this.deleteUploadState(upload.batchId);
      }
    }
  }
}

// Create a singleton instance
const uploadStore = new UploadStore();
export default uploadStore; 