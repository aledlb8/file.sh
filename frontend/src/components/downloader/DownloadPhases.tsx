import React from 'react';

interface DownloadPhasesProps {
  status: string;
  progress: number;
}

const DownloadPhases: React.FC<DownloadPhasesProps> = ({ status, progress }) => {
  return (
    <div className="download-phases">
      {/* Phase 1: Downloading */}
      <div className={`download-phase ${status === 'downloading' ? 'active' : status === 'decrypting' || status === 'preparing' ? 'completed' : ''}`}>
        <div className="download-phase-icon">
          {status === 'downloading' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : status === 'decrypting' || status === 'preparing' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12C21 13.1819 20.7672 14.3522 20.3149 15.4442C19.8626 16.5361 19.1997 17.5282 18.364 18.364C17.5282 19.1997 16.5361 19.8626 15.4442 20.3149C14.3522 20.7672 13.1819 21 12 21C10.8181 21 9.64778 20.7672 8.55585 20.3149C7.46392 19.8626 6.47177 19.1997 5.63604 18.364C4.80031 17.5282 4.13738 16.5361 3.68508 15.4442C3.23279 14.3522 3 13.1819 3 12C3 9.61305 3.94821 7.32387 5.63604 5.63604C7.32387 3.94821 9.61305 3 12 3C14.3869 3 16.6761 3.94821 18.364 5.63604C20.0518 7.32387 21 9.61305 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 12H12V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="download-phase-content">
          <div className="download-phase-title">
            Downloading Encrypted Data
          </div>
          <div className="download-phase-description">
            Retrieving encrypted file chunks from the server
          </div>
          {status === 'downloading' && (
            <div className="download-phase-progress">
              <div className="download-phase-progress-bar" style={{ width: `${Math.min(progress * 100 / 90, 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Phase 2: Decrypting */}
      <div className={`download-phase ${status === 'decrypting' ? 'active' : status === 'preparing' ? 'completed' : ''}`}>
        <div className="download-phase-icon">
          {status === 'decrypting' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
              <path d="M12 15V17M6 9V19C6 19.5304 6.21071 20.0391 6.58579 20.4142C6.96086 20.7893 7.46957 21 8 21H16C16.5304 21 17.0391 20.7893 17.4142 20.4142C17.7893 20.0391 18 19.5304 18 19V9M6 9H18M6 9C6 7.93913 6.42143 6.92172 7.17157 6.17157C7.92172 5.42143 8.93913 5 10 5H14C15.0609 5 16.0783 5.42143 16.8284 6.17157C17.5786 6.92172 18 7.93913 18 9M10 13H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : status === 'preparing' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12C21 13.1819 20.7672 14.3522 20.3149 15.4442C19.8626 16.5361 19.1997 17.5282 18.364 18.364C17.5282 19.1997 16.5361 19.8626 15.4442 20.3149C14.3522 20.7672 13.1819 21 12 21C10.8181 21 9.64778 20.7672 8.55585 20.3149C7.46392 19.8626 6.47177 19.1997 5.63604 18.364C4.80031 17.5282 4.13738 16.5361 3.68508 15.4442C3.23279 14.3522 3 13.1819 3 12C3 9.61305 3.94821 7.32387 5.63604 5.63604C7.32387 3.94821 9.61305 3 12 3C14.3869 3 16.6761 3.94821 18.364 5.63604C20.0518 7.32387 21 9.61305 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 12H12V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="download-phase-content">
          <div className="download-phase-title">
            Decrypting File
          </div>
          <div className="download-phase-description">
            Applying end-to-end encryption to decrypt your file
          </div>
          {status === 'decrypting' && (
            <div className="download-phase-progress">
              <div className="download-phase-progress-bar" style={{ width: `${Math.min((progress - 90) * 100 / 10, 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Phase 3: Preparing */}
      <div className={`download-phase ${status === 'preparing' ? 'active' : ''}`}>
        <div className="download-phase-icon">
          {status === 'preparing' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
              <path d="M19 16V18M19 22V22.01M12 6H20C20.5304 6 21.0391 6.21071 21.4142 6.58579C21.7893 6.96086 22 7.46957 22 8V11.5C21.337 11.5 20.7011 11.7634 20.2322 12.2322C19.7634 12.7011 19.5 13.337 19.5 14C19.5 14.663 19.7634 15.2989 20.2322 15.7678C20.7011 16.2366 21.337 16.5 22 16.5V20C22 20.5304 21.7893 21.0391 21.4142 21.4142C21.0391 21.7893 20.5304 22 20 22H4C3.46957 22 2.96086 21.7893 2.58579 21.4142C2.21071 21.0391 2 20.5304 2 20V8C2 7.46957 2.21071 6.96086 2.58579 6.58579C2.96086 6.21071 3.46957 6 4 6H7.5C7.5 5.33696 7.76339 4.70107 8.23223 4.23223C8.70107 3.76339 9.33696 3.5 10 3.5C10.663 3.5 11.2989 3.76339 11.7678 4.23223C12.2366 4.70107 12.5 5.33696 12.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 12H12V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="download-phase-content">
          <div className="download-phase-title">
            Preparing File
          </div>
          <div className="download-phase-description">
            Creating download link for your decrypted file
          </div>
          {status === 'preparing' && (
            <div className="download-phase-progress">
              <div className="download-phase-progress-bar" style={{ width: `${Math.min((progress - 90) * 100 / 10, 100)}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadPhases;