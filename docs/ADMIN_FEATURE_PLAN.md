# Admin Feature Plan — Monitor Everything Easily

This document outlines a plan for admin menus and features so you can monitor the platform in one place. Use it as a roadmap when building out the admin UI and APIs.

---

## Current State

**Backend (already exists):**
- `GET /admin/dashboard` — summary counts: users, admins, aiAgents, payments, reports
- `GET /admin/users` — list users (last 100)
- `GET /admin/admin-users` — list admin users
- `GET /admin/ai-agents` — list models
- `GET /admin/payments` — list credit orders (last 100)
- `GET /admin/reports` — list all reports (last 100)
- `GET /admin/user-activity` — usage events (last 100, with user + model)
- `GET /admin/messages` — messages (last 100, with user + conversation)
- `GET /admin/ai-behaviour` — token usage by model (input/output tokens, calls)
- `GET /admin/settings` — env flags (environment, apiBaseUrl)
- `POST /admin/wipe-chat-and-reports` — delete all chat, reports, hacktivity

**Frontend:**
- Admin dashboard page shows only summary cards (Users, Admins, AI Agents, Payments, Reports). No sidebar, no drill-down, no other admin pages.

---

## Proposed Admin Menu Structure

Use a **sidebar** (or top nav with dropdowns) so every area is one click away. Suggested top-level menu:

| Menu item        | Purpose                                      | Priority |
|------------------|----------------------------------------------|----------|
| **Overview**     | Dashboard with key metrics and recent activity | Phase 1  |
| **Users**        | List users, usage per user, last active      | Phase 1  |
| **Conversations**| List conversations, messages count, link to chat | Phase 1  |
| **Pentests & jobs** | Active jobs, recent jobs, status, duration   | Phase 1  |
| **Hacktivity**   | All AI actions (tool runs) across users      | Phase 1  |
| **Reports**      | All reports, findings count, by conversation | Phase 1  |
| **Usage & plans**| Points used, plan distribution, AI behaviour | Phase 1  |
| **System**       | Health, logs, settings, dangerous actions   | Phase 2  |
| **Audit**        | Export, audit trail, retention (optional)    | Phase 3  |

---

## Feature List by Menu

### 1. Overview (Dashboard)

- **Summary cards (keep current):** Users, Admins, AI Agents, Payments, Reports.
- **Add:**
  - **Conversations** count.
  - **Hacktivity** count (total AI actions).
  - **Active jobs** count (e.g. from gwehai in-memory or pentest-jobs).
  - **Recent activity** list: last 10–20 events (e.g. “User X started a pentest”, “User Y sent a message”, “Report generated for conversation Z”) — can reuse usage events + hacktivity + reports.
- **Optional:** Simple line chart (e.g. messages or pentests per day for last 7 days).

**API:** Extend `GET /admin/dashboard` to return `conversations`, `hacktivityTotal`, `activeJobs` (if available), and optionally `recentActivity[]`.

---

### 2. Users

- **Table:** id, email, role, createdAt, lastLoginAt (if you add it), plan/status if applicable.
- **Filters:** Role (all / user / admin), search by email.
- **Per user:** Link to “View conversations” or “Usage” for that user.
- **Optional:** “Impersonate” or “View as user” (read-only) for support; must be secure and audited.

**API:** Already have `GET /admin/users`. Add query params: `?role=admin`, `?search=email`. Optional: `GET /admin/users/:id/usage` or include usage in list.

---

### 3. Conversations

- **Table:** id, userId (or email), title, createdAt, messageCount, lastMessageAt, reportId if any.
- **Filters:** By user, date range, has report (yes/no).
- **Actions:** Open conversation in app (link with `conversationId`), delete conversation (optional, Phase 2).

**API:** Add `GET /admin/conversations` with pagination and filters; return list with message count (and report id if you have it).

---

### 4. Pentests & jobs

- **Active jobs:** List of currently running jobs (from gwehai service or pentest-jobs API): jobId, userId, conversationId, status, startedAt.
- **Recent jobs:** Last N jobs with status (completed / failed / stopped), duration, conversationId.
- **Actions:** “Stop job” (already have stop endpoint), link to conversation.

**API:**  
- Backend: expose in-memory gwehai jobs (e.g. `GET /admin/jobs/active`) and optionally persist completed jobs to DB for history.  
- If you use pentest-jobs API, add `GET /admin/pentest-jobs` that proxies or aggregates from that service.

---

### 5. Hacktivity (global)

- **Table:** Same as user Hacktivity but for all users: id, userId (or email), conversationId, domain, createdAt, tool/action type (from toolArgs).
- **Filters:** User, conversation, date range, action type (e.g. exec, memory_search).
- **Export:** CSV of filtered rows (Phase 2).

**API:** Add `GET /admin/hacktivity` with pagination and filters (userId, conversationId, from, to, limit). Reuse Hacktivity entity; scope by admin role only.

---

### 6. Reports

- **Table:** Report id, conversationId, userId, createdAt, findings count, status (if you have it).
- **Filters:** User, date range.
- **Actions:** Link to view report (e.g. open report in app or download).

**API:** Already have `GET /admin/reports`. Extend with pagination and optional filters. Add findings count per report (e.g. from report_findings or equivalent).

---

### 7. Usage & plans

