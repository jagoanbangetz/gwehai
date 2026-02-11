import { useState, useRef, useEffect } from 'react'
import './Chat.css'
import { gwehaiClient, GwehAIEvent } from '../utils/gwehaiApi'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m GwehAI, your AI cybersecurity pentester assistant. I can help you with exploit recognition, vulnerability analysis, security testing strategies, and generate professional pentest reports. How can I assist you today?',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamStatus, setStreamStatus] = useState<string>('')
  const [toolLogs, setToolLogs] = useState<string[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const streamingIndexRef = useRef<number | null>(null)
  const sendInProgressRef = useRef(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const user = localStorage.getItem('scout_user')
    if (!user) {
      setIsAuthenticated(false)
      return
    }
    try {
      const parsed = JSON.parse(user)
      setIsAuthenticated(Boolean(parsed?.token || parsed?.access_token))
    } catch {
      setIsAuthenticated(false)
    }
  }, [])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    if (sendInProgressRef.current) return
    sendInProgressRef.current = true
    if (!isAuthenticated) {
      sendInProgressRef.current = false
      const errorMessage: Message = {
        id: `auth-${Date.now()}`,
        role: 'assistant',
        content: 'Please login first to start a secure chat session.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamStatus('Connecting...')
    setToolLogs([])

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    try {
      const jobResponse = await gwehaiClient.startScan(input, false)
      const jobId = jobResponse.job_id

      const es = gwehaiClient.connectToEvents(
        jobId,
        (event: GwehAIEvent) => {
          handleStreamEvent(event)
        },
        () => {
          sendInProgressRef.current = false
          setIsLoading(false)
          setStreamStatus('Connection lost')
        }
      )

      eventSourceRef.current = es
    } catch (error) {
      console.error('Chat error:', error)
      sendInProgressRef.current = false
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again or check your connection.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      if (!eventSourceRef.current) {
        sendInProgressRef.current = false
        setIsLoading(false)
        setStreamStatus('')
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleStreamEvent = (event: GwehAIEvent) => {
    switch (event.type) {
      case 'status': {
        const status = event.data.message || event.data.status || ''
        setStreamStatus(String(status))
        return
      }
      case 'reasoning': {
        const reasoning = event.data?.message || 'Reasoning...'
        setStreamStatus(reasoning)
        setToolLogs(prev => [...prev.slice(-19), reasoning])
        return
      }
      case 'tool_start': {
        const name = event.data.name || event.data.tool || 'tool'
        setToolLogs(prev => [...prev, `Started ${name}`])
        return
      }
      case 'tool_log': {
        const log = event.data.text || event.data.log || ''
        if (log) {
          setToolLogs(prev => [...prev, String(log)])
        }
        return
      }
      case 'tool_end': {
        const name = event.data.name || event.data.tool || 'tool'
        setToolLogs(prev => [...prev, `Finished ${name}`])
        return
      }
      case 'message_delta':
      case 'content': {
        const chunk = String(
          event.data.delta || event.data.chunk || event.data.content || event.data.text || ''
        )
        if (!chunk) return
        setMessages(prev => {
          const updated = [...prev]
          if (streamingIndexRef.current === null) {
            updated.push({
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: chunk,
              timestamp: new Date()
            })
            streamingIndexRef.current = updated.length - 1
          } else {
            const idx = streamingIndexRef.current
            const existing = updated[idx]
            updated[idx] = {
              ...existing,
              content: `${existing.content}${chunk}`
            }
          }
          return updated
        })
        return
      }
      case 'message_done':
      case 'content_done': {
        streamingIndexRef.current = null
        return
      }
      case 'done': {
        sendInProgressRef.current = false
        setIsLoading(false)
        setStreamStatus('')
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }
      case 'error': {
        sendInProgressRef.current = false
        setIsLoading(false)
        setStreamStatus('Error')
        const errorText = String(event.data.message || event.data.error || 'Stream error')
        setMessages(prev => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `❌ ${errorText}`,
            timestamp: new Date()
          }
        ])
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }
      default:
        return
    }
  }

  return (
    <section id="chat" className="chat-section">
      <div className="chat-container">
        <div className="chat-window">
          <div className="chat-status-bar">
            <div className={`chat-status-dot ${isLoading ? 'active' : ''}`} />
            <span className="chat-status-text">
              {streamStatus || (isLoading ? 'Streaming...' : 'Idle')}
            </span>
          </div>
          {!isAuthenticated && (
            <div className="chat-auth-banner">
              Login required to use live chat and streaming.
            </div>
          )}
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                <div className="message-avatar">
                  {message.role === 'user' ? 'YOU' : 'AI'}
                </div>
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                  <div className="message-time">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message assistant">
                <div className="message-avatar">[AI]</div>
                <div className="message-content">
                  <div className="message-text">
                    <span className="typing-indicator">
                      <span></span><span></span><span></span>
                    </span>
                  </div>
                </div>
              </div>
            )}
            {toolLogs.length > 0 && (
              <div className="tool-log-panel">
                <div className="tool-log-title">Tool output</div>
                <div className="tool-log-list">
                  {toolLogs.map((log, idx) => (
                    <div key={idx} className="tool-log-line">{log}</div>
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask GwehAI about security vulnerabilities, exploits, or pentesting..."
              rows={2}
              disabled={isLoading}
            />
            <button
              className="chat-send-button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? '...' : '>'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Chat
