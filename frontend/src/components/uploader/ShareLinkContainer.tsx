import React from 'react';

interface ShareLinkContainerProps {
  shareLink: string | null;
  onCopyLink: () => void;
  onReset: () => void;
}

const ShareLinkContainer: React.FC<ShareLinkContainerProps> = ({
  shareLink,
  onCopyLink,
  onReset
}) => {
  if (!shareLink) return null;

  return (
    <div className="share-link-container">
      <h2>Upload Complete!</h2>
      <div
        className="download-link"
        onClick={onCopyLink}
      >
        {shareLink}
      </div>
      <p className="warning">
        <strong>Important:</strong> This link contains the encryption key.
        We don't store it on our servers - without this link, <span className="highlight">no one can decrypt your files.</span>
      </p>
      <button className="button" onClick={onReset}>
        Upload More Files
      </button>
    </div>
  );
};

export default ShareLinkContainer;