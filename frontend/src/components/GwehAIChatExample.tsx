/**
 * Example component using the useGwehai hook
 * This demonstrates the integration pattern from the guide
 */

import React, { useState, useRef, useEffect } from 'react';
import { useGwehai } from '../hooks/useGwehai';

export function GwehAIChatExample() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const { jobId, status, events, error, startChat, stopJob, continueJob, reset } = useGwehai();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Process events and update messages
  useEffect(() => {
    events.forEach((event) => {
      if (event.type === 'content') {
        // Append content chunks to last assistant message
        const chunk = event.data.chunk || event.data.choices?.[0]?.delta?.content;
        if (chunk) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            return [...prev, { role: 'assistant', content: chunk }];
          });
        }
      } else if (event.type === 'thinking') {
        // Show thinking indicator
        console.log('💭 Thinking:', event.data.message);
      } else if (event.type === 'tool') {
        // Show tool execution
        console.log('🔧 Tool:', event.data.tool, event.data.args);
      } else if (event.type === 'done') {
        // Job completed
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + '\n\n✅ Completed' }];
          }
          return prev;
        });
      }
    });
  }, [events]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === 'running') return;

    const userMessage = message;
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setMessage('');

    try {
      await startChat(userMessage);
      // Add empty assistant message for streaming
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    } catch (err) {
      console.error('Error starting chat:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error || 'Failed to start chat'}` },
      ]);
    }
  };

  const handleReset = () => {
    reset();
    setMessages([]);
    setMessage('');
  };

  return (
    <div className="gwehai-chat-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div className="chat-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>GwehAI Chat (Hook Example)</h2>
        <div className="status" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={`status-badge status-${status}`} style={{
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold',
            backgroundColor: status === 'running' ? '#4CAF50' : status === 'completed' ? '#2196F3' : status === 'failed' ? '#f44336' : '#9E9E9E',
            color: 'white'
          }}>
            {status}
          </span>
          {jobId && <span className="job-id" style={{ fontSize: '12px', color: '#666' }}>{jobId.slice(0, 8)}...</span>}
        </div>
        <div className="actions" style={{ display: 'flex', gap: '8px' }}>
          {status === 'running' && (
            <button onClick={stopJob} className="btn-stop" style={{
              padding: '6px 12px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Stop
            </button>
          )}
          {status === 'stopped' && (
            <button onClick={continueJob} className="btn-continue" style={{
              padding: '6px 12px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Continue
            </button>
          )}
          {(status === 'completed' || status === 'failed') && (
            <button onClick={handleReset} style={{
              padding: '6px 12px',
              backgroundColor: '#9E9E9E',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{
          padding: '12px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          ⚠️ Error: {error}
        </div>
      )}

      <div className="messages-container" style={{
        height: '400px',
        overflowY: 'auto',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '20px',
        backgroundColor: '#f9f9f9'
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            Start a conversation with GwehAI
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`} style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#fff',
              borderLeft: `4px solid ${msg.role === 'user' ? '#2196F3' : '#4CAF50'}`
            }}>
              <div className="message-role" style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '12px', color: '#666' }}>
                {msg.role === 'user' ? 'You' : 'GwehAI'}
              </div>
              <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content || (status === 'running' && idx === messages.length - 1 ? 'Thinking...' : '')}
              </div>
            </div>
          ))
        )}
        {status === 'running' && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '' && (
          <div className="message message-assistant" style={{
            marginBottom: '16px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: '#fff',
            borderLeft: '4px solid #4CAF50'
          }}>
            <div className="message-role" style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '12px', color: '#666' }}>
              GwehAI
            </div>
            <div className="message-content typing" style={{ color: '#999' }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input" style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask a question or start a pentest (e.g., 'pentest https://example.com')..."
          disabled={status === 'running'}
          className="input-field"
          style={{
            flex: 1,
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        <button
          type="submit"
          disabled={status === 'running' || !message.trim()}
          className="btn-send"
          style={{
            padding: '12px 24px',
            backgroundColor: status === 'running' ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: status === 'running' ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          Send
        </button>
      </form>

      {/* Event log (optional, for debugging) */}
      {import.meta.env.DEV && events.length > 0 && (
        <details className="event-log" style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            Event Log ({events.length} events)
          </summary>
          <pre style={{ marginTop: '12px', fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
            {JSON.stringify(events, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
