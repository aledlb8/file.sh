import React from 'react';
import DownloadPhases from './DownloadPhases';
import DownloadComplete from './DownloadComplete';
import DownloadError from './DownloadError';
import type { DownloadState } from '../../hooks/useDownloadManager';

interface DownloadStatusProps {
    downloadState: DownloadState;
    onDownloadFile: () => void;
    onReset: () => void;
    formatFileSize: (bytes: number) => string;
}

const DownloadStatus: React.FC<DownloadStatusProps> = ({
    downloadState,
    onDownloadFile,
    onReset,
    formatFileSize
}) => {
    const isLoading = ['loading', 'downloading', 'decrypting', 'preparing'].includes(downloadState.status);

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
                        <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" />
                        <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
                        <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4" />
                        <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
                        <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
                        <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="1" />
                        <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
                        <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" />
                    </svg>
                </div>
                <p className="loading-message">{downloadState.message}</p>

                <DownloadPhases status={downloadState.status} progress={downloadState.progress} />
            </div>
        );
    }

    if (downloadState.status === 'ready' || downloadState.status === 'complete') {
        return (
            <DownloadComplete
                downloadState={downloadState}
                onDownloadFile={onDownloadFile}
                onReset={onReset}
                formatFileSize={formatFileSize}
            />
        );
    }

    if (downloadState.status === 'error') {
        return (
            <DownloadError
                message={downloadState.message}
                onReset={onReset}
            />
        );
    }

    // Fallback for any other status
    return null;
};

export default DownloadStatus;