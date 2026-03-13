# Setup

## Environment

Copy the sample env and set at least database and one LLM key:

```bash
cp backend/env.sample backend/.env
```

Edit `backend/.env`:

- **Database:** `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- **JWT:** `JWT_SECRET`
- **LLM (at least one):** `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` (Gemini key from [Google AI Studio](https://aistudio.google.com/app/apikey))
- **Frontend URL (for OAuth):** `FRONTEND_URL=http://localhost:5173`
- **Google OAuth (optional):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback`

## Database

PostgreSQL 15+ required. Easiest: Docker.

```bash
docker compose up -d postgres
```

Then run migrations from the backend:

```bash
cd backend && npm run migration:run
```

## Running the app

**Option 1 – one script (backend + frontend):**

```bash
./local.sh
```

Use `./local.sh --db` to start Postgres first, then backend and frontend.

**Option 2 – manual:**

```bash
# Terminal 1 – backend
cd backend && npm install && npm run start:dev

# Terminal 2 – frontend
cd frontend && npm install && npm run dev
```

- Backend: http://localhost:3001  
- Frontend: http://localhost:5173 (Vite default)

**Optional – pentest tools container** (for exec and browser scripts):

```bash
docker compose up -d pentest-tools
```

Skills are loaded from the backend `skills/` directory (no CDN). See backend README for `PENTEST_WORKSPACE` and `PENTEST_SKILLS_LOCAL_DIR` if you change layout.

## Production deployment

Before going live:

1. **Environment** — Set `NODE_ENV=production` and `FRONTEND_URL` to your frontend origin (e.g. `https://app.example.com`). Use a strong `JWT_SECRET`; never commit `.env`.
2. **Database** — Use managed Postgres or a dedicated server; run `npm run migration:run`.
3. **OAuth** — Add your production callback URL to Google Cloud Console and set `GOOGLE_CALLBACK_URL` in backend env.
4. **Optional** — Add rate limiting and security headers (e.g. Helmet) for extra hardening; set frontend `VITE_API_URL` to your API base.
