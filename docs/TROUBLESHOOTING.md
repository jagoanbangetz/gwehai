# Troubleshooting

## Docker Postgres: Exit 1 / “No space left on device”

If Postgres fails to start and logs show:

```text
could not create directory "/var/lib/postgresql/data/pg_wal": No space left on device
```

free disk space and optionally remove the volume:

```bash
docker system prune -f
docker volume prune -f   # only if you don’t need existing DB data
df -h
```

Then:

```bash
docker compose up -d postgres
```

If the volume was corrupted, remove it and start fresh (data will be lost):

```bash
docker compose down postgres
docker volume rm gwehai_postgres_data
docker compose up -d postgres
cd backend && npm run migration:run
```

## Backend not reachable

- Check it’s running: `curl http://localhost:3001/health`
- Check port: `lsof -i :3001`

## CORS errors

- Ensure backend CORS includes the frontend origin (e.g. `http://localhost:5173`).
- Check `FRONTEND_URL` and that the browser is using that origin.

## 401 Unauthorized

- Token: in Network tab, request headers should have `Authorization: Bearer <token>`.
- If token expired, log in again.
- For admin routes, user must have `role: admin` and have re-logged after being made admin.

## Frontend can’t reach backend

- Vite proxy: in `frontend/vite.config.ts`, `/api` should proxy to the backend (e.g. `http://localhost:3001`).
- Test backend directly: `curl http://localhost:3001/health`.
- Check browser Network tab for failed requests and exact URL.

## Pentest / exec fails

- If using the container: start pentest-tools with `docker compose up -d pentest-tools`. Backend runs exec via `docker exec gwehai-pentest-tools ...`.
- Set `PENTEST_RUN_IN_CONTAINER=false` to run exec on the host instead of in the container.

## OpenAI / ChatGPT “model not exist”

If you pick **GPT-4o** in the model picker and see an error like “The model … does not exist” or “model not exist”:

1. **Check the model id in logs** — When the backend calls OpenAI, it logs: `[ProviderRouter] OpenAI chat model: <id>`. That is the exact id sent. It should be `gpt-4o` unless overridden.
2. **Env override** — In `backend/.env`, `OPENAI_GPT5_MODEL_ID` (if set) is used as the default for the “OpenAI GPT5” option. Use a valid model id, e.g. `gpt-4o`. Remove the env var to use the built-in default `gpt-4o`.
3. **DB seed** — The picker row “GPT-4o” is seeded with `apiModelId: gpt-4o`. If you changed the seed or DB by hand, ensure that row’s `metadata.apiModelId` is `gpt-4o`. Re-seed with: `cd backend && npm run db:seed-models`.
4. **API key and access** — Ensure `OPENAI_API_KEY` is set and your OpenAI account has access to the model (e.g. gpt-4o). Region or tier can limit which models are available.
