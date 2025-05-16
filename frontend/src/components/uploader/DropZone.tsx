import React from 'react';
import type { RefObject, DragEvent, ChangeEvent } from 'react';

interface DropZoneProps {
    isDragging: boolean;
    isUploading: boolean;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
    onClick: () => void;
    fileInputRef: RefObject<HTMLInputElement>;
    onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}

const DropZone: React.FC<DropZoneProps> = ({
    isDragging,
    isUploading,
    onDragOver,
    onDragLeave,
    onDrop,
    onClick,
    fileInputRef,
    onFileSelect
}) => {
    return (
        <div
            className={`drop-zone ${isDragging ? 'active' : ''} ${isUploading ? 'minimized' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onClick}
        >
            <div className="drop-zone-content">
                <strong>Drag & Drop Files Here</strong>
                <p>or click to select files</p>
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={onFileSelect}
                multiple
                style={{ display: 'none' }}
            />
        </div>
    );
};

export default DropZone;