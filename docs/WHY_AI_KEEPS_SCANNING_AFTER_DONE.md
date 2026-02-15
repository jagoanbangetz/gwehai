# Why It Looks Like the AI Keeps Scanning After "Done"

## What you see

The stream sends a **"done"** event (or the run finishes), but the UI still shows "Running: ..." or it feels like the AI is still scanning.

## Causes and fixes

### 1. **currentStep not cleared on "done"** (fixed)

- **Cause:** On "done" we set `isLoading(false)` and closed the stream, but we **kept** `currentStep` (e.g. "Running: dirsearch...") so the thinking bar still showed the last step.
- **Fix:** When the frontend receives the main agent’s **"done"** event, it now calls **`setCurrentStep(null)`** so the bar no longer shows "Running: ..." and the UI clearly shows that the run is finished.

### 2. **Sub-agents still running after main "done"**

- **Cause:** The main agent can spawn **sub-agents** (e.g. recon, exploit) with **wait_for_reply: false**. The main agent then continues and eventually finishes and pushes **"done"**. The **sub-agents** are still running in the background (their `processMessageWithTools` was started with `void ... .then()`). So:
  - The **stream** closes when the main "done" is sent, so the frontend stops receiving new events.
  - The **backend** may still be doing work (sub-agent tool calls). If there is another source of updates (e.g. pentest job events stream), it could keep receiving events and updating the activity log.
- **Result:** From the backend’s point of view, "scanning" can continue after the main agent has finished. From the user’s point of view, after the fix above the thinking bar should no longer show "Running: ..." once "done" is received.

### 3. **Two streams (chat + pentest job)**

- When you open a **pentest-linked** conversation, the frontend may have:
  1. **Chat/agent stream** (gwehai) – receives agent events and **"done"**; it closes on "done".
  2. **Pentest job events stream** (pentest-jobs/:id/events/stream) – receives job events (tool, state, note). It closes when the **job** status is `done` or `failed`.
- If the **job** status is updated to `done` only when the **agent** (and all sub-agents) finish, both streams close around the same time. If the job is marked "done" when only the main agent finishes, the pentest job stream may close first; any remaining sub-agent events would not be sent over that stream either once the agent run has completed.

### 4. **Report shows "finished" but backend still scanning** (fixed)

- **Cause:** The main agent pushed **"done"** and set conversation **runStatus** to **"finished"** as soon as it finished its reply. Sub-agents (spawned with **wait_for_reply: false**) were still running in the background, so the report list showed "finished" while the backend was still doing work.
- **Fix:** The backend now tracks **pending sub-agents** per parent conversation. It sets **runStatus** to **"finished"** and pushes **"done"** only when (1) the main agent has finished, and (2) all sub-agents started with **wait_for_reply: false** have completed. So the report will show "running" until all work (main + sub-agents) is done.

### 5. **Stop should stop all agents** (fixed)

- **Cause:** When the user clicked **Stop**, only the main job was marked stopped; the main agent loop and any sub-agents (wait_for_reply: false) could keep running in the background.
- **Fix:** The backend now uses an **AbortController** per job. When **stopJob** is called, it aborts that controller. The **abort signal** is passed into **processMessageWithTools** (main and sub-agents). At the start of each turn and before each tool call, the agent checks the signal; if aborted, it throws so the loop exits. Sub-agents receive the same signal, so they also stop when the user stops. Conversation **runStatus** is set to **"stopped"** and is not overwritten to **"finished"** when a sub-agent completes after stop (so the report stays "stopped").

## Summary

- **UI:** Clearing **currentStep** on "done" stops the thinking bar from showing "Running: ..." after the run has finished.
- **Backend:** Sub-agents started with **wait_for_reply: false** are now tracked. **"done"** is pushed and **runStatus** is set to **"finished"** only when the main agent and all such sub-agents have completed, so the report no longer shows "finished" while scanning is still in progress.
