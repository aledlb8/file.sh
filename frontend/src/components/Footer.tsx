import React, { useState, useEffect } from 'react';

const Footer: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsClosing(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setIsClosing(true);
    // Delay actual closing to allow animation to complete
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  // Close modal on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  return (
    <>
      <footer>
        <p>File.sh - End-to-end encrypted, anonymous file transfers</p>

        <div className="footer-links">
          <a href="https://github.com/aledlb8/file.sh" target="_blank" rel="noopener noreferrer" className="github-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.477 2 2 6.477 2 12C2 16.418 4.865 20.166 8.839 21.489C9.339 21.581 9.5 21.278 9.5 21.017C9.5 20.778 9.492 20.065 9.489 19.193C6.728 19.86 6.139 17.82 6.139 17.82C5.685 16.679 5.028 16.377 5.028 16.377C4.132 15.749 5.097 15.762 5.097 15.762C6.094 15.831 6.628 16.794 6.628 16.794C7.52 18.364 8.97 17.867 9.518 17.615C9.607 16.932 9.859 16.435 10.137 16.159C7.93 15.881 5.62 15.034 5.62 11.222C5.62 10.124 6.01 9.231 6.647 8.534C6.541 8.287 6.206 7.255 6.747 5.946C6.747 5.946 7.582 5.681 9.469 7.075C10.2926 6.85216 11.1406 6.74012 11.994 6.74C12.849 6.74 13.705 6.853 14.531 7.075C16.416 5.681 17.25 5.946 17.25 5.946C17.791 7.255 17.456 8.287 17.35 8.534C17.989 9.231 18.373 10.124 18.373 11.222C18.373 15.044 16.06 15.878 13.845 16.15C14.189 16.49 14.5 17.156 14.5 18.178C14.5 19.642 14.489 20.68 14.489 21.016C14.489 21.28 14.648 21.585 15.154 21.487C19.135 20.165 22 16.418 22 12C22 6.477 17.523 2 12 2Z" fill="currentColor" />
            </svg>
            GitHub
          </a>
          <span className="footer-separator">•</span>
          <a href="#" className="self-host-link" onClick={openModal}>
            Self-Host
          </a>
        </div>

        <p>
          <small>
            No logs. No tracking. All encryption and decryption happens in your browser.
          </small>
        </p>
      </footer>

      {showModal && (
        <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={closeModal}>
          <div className={`modal-content ${isClosing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Self-Host File.sh</h3>
              <button className="modal-close" onClick={closeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p>File.sh is an open-source project that you can host on your own server for complete control over your data.</p>

              <h4>Benefits of Self-Hosting</h4>
              <ul>
                <li>Complete control over your file transfers</li>
                <li>Set your own file retention policies</li>
                <li>Custom domain and branding options</li>
                <li>Enhanced privacy for your organization</li>
              </ul>

              <h4>Requirements</h4>
              <ul>
                <li>A server with Docker installed</li>
                <li>Basic command line knowledge</li>
              </ul>

              <h4>Quick Setup</h4>
              <div className="code-block">
                <code>
                  git clone https://github.com/aledlb8/file.sh<br />
                  cd file.sh<br />
                  # On Windows:<br />
                  ./start.ps1<br />
                  # On Linux/Mac:<br />
                  ./start.sh
                </code>
              </div>

              <p>For detailed setup instructions, deployment options, and configuration details, visit the <a href="https://github.com/aledlb8/file.sh" target="_blank" rel="noopener noreferrer">GitHub repository</a>.</p>
            </div>
            <div className="modal-footer">
              <button className="button" onClick={closeModal}>Close</button>
              <a href="https://github.com/aledlb8/file.sh" target="_blank" rel="noopener noreferrer" className="button">View on GitHub</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Footer;