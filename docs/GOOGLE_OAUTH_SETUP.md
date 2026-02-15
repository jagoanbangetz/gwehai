# Google OAuth Setup (Sign in / Register / Connect with Google)

This app supports **Sign in with Google**, **Register with Google**, and **Connect Google Account** (in Settings). Follow these steps so it works with your `.env`.

## 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
4. If prompted, configure the **OAuth consent screen**:
   - User type: **External** (or Internal for workspace-only).
   - App name: e.g. **GwehAI**.
   - Support email: your email.
   - Scopes: add **email**, **profile**, **openid** (or use default).
   - Save.
5. Create **OAuth client ID**:
   - Application type: **Web application**.
   - Name: e.g. **GwehAI Web**.
   - **Authorized JavaScript origins** (where your app runs):
     - `http://localhost:5173` (Vite dev)
     - `http://localhost:3000` (if you use port 3000 for frontend)
     - Your production frontend URL, e.g. `https://app.yourdomain.com`
   - **Authorized redirect URIs** (must be your **backend** URL, not frontend):
     - Local: `http://localhost:3001/api/auth/google/callback`
     - Production: `https://your-api-domain.com/api/auth/google/callback`
   - **Important:** The callback URL must include `/api` because the backend uses the global prefix `api`. So the path is `/api/auth/google/callback`, not `/auth/google/callback`.
6. Copy the **Client ID** and **Client secret**.

## 2. Backend `.env`

Add or update:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

- **Local:** Use `http://localhost:3001/api/auth/google/callback` (or your backend port).
- **Production:** Use your backend base URL + `/api/auth/google/callback`, e.g. `https://api.yourdomain.com/api/auth/google/callback`.

Also set the frontend URL (used when redirecting after Google sign-in):

```bash
FRONTEND_URL=http://localhost:5173
# or production: https://app.yourdomain.com
```

## 3. Frontend (optional for production)

- **Development:** No extra config. Vite proxies `/api` to the backend (see `vite.config.ts`).
- **Production:** If your frontend and backend are on different domains, set the API base URL so “Continue with Google” and `/api/auth/me` hit the right server:

```bash
# .env or .env.production
VITE_API_URL=https://api.yourdomain.com
```

## 4. Flow summary

1. User clicks **Continue with Google** (Login, Signup) or **Connect Google Account** (Settings).
2. Browser goes to backend `GET /api/auth/google` → backend redirects to Google.
3. User signs in with Google → Google redirects to **backend** `GET /api/auth/google/callback?...`.
4. Backend creates or finds user, issues JWT, redirects to **frontend** `/auth/google/callback?token=...`.
5. Frontend saves user and token, then navigates to `/agent` (or shows error on `/login` if something failed).

## 5. Troubleshooting

### Error 400: redirect_uri_mismatch

This means the redirect URI your **backend** sends to Google does not exactly match any **Authorized redirect URI** in Google Cloud Console.

**Fix:**

1. **Start your backend** (e.g. `npm run start:dev`). On startup it logs a line like:
   ```text
   📌 Google OAuth: Add this EXACT URL to Google Cloud Console → Credentials → Authorized redirect URIs:
      http://localhost:3001/api/auth/google/callback
   ```
2. **Copy that URL exactly** (no trailing slash, same port as your backend).
3. In **Google Cloud Console** → **APIs & Services** → **Credentials** → open your **OAuth 2.0 Client ID** (Web application).
4. Under **Authorized redirect URIs**, click **+ ADD URI** and paste the URL. Remove any old or different redirect URI for this app (e.g. one without `/api` or with a different port).
5. Click **Save**. Changes can take a minute to apply; then try “Sign in with Google” again.

**Common mismatches:**

| Wrong (causes 400) | Correct |
|-------------------|--------|
| `http://localhost:3001/auth/google/callback` (missing `/api`) | `http://localhost:3001/api/auth/google/callback` |
| `http://localhost:3000/api/auth/google/callback` (wrong port) | Use the port your backend actually uses (e.g. `3001`) |
| `http://localhost:3001/api/auth/google/callback/` (trailing slash) | `http://localhost:3001/api/auth/google/callback` (no slash) |
| Frontend URL (e.g. `http://localhost:5173/...`) | Must be the **backend** URL where Nest runs (e.g. `http://localhost:3001/api/auth/google/callback`) |

Your backend `.env` must match what you put in Google:

```bash
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

(Replace `3001` with your backend `PORT` if different.)

---

- **401 / “Google sign-in failed”:** Check backend logs; ensure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` are set and that the callback URL in Google Console matches.
- **“Google did not provide an email”:** User must grant email scope; ensure OAuth consent screen includes email scope.
