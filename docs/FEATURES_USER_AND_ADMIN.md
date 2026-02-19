# GwehAI — User vs Admin Features

This document summarizes what **users** (authenticated or public) can do versus what **admins** can do in the app.

---

## User features

### Public (no login)

| Route / area | Feature |
|--------------|---------|
| `/` | **Home** — landing, product info |
| `/login` | **Login** — email/password or Google OAuth |
| `/signup` | **Signup** — create account (email verification if configured) |
| `/verify-signup` | **Verify signup** — confirm email via link or OTP |
| `/forgot-password` | **Forgot password** — request reset link |
| `/reset-password` | **Reset password** — set new password with token |
| `/pricing` | **Pricing** — plans and pricing info |
| `/terms` | **Terms** — terms of service |
| `/privacy` | **Privacy** — privacy policy |
| `/contact` | **Contact** — contact form/info |
| `/careers` | **Careers** — careers page |
| `/auth/google/callback` | **Google OAuth callback** — handled by app after Google sign-in |

---

### Authenticated user (after login)

All of the below live under the **Agent** area (`/agent`). Access is protected; unauthenticated users are redirected to `/login`.

| Route / area | Feature |
|--------------|---------|
| `/agent` | **Dashboard (main chat)** — AI assistant for security testing. User can: send messages, run pentests (e.g. “pentest this URL”), ask security questions, use multiple models (auto, DeepSeek, OpenAI, Claude). Conversation history in sidebar; streaming responses; tool calls (exec, report_finding, memory, etc.) shown in the UI. |
| `/agent` (sidebar / UI) | **Plan & credit** — View current plan (FREE/PRO/etc.), **Credit** (tokens/usage), and limits (workers, scans, steps, sub-agents). “What this means” explains Unlimited* and fair usage. |
| `/agent` (sidebar / UI) | **Security reports** — Table of findings grouped by **domain**; each row shows Conversation, Domain, Date, First/Last, Duration, and links to view details. Data is scoped to the current user. |
| `/agent` (sidebar / UI) | **Hacktivity** — List of the user’s AI tool activity (e.g. curl, nuclei, report_finding) per conversation. Filter by conversation; view details per row. Realtime-friendly (background poll without full list blink). |
| `/agent` (sidebar / UI) | **Current Pentest** — For active pentest jobs: status (Still scanning / Finished), **Phase** (Recon, Exploit, etc.), **Checklist** (recon, input_handling, auth_session, access_control, business_logic, other), Conversation, Job ID, Target. “Open in Runner” links to Pentest Runner. |
| `/agent/pentest-runner` | **Pentest Runner** — Start a pentest with target URL, mode (econ-only / full-checklist), optional credentials. Jobs run in the same conversation context; user can see status and results in the main chat. |

**Summary:** Authenticated users get the AI chat (Dashboard), plan/credit info, their own **reports**, **hacktivity**, **current pentest** status, and the **Pentest Runner**. All data is **scoped to that user**.

---

## Admin features

Admins are users with `role: admin` in the database. Only they can access `/admin/*`. The backend enforces admin role on all `/api/admin/*` endpoints (JWT + role check).

| Route | Feature |
|-------|---------|
| `/admin` | Redirects to `/admin/overview`. |
| `/admin/overview` | **Overview** — Dashboard-style counts: users, admins, AI agents, payments, reports, conversations, hacktivity total; active jobs count and list; recent usage activity. |
| `/admin/users` | **Users** — List all users with filters (role: all/user/admin, search by email or name). Table: Email, Name, Role, Created, ID. No pagination (top 200); use search to narrow. |
| `/admin/conversations` | **Conversations** — List all conversations with pagination. Columns: Title, User, Messages count, Created, ID. Prev/Next pager. |
| `/admin/jobs` | **Pentests & jobs** — In-memory pentest jobs (running and recent). Columns: Job ID, User ID, Conversation, Status, Started, Request. Refreshes every 10s. No pagination (single list). |
| `/admin/hacktivity` | **Hacktivity** — List all users’ hacktivity with pagination. Columns: When, User, Action, Domain, Conversation, Details. **Realtime:** SSE stream (`/api/admin/hacktivity/stream`) pushes new events; new rows appear on page 1. Click row or “Details” to open a **modal** with full event JSON. Styled pager (Prev / Page N / Next). |
| `/admin/reports` | **Reports** — List all security reports with pagination. Columns: Created, User ID, Conversation, Target, Status, ID. Prev/Next pager. |
| `/admin/usage` | **Usage & plans** — Total usage (calls, input/output tokens); per-user usage (top 100); AI behaviour by model. Tables only, no pagination. |
| `/admin/system` | **System** — Health (e.g. database status), settings snapshot. **Danger zone:** Wipe all chat, reports, and hacktivity (requires typing a confirmation phrase). |
| `/admin/audit` | **Audit** — Audit log of admin actions (who did what, when, IP). Paginated table. Export section: download users, conversations, reports, or hacktivity as JSON (action is logged). |

**Summary:** Admins see **overview** stats, **users**, **conversations**, **jobs**, **hacktivity** (realtime SSE + modal details), **reports**, **usage**, **system** health/wipe, and **audit** log + export. All admin APIs are protected by JWT + admin role on the backend.

---

## Quick reference

| Capability | User | Admin |
|------------|------|-------|
| Use chat / run pentests | ✅ | ✅ |
| View own reports | ✅ | — |
| View own hacktivity | ✅ | — |
| View current pentest status | ✅ (own jobs) | — |
| View plan & credit | ✅ (own) | — |
| View all users | — | ✅ |
| View all conversations | — | ✅ |
| View all jobs (pentests) | — | ✅ |
| View all hacktivity (realtime) | — | ✅ |
| View all reports | — | ✅ |
| Usage & plans (all users) | — | ✅ |
| System health & wipe | — | ✅ |
| Audit log & export | — | ✅ |

---

## Making a user an admin

From the backend directory:

```bash
npm run make-admin -- <email> [password]
```

- If the user exists: their role is set to `admin`.
- If the user does not exist and you provide a password (min 8 chars): a new admin user is created.

Example: `npm run make-admin -- admin@example.com MySecurePass123`

After that, the user must **log out and log back in** so the frontend receives a new JWT with `role: admin`; then `/admin` and all admin routes will be accessible.
