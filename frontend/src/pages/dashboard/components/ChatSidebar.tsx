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
            ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
