import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import CodeBlock from './CodeBlock'
import './MarkdownMessage.css'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

function getCodeText(children: React.ReactNode): string {
  if (typeof children === 'string') return children.replace(/\n$/, '')
  if (Array.isArray(children)) return children.map(getCodeText).join('')
  if (children != null && typeof children === 'object' && 'props' in (children as any)) {
    const props = (children as any).props
    if (props?.children != null) return getCodeText(props.children)
  }
  return String(children ?? '').replace(/\n$/, '')
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, isStreaming }) => {
  return (
    <div className="markdown-content-wrapper">
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '')
              const language = match ? match[1] : ''
              const codeText = getCodeText(children)

              if (!inline && (language || codeText)) {
                return (
                  <CodeBlock language={language} className="markdown-code-block">
                    {codeText}
                  </CodeBlock>
                )
              }
              return (
                <code className="markdown-inline-code" {...props}>
                  {children}
                </code>
              )
            },
            p({ children }) {
              return <p className="markdown-paragraph">{children}</p>
            },
            h1({ children }) {
              return <h1 className="markdown-heading markdown-h1">{children}</h1>
            },
            h2({ children }) {
              return <h2 className="markdown-heading markdown-h2">{children}</h2>
            },
            h3({ children }) {
              return <h3 className="markdown-heading markdown-h3">{children}</h3>
            },
            h4({ children }) {
              return <h4 className="markdown-heading markdown-h4">{children}</h4>
            },
            ul({ children }) {
              return <ul className="markdown-list markdown-ul">{children}</ul>
            },
            ol({ children }) {
              return <ol className="markdown-list markdown-ol">{children}</ol>
            },
            li({ children }) {
              return <li className="markdown-list-item">{children}</li>
            },
            blockquote({ children }) {
              return <blockquote className="markdown-blockquote">{children}</blockquote>
            },
            a({ href, children }) {
              return (
                <a href={href} className="markdown-link" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              )
            },
            table({ children }) {
              return <table className="markdown-table">{children}</table>
            },
            thead({ children }) {
              return <thead className="markdown-thead">{children}</thead>
            },
            tbody({ children }) {
              return <tbody className="markdown-tbody">{children}</tbody>
            },
            tr({ children }) {
              return <tr className="markdown-tr">{children}</tr>
            },
            th({ children }) {
              return <th className="markdown-th">{children}</th>
            },
            td({ children }) {
              return <td className="markdown-td">{children}</td>
            },
            hr() {
              return <hr className="markdown-hr" />
            },
            strong({ children }) {
              return <strong className="markdown-strong">{children}</strong>
            },
            em({ children }) {
              return <em className="markdown-em">{children}</em>
            },
            del({ children }) {
              return <del className="markdown-del">{children}</del>
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {isStreaming && (
        <span className="streaming-cursor markdown-cursor">▊</span>
      )}
    </div>
  )
}

export default MarkdownMessage
