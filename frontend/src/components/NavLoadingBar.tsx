import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './NavLoadingBar.css'

const NavLoadingBar = () => {
  const location = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 400)
    return () => clearTimeout(timer)
  }, [location.pathname, location.key])

  if (!visible) return null

  return (
    <div className="nav-loading-bar" role="progressbar" aria-hidden="true">
      <div className="nav-loading-bar-fill" />
    </div>
  )
}

export default NavLoadingBar