- **Points / usage:** Per user or global: points used, points granted, messages sent, reports generated (from subscriptions/usage if you have it).
- **Plan distribution:** How many users on each plan (free, pro, etc.).
- **AI behaviour (keep):** Token usage by model (input/output tokens, call count) — already have `GET /admin/ai-behaviour`.
- **Charts (optional):** Usage over time (e.g. by day).

**API:** Add or extend: `GET /admin/usage-summary` (points, messages, reports by user or global), `GET /admin/plans-distribution`. Keep `GET /admin/ai-behaviour`.

---

### 8. System (Phase 2)

- **Health:** API health, DB connectivity, LLM provider status (if you have a health endpoint).
- **Settings:** View (and optionally edit) env-derived settings: API URL, feature flags, rate limits.
- **Dangerous actions:**  
  - “Wipe chat and reports” (already exists) — show confirmation and maybe require typing “DELETE” or similar.  
  - Optional: clear cache, restart workers, etc., if applicable.
- **Logs:** Last N error logs or request logs (if you add logging to a table or file and expose an endpoint).

**API:** `GET /admin/health`, extend `GET /admin/settings`; keep `POST /admin/wipe-chat-and-reports` with strong confirmation.

---

### 9. Audit (Phase 3)

- **Export:** Export users, conversations, reports, hacktivity as CSV/JSON for backup or compliance.
- **Audit trail:** Log admin actions (who ran “wipe”, who viewed which user, etc.) in a table and show in UI.
- **Retention:** Policy settings (e.g. auto-delete conversations older than 90 days) — optional.

**API:** `GET /admin/export?type=users|conversations|reports|hacktivity&format=csv`, `GET /admin/audit-log` with pagination.

---

## Suggested Implementation Order

1. **Phase 1 — “Monitor everything”**
   - Add admin **sidebar** with: Overview, Users, Conversations, Pentests & jobs, Hacktivity, Reports, Usage & plans.
   - **Overview:** Extend dashboard API and UI (conversations count, hacktivity count, active jobs, recent activity).
   - **Users:** List page with table (reuse `GET /admin/users`), optional search/filter.
   - **Conversations:** New `GET /admin/conversations` + list page with filters.
   - **Pentests & jobs:** New `GET /admin/jobs/active` (and optional recent jobs), UI table + “Stop” button.
   - **Hacktivity:** New `GET /admin/hacktivity` (admin-scoped) + list page with filters.
   - **Reports:** Reports list page (reuse/extend `GET /admin/reports`) with findings count and link to report.
   - **Usage & plans:** Usage summary + plan distribution + existing AI behaviour; optional charts.

2. **Phase 2 — “Control and health”**
   - **System:** Health check, settings view, “Wipe” with strong confirmation, optional logs.
   - **Export:** CSV/JSON export for main entities.

3. **Phase 3 — “Compliance and polish”**
   - **Audit:** Audit log of admin actions and optional retention policies.
   - **Mobile-friendly** admin UI (same breakpoints as main app).

---

## Tech Notes

- **Auth:** Keep all admin routes behind `JwtAuthGuard` + `RolesGuard` with `@Roles(UserRole.ADMIN)`.
- **Pagination:** Use `limit`/`offset` or `page`/`pageSize` for list endpoints to avoid loading thousands of rows.
- **Frontend:** Reuse existing patterns (e.g. Dashboard layout with sidebar, tables like Report/Hacktivity), add an admin-specific layout and route prefix (e.g. `/admin/*`).
- **Real-time (optional):** If you add WebSockets or SSE later, admin Overview could show “active jobs” and “recent activity” in real time.

---

## Admin Hardening (Implemented)

To make admin routes as hard as possible to abuse:

- **Auth:** All admin endpoints require JWT + `ADMIN` role. No admin action is possible without a valid admin token.
- **Audit log:** Every sensitive action is recorded in `admin_audit_logs`: who (admin user id), what (action), resource, details, IP. Implemented for: `export`, `wipe_chat_and_reports`.
- **IP logging:** Export and wipe record client IP (from `X-Forwarded-For` or socket) in the audit log.
- **Wipe confirmation:** `POST /admin/wipe-chat-and-reports` requires body `{ "confirm": "WIPE_ALL_DATA" }`. Frontend requires typing `WIPE_ALL_DATA` in a text field before enabling the button.
- **Export:** Export is logged (action + resource type + IP). Download is limited to 1000 rows per type.
- **Optional future hardening:** Rate limit `/admin/*` (e.g. 60 req/min per admin), require re-auth or 2FA for wipe/export, restrict admin by IP allowlist.

---

## Summary Table: Admin Menu → Purpose

| Menu           | What admin can do |
|----------------|-------------------|
| **Overview**   | See key counts and recent activity at a glance. |
| **Users**      | List users, filter by role, see basic info. |
| **Conversations** | List conversations, message count, link to chat, filter by user. |
| **Pentests & jobs** | See active and recent jobs, stop a job, open related conversation. |
| **Hacktivity** | See all AI tool runs across users, filter by user/conversation/type. |
| **Reports**    | List reports, findings count, link to view report. |
| **Usage & plans** | See usage (points, messages), plan distribution, token usage by model. |
| **System**     | Health, settings, dangerous actions (e.g. wipe) with confirmation. |
| **Audit**      | Export data, view audit log of admin actions. |

This plan gives you a clear menu structure and feature set so the admin can monitor users, conversations, pentests, hacktivity, reports, usage, and system health in one place.
