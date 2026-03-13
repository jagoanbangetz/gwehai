# User vs admin features

## User (authenticated)

After login, under **Agent** (`/agent`):

- **Dashboard** — Chat with the AI; run pentests (“pentest this URL”), ask security questions; streaming responses and tool calls (exec, report_finding, memory, etc.).
- **Plan & credit** — View current plan (Free/Pro/etc.), token usage (Credit), and limits (workers, scans, steps, sub-agents).
- **Security reports** — Findings grouped by domain; view details per conversation/domain/date.
- **Hacktivity** — List of the user’s AI tool activity (curl, nuclei, report_finding, etc.) per conversation.
- **Current pentest** — Status of active pentest jobs (phase, checklist, target).
- **Pentest Runner** (`/agent/pentest-runner`) — Start a pentest with target URL, mode, optional credentials.

**Settings** — Account, Google link, password; subscription section with current plan and **Cancel subscription** for PayPal subscriptions.

All data is scoped to the logged-in user.

## Admin

Users with `role: admin` can access `/admin/*`. Backend enforces admin on all `/api/admin/*` routes.

- **Overview** — Counts (users, payments, reports, conversations, jobs) and recent activity.
- **Users** — List/filter users (role, search by email/name).
- **Conversations** — List all conversations (paginated).
- **Jobs** — Running and recent pentest jobs.
- **Hacktivity** — All users’ tool activity (with optional realtime stream).
- **Reports** — All security reports (paginated).
- **Usage & plans** — Token/call usage; per-user and by model.
- **Payment → Subscriptions** — List PayPal subscriptions; suspend or cancel by ID.
- **System** — Health; optional wipe of chat/reports/hacktivity (with confirmation).
- **Audit** — Admin action log; export users/conversations/reports/hacktivity.

## Make a user admin

From the backend directory:

```bash
npm run make-admin -- <email> [password]
```

If the user exists, their role is set to `admin`. If not and you provide a password, a new admin user is created. They must log out and log back in to get a JWT with `role: admin`.
