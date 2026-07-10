import { useTheme } from '../context/ThemeContext'
import './ThemeToggle.css'

interface ThemeToggleProps {
  /** Show label text next to the icon */
  showLabel?: boolean
  /** Extra class name */
  className?: string
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ showLabel = false, className = '' }) => {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">
          {isDark ? (
            <i className="fa-solid fa-moon" />
          ) : (
            <i className="fa-solid fa-sun" />
          )}
        </span>
      </span>
      {showLabel && (
        <span className="theme-toggle-label">{isDark ? 'Dark' : 'Light'}</span>
      )}
    </button>
  )
}

export default ThemeToggle
