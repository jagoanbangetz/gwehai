# Frontend-Backend Connection Setup

## ✅ What's Been Configured

### Backend (NestJS)
- **Port**: 3001
- **CORS**: Enabled for `http://localhost:3000` and `http://localhost:5173` (Vite)
- **Endpoints**:
  - `POST /auth/login` - Email/password login
  - `POST /auth/signup` - User registration
  - `POST /chat` - Send chat message (requires JWT)
  - `GET /chat/conversations` - Get user conversations
  - `GET /chat/models` - Get available models
  - `GET /health` - Health check

### Frontend (React + Vite)
- **Port**: 3000 (or 5173 if Vite default)
- **Proxy**: `/api/*` → `http://localhost:3001/*`
- **API Client**: Created `src/utils/api.ts` with:
  - Automatic JWT token injection
  - Error handling (401 redirects to login)
  - Credentials support

### Authentication Flow
1. User logs in via `/api/auth/login`
2. Backend returns JWT token + user data
3. Frontend stores token in localStorage
4. All API requests include `Authorization: Bearer <token>` header

## 🚀 How to Test Connection

### 1. Start Backend
```bash
cd backend
npm run start:dev
```
Backend should be running on `http://localhost:3001`

### 2. Start Frontend
```bash
cd frontend
npm run dev
```
Frontend should be running on `http://localhost:3000` (or 5173)

### 3. Test Health Endpoint
```bash
curl http://localhost:3001/health
```

### 4. Test Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 5. Test from Frontend
1. Open `http://localhost:3000`
2. Go to Login page
3. Sign up with a new account
4. Try sending a chat message

## 🔧 Configuration Files

### Backend CORS (`backend/src/main.ts`)
```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### Frontend Proxy (`frontend/vite.config.ts`)
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}
```

### API Client (`frontend/src/utils/api.ts`)
- Automatically adds JWT token to requests
- Handles 401 errors (redirects to login)
- Uses `/api` prefix which gets proxied to backend

## 📝 Notes

- **Temporary Auth**: Currently accepts any password if user exists (for development)
- **Password Hashing**: TODO - Implement bcrypt in production
- **Token Storage**: JWT tokens stored in localStorage (consider httpOnly cookies for production)
- **Error Handling**: Frontend shows error messages, backend returns proper HTTP status codes

## 🐛 Troubleshooting

### Backend not accessible
- Check if backend is running: `curl http://localhost:3001/health`
- Check port conflicts: `lsof -i :3001`

### CORS errors
- Verify CORS origin matches frontend URL
- Check browser console for CORS error details

### 401 Unauthorized
- Check if token is being sent: Look in Network tab → Request Headers
- Verify token format: Should be `Bearer <token>`
- Check token expiration (default: 60 minutes)

### Frontend can't connect
- Verify proxy is working: Check Vite dev server logs
- Test direct backend call: `curl http://localhost:3001/health`
- Check browser Network tab for failed requests
