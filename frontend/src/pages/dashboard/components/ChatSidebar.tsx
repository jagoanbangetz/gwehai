import type { ChatHistory } from '../types'

/** Chat type icons (SVG inline for performance) */
const CHAT_TYPE_ICONS: Record<string, React.ReactNode> = {
  pentest: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1L2 4V8C2 11.3 4.6 14.3 8 15C11.4 14.3 14 11.3 14 8V4L8 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6 8L7.5 9.5L10 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  qa: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 6.5C6 5.67 6.9 5 8 5C9.1 5 10 5.67 10 6.5C10 7.33 9.1 8 8 8V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="8" cy="10.5" r="0.6" fill="currentColor"/>
    </svg>
  ),
  general: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 3H13V10H7L3 13V3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
}

/** Badge label per chat type */
const CHAT_TYPE_LABELS: Record<string, string> = {
  pentest: 'Pentest',
  qa: 'Q&A',
  general: 'Chat',
}

interface Props {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  isMobile: boolean
  chatsSectionCollapsed: boolean
  filteredChatHistory: ChatHistory[]
  currentChatId: string | null
  editingChatId: string | null
  editTitle: string
  openMenuId: string | null
  onToggleChatsSection: () => void
  onLoadChat: (chatId: string) => void
  onStartRename: (chatId: string) => void
  onSaveRename: (chatId: string, e?: React.KeyboardEvent) => void
  onCancelRename: () => void
  onDeleteChat: (chatId: string) => void
  onEditTitleChange: (title: string) => void
  onToggleMenu: (chatId: string | null) => void
}

export default function ChatSidebar({
  sidebarOpen,
  sidebarCollapsed,
  isMobile,
  chatsSectionCollapsed,
  filteredChatHistory,
  currentChatId,
  editingChatId,
  editTitle,
  openMenuId,
  onToggleChatsSection,
  onLoadChat,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDeleteChat,
  onEditTitleChange,
  onToggleMenu,
}: Props) {
  return (
    <>
      {/* Hide "YOUR CHATS" and list when sidebar is collapsed (desktop 72px) */}
      {(!sidebarCollapsed || isMobile) && (
        <>
          <div className="sidebar-divider" />
          <div className={`sidebar-chats-section ${chatsSectionCollapsed ? 'sidebar-chats-section--collapsed' : ''}`}>
            <button
              type="button"
              className="sidebar-section-header"
              onClick={onToggleChatsSection}
              aria-expanded={!chatsSectionCollapsed}
              aria-label={chatsSectionCollapsed ? 'Expand chat list' : 'Collapse chat list'}
              title={chatsSectionCollapsed ? 'Expand chat list' : 'Collapse chat list'}
            >
              <span className="section-title">YOUR CHATS</span>
              <span className="section-chevron" aria-hidden>▼</span>
            </button>
            <div className="chat-history-list">
            {filteredChatHistory.map((chat) => {
              const chatType = chat.chatType || 'general'
              const icon = CHAT_TYPE_ICONS[chatType] || CHAT_TYPE_ICONS.general
              const label = CHAT_TYPE_LABELS[chatType] || 'Chat'
              return (
                <div
                  key={chat.id}
                  className={`chat-history-item ${currentChatId === chat.id ? 'active' : ''}`}
                  onClick={() => {
                    if (editingChatId !== chat.id) {
                      onLoadChat(chat.id)
                    }
                  }}
                >
                  {sidebarOpen ? (
                    <>
                      <div className="chat-item-icon" title={label}>
                        {icon}
                      </div>
                      <div className="chat-item-content">
                        {editingChatId === chat.id ? (
                          <input
                            type="text"
                            className="chat-title-input"
                            value={editTitle}
                            onChange={(e) => onEditTitleChange(e.target.value)}
                            onBlur={() => onSaveRename(chat.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onSaveRename(chat.id, e)
                              } else if (e.key === 'Escape') {
                                onCancelRename()
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className="chat-title">{chat.title}</span>
                            {chat.summary && (
                              <span className="chat-summary">{chat.summary}</span>
                            )}
                          </>
                        )}
                        <span className={`chat-type-badge chat-type-badge--${chatType}`}>
                          {label}
                        </span>
                      </div>
                      <div className="chat-menu-container">
                        <button
                          className="chat-menu-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleMenu(openMenuId === chat.id ? null : chat.id)
                          }}
                        >
                          ...
                        </button>
                        {openMenuId === chat.id && (
                          <div className="chat-menu-dropdown">
                            <button
                              className="chat-menu-item"
                              onClick={(e) => {
                                e.stopPropagation()
                                onStartRename(chat.id)
                              }}
                            >
                              Rename
                            </button>
                            <button
                              className="chat-menu-item delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteChat(chat.id)
                              }}
                            >
                              Delete chat
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="chat-icon-wrapper collapsed" />
                  )}
                </div>
              )
            })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
