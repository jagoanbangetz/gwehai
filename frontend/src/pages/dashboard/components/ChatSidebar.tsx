import type { ChatHistory } from '../types'

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
            {filteredChatHistory.map((chat) => (
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
                      <span className="chat-title">{chat.title}</span>
                    )}
                    <div className="chat-menu-container">
                      <button
                        className="chat-menu-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleMenu(openMenuId === chat.id ? null : chat.id)
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                        </svg>
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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Rename
                          </button>
                          <button
                            className="chat-menu-item delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteChat(chat.id)
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            Delete chat
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="chat-icon-wrapper collapsed">
                    <svg className="chat-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
