import React from 'react';
import type { DownloadState } from '../../hooks/useDownloadManager';

interface DownloadCompleteProps {
    downloadState: DownloadState;
    onDownloadFile: () => void;
    onReset: () => void;
    formatFileSize: (bytes: number) => string;
}

const DownloadComplete: React.FC<DownloadCompleteProps> = ({
    downloadState,
    onDownloadFile,
    onReset,
    formatFileSize
}) => {
    return (
        <div className="download-complete">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 12L11 15L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <h2>{downloadState.status === 'ready' ? 'Your file is ready!' : 'Download complete!'}</h2>
            <div className="file-info-container">
                <div className="file-icon">📄</div>
                <div className="file-info">
                    <p className="file-name">{downloadState.fileName}</p>
                    <p className="file-details">
                        <span className="file-size">{formatFileSize(downloadState.fileSize || 0)}</span>
                        <span className="file-separator">•</span>
                        <span className="file-type">{downloadState.fileType}</span>
                    </p>
                </div>
            </div>

            {downloadState.status === 'ready' && (
                <button className="button" onClick={onDownloadFile}>
                    Download File
                </button>
            )}

            <button className="button button-secondary" onClick={onReset}>
                {downloadState.status === 'ready' ? 'Cancel' : 'Download Another File'}
            </button>
        </div>
    );
};

export default DownloadComplete;