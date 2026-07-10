import type { ChatHistory } from '../types'

/** Chat type icons (SVG inline for performance) */
const CHAT_TYPE_ICONS: Record<string, React.ReactNode> = {
  pentest: <i className="fa-solid fa-shield-halved" />,
  qa: <i className="fa-solid fa-circle-question" />,
  general: <i className="fa-solid fa-comment" />,
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
