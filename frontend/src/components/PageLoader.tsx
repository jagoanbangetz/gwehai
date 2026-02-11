import { useEffect, useState } from 'react'
import './PageLoader.css'

interface PageLoaderProps {
  children: React.ReactNode
  delay?: number
}

const PageLoader = ({ children, delay = 300 }: PageLoaderProps) => {
  const [pageLoaded, setPageLoaded] = useState(false)

  useEffect(() => {
    // Smooth transition after delay
    const timer = setTimeout(() => {
      setPageLoaded(true)
    }, delay)

    return () => clearTimeout(timer)
  }, [delay])

  return (
    <>
      {/* Loading Overlay */}
      {!pageLoaded && (
        <div className="page-loading-overlay">
          <div className="page-loading-content">
            <div className="page-loading-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
            <div className="page-loading-text">Loading...</div>
          </div>
        </div>
      )}

      {/* Page Content */}
      <div className={`page-wrapper ${pageLoaded ? 'loaded' : ''}`}>
        {children}
      </div>
    </>
  )
}

export default PageLoader
