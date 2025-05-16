import React from 'react';

interface UploadControlsProps {
    isUploading: boolean;
    isPaused: boolean;
    filesCount: number;
    onUpload: () => void;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
}

const UploadControls: React.FC<UploadControlsProps> = ({
    isUploading,
    isPaused,
    filesCount,
    onUpload,
    onPause,
    onResume,
    onCancel
}) => {
    return (
        <div className="button-group">
            {!isUploading && (
                <button
                    className="button"
                    onClick={onUpload}
                    disabled={filesCount === 0}
                >
                    Upload Files
                </button>
            )}

            {isUploading && !isPaused && (
                <button
                    className="button"
                    onClick={onPause}
                >
                    Pause Upload
                </button>
            )}

            {isUploading && isPaused && (
                <button
                    className="button"
                    onClick={onResume}
                >
                    Resume Upload
                </button>
            )}

            <button
                className="button button-secondary"
                onClick={onCancel}
                disabled={isUploading && !isPaused}
            >
                Cancel
            </button>
        </div>
    );
};

export default UploadControls;