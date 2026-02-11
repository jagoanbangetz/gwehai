import { useState, useRef, useEffect } from 'react'
import './CustomSelect.css'

interface Option {
  value: string
  label: string
  icon?: React.ReactNode
  tag?: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
}

const CustomSelect = ({ value, onChange, options, placeholder = 'Select an option', className = '' }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const selectRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value)
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector(`[data-value="${value}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [isOpen, value])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setHighlightedIndex(-1)
    setSearchQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (isOpen) {
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (isOpen && highlightedIndex >= 0 && e.key === 'Enter') {
      handleSelect(filteredOptions[highlightedIndex].value)
    }
  }

  return (
    <div 
      className={`custom-select ${className} ${isOpen ? 'open' : ''}`}
      ref={selectRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div 
        className="custom-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="custom-select-trigger-content">
          {selectedOption?.icon && (
            <span className="custom-select-trigger-icon">{selectedOption.icon}</span>
          )}
          <span className={`custom-select-value ${!selectedOption ? 'placeholder' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.tag && (
            <span className="custom-select-trigger-tag">{selectedOption.tag}</span>
          )}
        </div>
        <svg 
          className={`custom-select-arrow ${isOpen ? 'open' : ''}`}
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {isOpen && (
        <div className="custom-select-dropdown" ref={dropdownRef}>
          <div className="custom-select-search">
            <input
              className="custom-select-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setHighlightedIndex(0)
              }}
              placeholder="Search..."
              autoFocus
            />
          </div>
          {filteredOptions.map((option, index) => (
            <div
              key={option.value}
              className={`custom-select-option ${
                option.value === value ? 'selected' : ''
              } ${
                index === highlightedIndex ? 'highlighted' : ''
              }`}
              data-value={option.value}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="custom-select-option-content">
                {option.icon && (
                  <span className="custom-select-option-icon">{option.icon}</span>
                )}
                <span className="custom-select-option-label">{option.label}</span>
                {option.tag && (
                  <span className="custom-select-option-tag">{option.tag}</span>
                )}
              </div>
              {option.value === value && (
                <svg 
                  className="custom-select-checkmark"
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CustomSelect
