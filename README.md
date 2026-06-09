# GwehAI

AI-powered web application security assistant: automated pentesting, recon, vulnerability verification, and report generation.

## What it does

- **Pentest a URL** — Full checklist: recon → input handling (SQLi, XSS, LFI, etc.) → auth → access control. Uses skills and tools (curl, ffuf, sqlmap, nuclei, browser automation).
- **Multi-agent** — Spawn sub-agents (e.g. Gweh, Shadow, Nexus), delegate recon or verification, combine findings.
- **Reports** — Findings saved with proof (POC); view by domain in the dashboard.
- **Plans & billing** — Free tier + paid plans (Pro, Pro Plus, Ultra). PayPal subscriptions; users can cancel in Settings.

## Quick start

**Prerequisites:** Node.js 18+, npm, Docker (for Postgres).

```bash
# 1. Database
docker compose up -d postgres

# 2. Backend + frontend (one script)
./local.sh
```

Or run manually:

```bash
# Terminal 1 – backend
cd backend && npm install && npm run start:dev

# Terminal 2 – frontend
cd frontend && npm install && npm run dev
```

- **Backend:** http://localhost:3001  
- **Frontend:** http://localhost:5173  

Optional: start the pentest-tools container for exec/browser scripts:

```bash
docker compose up -d pentest-tools
```

Copy `backend/env.sample` to `backend/.env` and set at least: `DB_*`, `JWT_SECRET`, and one of `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`.

## Project structure

```
gwehai/
├── frontend/          # React + Vite
├── backend/           # NestJS API, chat, pentest jobs, subscriptions
├── docs/              # Setup, subscriptions, features, troubleshooting
├── local.sh           # Run backend + frontend with npm
└── docker-compose.yml # Postgres, pentest-tools, frontend-app
```

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/README.md](docs/README.md) | Index of all docs |
| [docs/SETUP.md](docs/SETUP.md) | Environment, database, running the app |
| [docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md) | Plans, PayPal, cancel subscription |
| [docs/FEATURES.md](docs/FEATURES.md) | User vs admin features |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |

## Build

- **Backend:** `cd backend && npm run build`
- **Frontend:** `cd frontend && npm run build`

## License

MIT

<!-- CI/CD test deploy 1781040203 -->
