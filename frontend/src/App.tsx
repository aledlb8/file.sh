import { useState, useEffect } from 'react'
import './App.css'
import Uploader from './components/Uploader'
import Downloader from './components/Downloader'
import Footer from './components/Footer'

function App() {
  const [view, setView] = useState<'upload' | 'download'>('upload')
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Handle tab transitions
  const handleViewChange = (newView: 'upload' | 'download') => {
    if (newView === view) return
    
    setIsTransitioning(true)
    setView(newView)
    
    // After animation completes, update the current view
    setTimeout(() => {
      setIsTransitioning(false)
    }, 300) // Match this with CSS transition duration
  }

  // Check for batch and key parameters on mount and switch to download tab if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const batchParam = params.get('batch');
    const keyParam = params.get('key');

    if (batchParam && keyParam) {
      handleViewChange('download')
    }
  }, []);

  return (
    <div className="app-container">
      <header>
        <h1>File.sh</h1>
        <p>End-to-end encrypted, anonymous file transfers</p>
        
        <nav>
          <button 
            className={view === 'upload' ? 'active' : ''} 
            onClick={() => handleViewChange('upload')}
          >
            Upload
          </button>
          <button 
            className={view === 'download' ? 'active' : ''} 
            onClick={() => handleViewChange('download')}
          >
            Download
          </button>
        </nav>
      </header>

      <main className={`tab-container ${isTransitioning ? 'transitioning' : ''}`}>
        <div className={`tab-view ${view === 'upload' ? 'active' : 'inactive'}`}>
          <Uploader />
        </div>
        <div className={`tab-view ${view === 'download' ? 'active' : 'inactive'}`}>
          <Downloader />
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default App
