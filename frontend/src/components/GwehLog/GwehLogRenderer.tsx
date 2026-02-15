import { useCallback, useEffect, useMemo, useRef } from 'react'
import { groupEventsByPhase } from './GwehLogFormatter'
import type { LogEvent } from './GwehLog.types'
import { LOG_PHASE_HEADER } from './GwehLog.types'
import type { LogBlock } from './GwehLogFormatter'
import './GwehLogRenderer.css'

/** Configurable terminal size (CSS value). */
export type GwehLogSize = string | number

export interface GwehLogRendererProps {
  /** List or stream of events (append new events for streaming). */
  events: LogEvent[]
  /** Compact mode: smaller padding and line-height. */
  compact?: boolean
  /** Enable copy-to-clipboard per block. */
  copyableBlocks?: boolean
  /** Optional class name for the container. */
  className?: string
  /**
   * Terminal max-width (default: 820px).
   * Container does not grow beyond this; content wraps.
   */
  maxWidth?: GwehLogSize
  /**
   * Terminal height – fixed so container does NOT shrink/grow with content.
   * Default: clamp(260px, 45vh, 520px).
   */
  height?: GwehLogSize
  /**
   * When true (default), keep scroll pinned to bottom as new events stream in.
   * When user scrolls up, auto-scroll is paused until they scroll back to bottom.
   */
  autoScroll?: boolean
}

function BlockContent({ block, copyable }: { block: LogBlock; copyable: boolean }) {
  const text = useMemo(() => {
    const header = LOG_PHASE_HEADER[block.phase]
    const lines = block.events.map((e) => `→ ${e.message}`)
    return [header, ...lines].join('\n')
  }, [block])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [text])

  return (
    <div className="gweh-log-block">
      <div className="gweh-log-block-header">
        <span className="gweh-log-block-title">{LOG_PHASE_HEADER[block.phase]}</span>
        {copyable && (
          <button
            type="button"
            className="gweh-log-block-copy"
            onClick={handleCopy}
            title="Copy block"
            aria-label="Copy block"
          >
            Copy
          </button>
        )}
      </div>
      <div className="gweh-log-block-body">
        {block.events.map((event) => (
          <div key={event.id} className="gweh-log-line gweh-log-line-enter">
            → {event.message}
          </div>
        ))}
      </div>
    </div>
  )
}

const DEFAULT_MAX_WIDTH = '820px'
const DEFAULT_HEIGHT = 'clamp(260px, 45vh, 520px)'

function toCssSize(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

export function GwehLogRenderer({
  events,
  compact = false,
  copyableBlocks = false,
  className = '',
  maxWidth = DEFAULT_MAX_WIDTH,
  height = DEFAULT_HEIGHT,
  autoScroll = true,
}: GwehLogRendererProps) {
  const blocks = useMemo(() => groupEventsByPhase(events), [events])
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const prevEventCountRef = useRef(0)

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    const el = scrollRef.current
    const newContent = events.length > prevEventCountRef.current
    prevEventCountRef.current = events.length
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 2
    if (newContent && (!userScrolledUpRef.current || atBottom)) {
      el.scrollTop = el.scrollHeight
      userScrolledUpRef.current = false
    }
  }, [autoScroll, events.length, blocks])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !autoScroll) return
    const el = scrollRef.current
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 2
    userScrolledUpRef.current = !atBottom
  }, [autoScroll])

  const containerStyle = useMemo(
    () => ({
      maxWidth: toCssSize(maxWidth),
      height: toCssSize(height),
    }),
    [maxWidth, height]
  )

  return (
    <div
      className={`gweh-log ${compact ? 'gweh-log--compact' : ''} ${className}`.trim()}
      style={containerStyle}
      role="log"
      aria-label="GWEHAI log"
    >
      <div
        ref={scrollRef}
        className="gweh-log-scroll"
        onScroll={handleScroll}
      >
        {blocks.length === 0 ? (
          <div className="gweh-log-empty">No events yet.</div>
        ) : (
          blocks.map((block) => (
            <BlockContent
              key={block.phase}
              block={block}
              copyable={copyableBlocks}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default GwehLogRenderer
