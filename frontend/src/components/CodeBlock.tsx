import React, { useState, useCallback } from 'react'
import './CodeBlock.css'

export interface CodeBlockProps {
  /** Language label (e.g. "js", "python") from fenced code block */
  language?: string
  /** Raw code text (no backticks) */
  children: string
  className?: string
}

const COPIED_DURATION_MS = 1500

/**
 * Copy text to clipboard with fallback for older browsers / non-HTTPS.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to fallback
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    const ok = document.execCommand('copy')
    return ok
  } finally {
    document.body.removeChild(textarea)
  }
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language = '', children, className = '' }) => {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const langLabel = language.trim() || 'code'

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(code)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_DURATION_MS)
    }
  }, [code])

  return (
    <div className={`code-block ${className}`.trim()}>
      <div className="code-block__header">
        <span className="code-block__lang" aria-hidden>
          {langLabel}
        </span>
        <button
          type="button"
          className={`code-block__copy ${copied ? 'copied' : ''}`.trim()}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-block__pre">
        <code className="code-block__code">{code}</code>
      </pre>
    </div>
  )
}

export default CodeBlock
