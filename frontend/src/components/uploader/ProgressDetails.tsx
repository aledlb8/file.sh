import React, { useMemo } from 'react';
import type { UploadStats } from '../../hooks/useUploadManager';
import { formatTime } from '../../utils/formatters';

interface ProgressDetailsProps {
  stats: UploadStats;
}

const ProgressDetails: React.FC<ProgressDetailsProps> = ({ stats }) => {
  const { totalChunks, uploadedChunks, currentChunk, chunkProgress, phase, startTime } = stats;

  const calculatedStats = useMemo(() => {
    const elapsedSeconds = Math.max(1, (Date.now() - startTime) / 1000);
    const uploadRate = elapsedSeconds > 0 ? (uploadedChunks / elapsedSeconds).toFixed(2) : '0';

    const estimatedTotalTime = elapsedSeconds > 0 && uploadedChunks > 0
      ? ((elapsedSeconds / uploadedChunks) * totalChunks).toFixed(0)
      : '?';

    const estimatedRemaining = elapsedSeconds > 0 && uploadedChunks > 0 && uploadedChunks < totalChunks
      ? ((elapsedSeconds / uploadedChunks) * (totalChunks - uploadedChunks)).toFixed(0)
      : '0';

    return {
      elapsedSeconds,
      uploadRate,
      estimatedTotalTime,
      estimatedRemaining
    };
  }, [totalChunks, uploadedChunks, startTime]);

  const { elapsedSeconds, uploadRate, estimatedTotalTime, estimatedRemaining } = calculatedStats;

  return (
    <div className="progress-details">
      <div className="progress-header">
        <h3>Upload Progress</h3>
        <div className="phase-indicator">
          Phase: <span className={`phase-${phase}`}>
            {phase === 'encrypting' ? 'Encrypting' :
              phase === 'uploading' ? 'Uploading' :
                phase === 'processing' ? 'Processing' : 'Complete'}
          </span>
        </div>
      </div>

      <div className="progress-metrics">
        <div className="metric">
          <span className="metric-label">Chunks:</span>
          <span className="metric-value">{uploadedChunks} / {totalChunks || '?'}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Current Chunk:</span>
          <span className="metric-value">{currentChunk} ({chunkProgress}%)</span>
        </div>
        <div className="metric">
          <span className="metric-label">Upload Rate:</span>
          <span className="metric-value">{uploadRate} chunks/sec</span>
        </div>
        <div className="metric">
          <span className="metric-label">Elapsed Time:</span>
          <span className="metric-value">{formatTime(elapsedSeconds)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Estimated Total:</span>
          <span className="metric-value">
            {estimatedTotalTime !== '?' ? formatTime(Number(estimatedTotalTime)) : 'Calculating...'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Remaining:</span>
          <span className="metric-value">
            {estimatedRemaining !== '0' ? formatTime(Number(estimatedRemaining)) : 'Almost done...'}
          </span>
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-chunks">
          {Array.from({ length: Math.min(totalChunks || 10, 50) }).map((_, index) => {
            const chunkStatus = index < uploadedChunks
              ? 'complete'
              : index === uploadedChunks
                ? 'active'
                : 'pending';
            return (
              <div
                key={index}
                className={`progress-chunk ${chunkStatus}`}
                style={{
                  width: `${100 / Math.min(totalChunks || 10, 50)}%`,
                  opacity: chunkStatus === 'pending' ? 0.3 + (0.7 * (1 - (index - uploadedChunks) / Math.min(totalChunks || 10, 20))) : 1
                }}
              >
                {chunkStatus === 'active' && <div
                  className="chunk-progress"
                  style={{ width: `${chunkProgress}%` }}
                />}
              </div>
            );
          })}
        </div>
        <div className="progress-percentage">
          {totalChunks ? Math.round((uploadedChunks / totalChunks) * 100) : 0}%
        </div>
      </div>
    </div>
  );
};

export default ProgressDetails;