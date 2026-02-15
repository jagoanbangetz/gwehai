# Flow: User Message → Job → Conversation

This doc explains what happens when the user sends a message, when jobs run, when scanning completes, and **why the spawn agent creates another conversation** — and where the bug is.

---

## 1. When the user sends a message (Agent chat / Dashboard)

**Frontend (Dashboard)**

1. User types and sends → `handleSendWithText()`.
2. `isNewChat = !currentChatId` (true when no chat is selected).
3. User message and a “thinking” assistant message are added to local `messages`.
4. **Request**: `gwehaiClient.startScan(messageToSend, false, currentConversationId || undefined)`  
   - **New chat**: `currentConversationId` is null → body has **no** `conversation_id`.  
   - **Existing chat**: body includes `conversation_id: currentConversationId`.
5. Response: `{ job_id, conversation_id?, ... }`.

**Backend (GwehAIService)**

1. `POST /api/gwehai/chat` → `startChat(userId, payload)`.
2. `conversationId = payload.conversation_id` → **undefined** for new chat.
3. A **job** is created in memory (`LocalAIJob`) with `jobId`, no `conversationId` yet.
4. **Response is sent immediately**: `{ job_id, stream_id: jobId, conversation_id: undefined, ... }`.  
   So the API **never** returns the new conversation id, because it does not exist yet.
5. `runAgentInBackground(jobId, userId, message, conversationId)` is started in the background.

**Why the spawn agent “makes another conversation”**

1. In `runAgentInBackground`, the backend calls  
   `chatService.processMessageWithTools(userId, message, conversationId, jobId, pushEvent, ...)`.
2. In `processMessageWithTools` → `getOrCreateConversation(userId, conversationId)`:
   - If `conversationId` is **undefined** (new chat): **a new conversation is created** in the DB.
   - If `conversationId` is set: that conversation is loaded and reused.
3. So for the **first message in a new chat**, the **agent** (this background run) is what creates the **one** conversation. There is no “extra” conversation from the backend; there is exactly one. The confusion is on the frontend: it never receives that id in the initial response, and it does not fully sync when it gets it later (see below).

---

## 2. When the job is running

**Backend**

1. `processMessageWithTools` runs: creates/loads conversation, adds user + assistant messages, spends points, runs the LLM with tools.
2. During the run it calls `pushEvent(...)` for: `status`, `reasoning_block`, `tool_start`, `tool_log`, `tool_end`, `message_delta`, `message_done`, and finally `done`.
3. These events are stored on the in-memory job (`job.events`).
4. When the run finishes (success or error), it pushes:  
   `push({ type: 'done', data: { job_id, conversation_id: cid } })`  
   where `cid` is the **real** conversation id (the one created or reused).

**Frontend**

1. After `startScan` returns, the client opens the stream: `gwehaiClient.connectToEvents(jobId, handleStreamEvent, ...)`.
2. `handleStreamEvent(event)` handles each event: updates `currentStep`, `activityLog`, message content, tool state, etc.
3. Messages and “Recent steps” update in real time from these events.

So **while the job is running**, the UI is driven by the stream; the backend has already created (or reused) the conversation, but the frontend only gets `conversation_id` when the **done** event is received.

---

## 3. When scanning completes (“done”)

**Backend**

1. `processMessageWithTools` finishes and pushes `done` with `conversation_id: cid`.
2. In `GwehAIService.runAgentInBackground`, `job.conversationId = result.conversationId` is set; the same id is in the `done` event.

**Frontend (Dashboard) – current behavior**

1. `handleStreamEvent` → `case 'done'`:
   - Sets `currentConversationId(event.data.conversation_id)`.
   - Updates `conversationRunStatus` for that id.
   - Calls `refetchChatHistory()`.
   - Does **not** call `setCurrentChatId(...)`.

2. **Bug**: For a **new chat**, the frontend had already run a `useEffect` that saw `messages.length > 0 && !currentChatId` and created a **local** chat with `id = Date.now().toString()` and set `currentChatId` to that local id. So at this point:
   - `currentChatId` = local id (e.g. timestamp).
   - `currentConversationId` = real DB conversation id from `done`.
   - `refetchChatHistory()` **replaces** `chatHistory` with the list from the API (which contains the real conversation, not the local id).
   - So `currentChatId` no longer exists in `chatHistory` → the “current” chat is effectively **unselected** or wrong → user sees “another” conversation in the sidebar (the real one) and the one they were in (local id) is gone. That’s why it feels like “the spawn agent made another conversation”: the agent created the **correct** one; the frontend created a **second** (local) identity for the same chat and then dropped it when refetching, so the selection and list get out of sync.

**Fix**

In the `done` handler, when `event.data.conversation_id` is present, also set the current chat to that conversation:

- `setCurrentChatId(event.data.conversation_id)`  
so the active view is the same as the conversation the agent used. Then `refetchChatHistory()` will show that conversation in the sidebar and it will remain selected.

---

## 4. Pentest job flow (different from Agent chat)

**Pentest jobs** do **not** create a conversation inside the agent:

1. User creates a job (e.g. PentestRunner) → `POST /pentest-jobs` → `PentestJobsService.create()`.
2. Inside `create()`, **right after** creating the job, the backend calls `createConversation(userId, jobId)`:
   - If the job does not already have a `conversationId`, it calls `chatService.createConversationWithSeed(...)`, which creates **one** conversation and links it to the job (`conversation.pentestJobId`, `job.conversationId`).
3. Then `runFullAgentInBackground(userId, jobId)` is started. It uses **that** conversation:  
   `processMessageWithTools(userId, seedPrompt, job.conversationId, jobId, push)`.

So for pentest: **one job → one conversation created up front**; the agent only **uses** that conversation. No “spawn agent creates another conversation” in this path; the extra-conversation issue is only in the **Agent chat (Dashboard)** flow above.

---

## 5. Summary

| Step                    | Agent chat (Dashboard)                    | Pentest job                          |
|-------------------------|--------------------------------------------|--------------------------------------|
| User sends / starts     | `startScan(msg, false, conversationId?)`   | Create job → create conversation    |
| Conversation created    | **In agent**: `getOrCreateConversation(undefined)` when no `conversation_id` | **Before agent**: `createConversation()` in `create()` |
| When conversation id known | Only in **done** event                     | In create response / job             |
| Bug                     | Frontend never sets `currentChatId` from `done.conversation_id` → wrong/missing selection after refetch | N/A                                  |

**Fix for Agent chat**: In the stream `done` handler, when `event.data.conversation_id` is set, call `setCurrentChatId(event.data.conversation_id)` (and then `refetchChatHistory()` as today) so the current chat is the same as the conversation the agent created.
