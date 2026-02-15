# Why Security Reports Shows Multiple Rows (e.g. 4) for One Run

## What you see

You ran **one** pentest (one conversation in the UI), but the **Security Reports** modal shows **4 rows** (4 different Conversation IDs, each with findings like 3, 3, 3, 5).

## Why this happens

**Each row = one conversation that has at least one finding.**

During a single pentest run, the main agent can use **sub-agents** (multi-agent mode):

1. **sessions_spawn** – The main agent can spawn sub-agents (e.g. recon, exploit, general). Each sub-agent gets its **own conversation** in the database (with `parentConversationId` pointing to your main conversation).
2. **report_finding** – When the main agent or a sub-agent calls `report_finding`, the finding is saved with **that agent’s conversation ID** (main or sub-agent).
3. **Security Reports** – The list is built by grouping **by conversation** (`groupBy r.conversationId`). So every conversation that has findings gets one row.

So:

- **1 main conversation** + **3 sub-agent conversations** (e.g. recon, exploit, general)  
  → **4 conversations with findings**  
  → **4 rows** in Security Reports.

So the 4 rows are: **your main chat** plus **3 sub-agent sessions** that were created during the same run and each reported findings.

## Summary

| Cause | Explanation |
|-------|-------------|
| Sub-agents | One “run” can create 1 main + N sub-agent conversations. Each conversation that has findings becomes one row. |
| Same website | All 4 rows can show the same website (e.g. testphp.vulnweb.com) because main and sub-agents all tested the same target. |
| Different findings count | Sub-agents may report 3 each, main may report 5, etc., so counts differ per row. |

## If you want “one run = one row”

To show a single row per “run” (main conversation) and roll sub-agent findings into it:

- **Backend:** Add an option (e.g. `?groupBy=parent`) so that reports are grouped by **root conversation**: use `COALESCE(c."parentConversationId", c.id)` so all sub-agent findings are counted under the main conversation.
- **Frontend:** Keep using the same Security Reports modal; when the API groups by parent, you’ll get one row per main conversation.

That way one pentest run = one row in Security Reports, with findings from main + all sub-agents combined.
