/**
 * GwehLog demo – simulates streaming events to produce the exact sample format.
 * Verifies:
 * - Output matches the spec (headings, arrow bullets, spacing)
 * - Long URLs/messages wrap inside the terminal without changing container size
 * - Internal scrolling when content exceeds height
 *
 * Sample format:
 * [GWEHAI ▸ THINKING]
 * → Building execution plan
 *
 * [GWEHAI ▸ EXECUTION]
 * → Querying memory database
 * → Target: testaspnet.vulnweb.com
 *
 * [GWEHAI ▸ MODULE LOADER]
 * → Skill Loaded: CORE_ORCHESTRATOR
 * → Checklist Loaded: WEB_CHECKLIST
 *
 * [GWEHAI ▸ REASONING]
 * → Adjusting attack flow
 */

import { useEffect, useState } from 'react'
import { GwehLogRenderer } from './GwehLogRenderer'
import { emitTarget, emitSkill, emitChecklist } from './GwehLogFormatter'
import type { LogEvent } from './GwehLog.types'

const DEMO_EVENTS: LogEvent[] = [
  { id: '1', phase: 'THINKING', message: 'Building execution plan' },
  { id: '2', phase: 'EXECUTION', message: 'Querying memory database' },
  { id: '3', phase: 'EXECUTION', message: emitTarget('testaspnet.vulnweb.com') },
  {
    id: '3b',
    phase: 'EXECUTION',
    message:
      'Fetching https://testaspnet.vulnweb.com/rest/api/2/search?jql=project%3D%22My%20Project%22%20AND%20status%3Dopen&maxResults=100',
  },
  { id: '4', phase: 'MODULE_LOADER', message: emitSkill('CORE_ORCHESTRATOR') },
  { id: '5', phase: 'MODULE_LOADER', message: emitChecklist('WEB_CHECKLIST') },
  { id: '6', phase: 'REASONING', message: 'Adjusting attack flow' },
]

const STREAM_DELAY_MS = 400

export function GwehLogDemo() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [streaming, setStreaming] = useState(false)

  const runStream = () => {
    setEvents([])
    setStreaming(true)
  }

  useEffect(() => {
    if (!streaming) return
    if (events.length >= DEMO_EVENTS.length) {
      setStreaming(false)
      return
    }
    const timer = setTimeout(() => {
      const next = DEMO_EVENTS[events.length]
      setEvents((prev) => [...prev, next])
    }, STREAM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [streaming, events.length])

  const showFull = () => {
    setEvents([...DEMO_EVENTS])
    setStreaming(false)
  }

  const clear = () => {
    setEvents([])
    setStreaming(false)
  }

  return (
    <div className="gweh-log-demo" style={{ padding: '16px', maxWidth: '900px' }}>
      <div
        className="gweh-log-demo-toolbar"
        style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}
      >
        <button
          type="button"
          onClick={runStream}
          disabled={streaming}
          style={{ padding: '6px 12px', cursor: streaming ? 'not-allowed' : 'pointer' }}
        >
          {streaming ? 'Streaming…' : 'Simulate stream'}
        </button>
        <button
          type="button"
          onClick={showFull}
          disabled={streaming}
          style={{ padding: '6px 12px', cursor: streaming ? 'not-allowed' : 'pointer' }}
        >
          Show full
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={streaming}
          style={{ padding: '6px 12px', cursor: streaming ? 'not-allowed' : 'pointer' }}
        >
          Clear
        </button>
      </div>
      <GwehLogRenderer
        events={events}
        compact={false}
        copyableBlocks
        maxWidth={820}
        height="clamp(260px, 45vh, 520px)"
        autoScroll
        className="gweh-log-demo-renderer"
      />
    </div>
  )
}

export default GwehLogDemo
