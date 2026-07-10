import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import './ChatLayout.css'

const NEAR_BOTTOM_THRESHOLD = 120

export interface MessagesAreaRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

export interface MessagesAreaProps {
  /** Called when user scrolls near bottom or away from bottom. */
  onNearBottomChange?: (nearBottom: boolean) => void
  children: React.ReactNode
}

const MessagesArea = forwardRef<MessagesAreaRef, MessagesAreaProps>(function MessagesArea(
  { onNearBottomChange, children },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevNearRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = React.useState(false)

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance < NEAR_BOTTOM_THRESHOLD
  }, [])

  const handleScroll = useCallback(() => {
    const near = checkNearBottom()
    if (prevNearRef.current !== near) {
      prevNearRef.current = near
      onNearBottomChange?.(near)
    }
    setShowScrollButton(!near)
  }, [checkNearBottom, onNearBottomChange])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
      setShowScrollButton(false)
      onNearBottomChange?.(true)
    },
    [onNearBottomChange]
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
    }),
    [scrollToBottom]
  )

  const handleScrollToBottomClick = () => scrollToBottom('smooth')

  return (
    <div className="messages-area" ref={scrollRef} onScroll={handleScroll}>
      <div className="messages-area__inner">
        {children}
        <div ref={bottomRef} className="messages-area__anchor" aria-hidden />
      </div>
      {showScrollButton && (
        <button
          type="button"
          className="messages-area__scroll-to-bottom"
          onClick={handleScrollToBottomClick}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
        >
          <i className="fa-solid fa-arrow-down messages-area__scroll-icon" />
        </button>
      )}
    </div>
  )
})

export default MessagesArea
