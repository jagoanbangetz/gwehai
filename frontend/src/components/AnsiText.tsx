import React from 'react'

/**
 * Lightweight ANSI escape code → HTML renderer.
 * Supports: standard colors (30-37), bright colors (90-97), bold (1), dim (2), underline (4), reset (0), and RGB (38;2;r;g;b).
 * Everything else is stripped.
 */

const ANSI_COLORS: Record<string, string> = {
  '30': '#4d4d4d', // black (bright enough to see on dark bg)
  '31': '#f85149', // red
  '32': '#3fb950', // green
  '33': '#d29922', // yellow
  '34': '#58a6ff', // blue
  '35': '#bc8cff', // magenta
  '36': '#39d2c0', // cyan
  '37': '#e6edf3', // white
  '90': '#6e7681', // bright black (grey)
  '91': '#ff7b72', // bright red
  '92': '#56d364', // bright green
  '93': '#e3b341', // bright yellow
  '94': '#79c0ff', // bright blue
  '95': '#d2a8ff', // bright magenta
  '96': '#56d4dd', // bright cyan
  '97': '#ffffff', // bright white
}

// Regex that matches ANSI escape sequences
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[([0-9;]*)m/g

interface AnsiSegment {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  let currentColor: string | undefined
  let currentBold = false
  let currentDim = false
  let currentUnderline = false
  let lastIndex = 0

  let match: RegExpExecArray | null
  // Reset regex state
  ANSI_RE.lastIndex = 0

  while ((match = ANSI_RE.exec(input)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        color: currentColor,
        bold: currentBold,
        dim: currentDim,
        underline: currentUnderline,
      })
    }

    // Parse the codes
    const codes = match[1].split(';')
    let i = 0
    while (i < codes.length) {
      const code = codes[i]
      if (code === '0' || code === '') {
        // Reset
        currentColor = undefined
        currentBold = false
        currentDim = false
        currentUnderline = false
      } else if (code === '1') {
        currentBold = true
      } else if (code === '2') {
        currentDim = true
      } else if (code === '4') {
        currentUnderline = true
      } else if (code === '22') {
        currentBold = false
        currentDim = false
      } else if (code === '24') {
        currentUnderline = false
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code]
      } else if (code === '38' && codes[i + 1] === '2' && codes[i + 4] !== undefined) {
        // 38;2;r;g;b — true color
        const r = parseInt(codes[i + 2], 10)
        const g = parseInt(codes[i + 3], 10)
        const b = parseInt(codes[i + 4], 10)
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          currentColor = `rgb(${r},${g},${b})`
        }
        i += 4
      } else if (code === '39') {
        currentColor = undefined // default foreground
      }
      i++
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < input.length) {
    segments.push({
      text: input.slice(lastIndex),
      color: currentColor,
      bold: currentBold,
      dim: currentDim,
      underline: currentUnderline,
    })
  }

  return segments
}

interface AnsiTextProps {
  text: string
  className?: string
}

const AnsiText: React.FC<AnsiTextProps> = ({ text, className }) => {
  const segments = parseAnsi(text)

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        const style: React.CSSProperties = {}
        if (seg.color) style.color = seg.color
        if (seg.bold) style.fontWeight = 700
        if (seg.dim) style.opacity = 0.6
        if (seg.underline) style.textDecoration = 'underline'

        if (Object.keys(style).length === 0) {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>
        }
        return (
          <span key={i} style={style}>
            {seg.text}
          </span>
        )
      })}
    </span>
  )
}

export default AnsiText
