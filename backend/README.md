# GwehAI Backend

NestJS backend for GwehAI - AI Cybersecurity Pentester platform.

## Features

- ✅ Google OAuth authentication
- ✅ ChatGPT-like chat system with conversations
- ✅ Point-based billing system ($20 => 100 points)
- ✅ Subscription management with monthly point grants
- ✅ ACID-safe point transactions
- ✅ Model selection for AI chat
- ✅ Usage tracking and analytics

## Database Setup

### Using Docker (Recommended)

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready
docker-compose ps
```

### Manual Setup

1. Install PostgreSQL 15+
2. Create database: `createdb gwehai_db`
3. Update `.env` with your database credentials

## Environment Variables

Copy the sample env file and configure:

```bash
cp env.sample .env
# Edit .env with your values
```

See `env.sample` for all options. Minimum for local dev:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=gwehai
DB_PASSWORD=gwehai_dev_password
DB_DATABASE=gwehai_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Google OAuth (Sign in / Register / Connect with Google)
# Callback URL must be your BACKEND base URL + /api/auth/google/callback (backend uses global prefix "api")
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Model Provider Selector: set at least one API key for chat (Auto=Groq, or DeepSeek/OpenAI/Claude)
GROQ_API_KEY=          # for "Auto" option
DEEPSEEK_API_KEY=     # for "DeepSeek"
OPENAI_API_KEY=       # for "OpenAI GPT5"
ANTHROPIC_API_KEY=    # for "Claude"

# Optional: higher output token cap for tool-call requests (pentest, etc.). E.g. 15000 helps Groq return valid tool_calls.
# MAX_OUTPUT_TOKENS_TOOLS=15000
# Or raise the default for all requests: MAX_OUTPUT_TOKENS_DEFAULT=15000
```

### Skills loading (directory only, no URL)

The pentest agent loads skills **only from the local filesystem** (no CDN).

1. **Primary:** workspace `skills/` directory (e.g. `backend/skills/` when running from backend). Default `PENTEST_SKILLS_LOCAL_DIR` is workspace/skills.
2. **Override:** set `PENTEST_SKILLS_LOCAL_DIR` to a custom path (e.g. `/opt/skills` in Docker). Skills are read from that directory.

Optional env:

```bash
# Skills directory — default is workspace/skills (e.g. backend/skills). In Docker, the image copies skills to /app/skills (see Dockerfile).
PENTEST_SKILLS_LOCAL_DIR=/opt/skills   # optional override

# Workspace root (directory that contains skills/). Backend Dockerfile sets PENTEST_WORKSPACE=/app.
PENTEST_WORKSPACE=/app
```

- **Docker:** The backend Dockerfile **copies** `skills/` into the image at `/app/skills` and sets `PENTEST_WORKSPACE=/app`, so skills load from the image with no URL or extra volume. To use a mounted dir instead, set `PENTEST_SKILLS_LOCAL_DIR` and mount it.

Custom skills added via `add_skill` are written to the workspace `skills/custom/` folder.

## Installation

```bash
npm install
```

## Database Migrations

```bash
# Run migrations
npm run migration:run

# Generate new migration
npm run migration:generate src/migrations/MigrationName

# Revert last migration
npm run migration:revert
```

## Running

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Testing

```bash
# Test point ledger math
npm run test:ledger

# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e
```

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/me` - Get current user (requires JWT)

### Chat
- `POST /chat` - Send message (requires JWT)
- `GET /chat/conversations` - Get user conversations (requires JWT)
- `GET /chat/conversations/:id` - Get conversation with messages (requires JWT)
- `GET /chat/models` - Get available models (requires JWT)

### Points
- `GET /points/balance` - Get point balance (requires JWT)
- `GET /points/ledger` - Get ledger history (requires JWT)

### Payments
- `GET /payments/packs` - Get available credit packs (requires JWT)
- `POST /payments/orders` - Create credit order (requires JWT)
- `GET /payments/orders` - Get user orders (requires JWT)

## Database Schema

### Core Tables
- `users` - User accounts
- `models` - Available AI models
- `conversations` - Chat conversations
- `messages` - Chat messages
- `message_parts` - Rich message content
- `files` - Uploaded files
- `message_files` - Message attachments

### Points System
- `credit_packs` - Credit pack definitions ($20 => 100 points)
- `credit_orders` - Purchase orders with idempotency
- `point_ledger` - All point transactions (grants/spends)
- `user_point_balances` - Cached point balances (optimistic locking)

### Subscriptions
- `subscriptions` - User subscriptions with monthly point grants

### Usage Tracking
- `usage_events` - Token usage and cost tracking per message

## Example Flows

### 1. User buys $20 pack -> +100 points

```typescript
// Create order
const order = await paymentsService.createCreditOrder(userId, packId);

// Confirm payment (webhook or manual)
await paymentsService.confirmPayment(order.id, paymentIntentId);

// Points automatically granted via PointsService.grantPoints()
```

### 2. User chats -> -X points per message

```typescript
// Chat automatically:
// 1. Checks balance
// 2. Deducts points (ACID-safe)
// 3. Creates usage event
// 4. Saves messages
const result = await chatService.processMessage(userId, message, conversationId);
```

### 3. Subscription renewal -> +monthly points grant

```typescript
// Process renewal (cron job or webhook)
await subscriptionsService.processRenewal(subscriptionId);

// Points automatically granted via PointsService.grantPoints()
```

## ACID Safety

All point operations use database transactions with pessimistic locking:

```typescript
// PointsService.spendPoints() uses:
await manager.findOne(UserPointBalance, {
  where: { userId },
  lock: { mode: 'pessimistic_write' }, // Prevents race conditions
});
```

## Idempotency

Payment processing is idempotent:

```typescript
// Check for existing order
const existing = await orderRepo.findOne({
  where: { idempotencyKey },
});

if (existing) {
  return existing; // Return existing, don't process again
}
```

## Architecture

- **Entities**: TypeORM entities in `src/entities/`
- **Services**: Business logic in `src/*/services/`
- **Controllers**: REST endpoints in `src/*/controllers/`
- **Migrations**: Database migrations in `src/migrations/`
- **Guards**: JWT authentication guards
- **Strategies**: Passport strategies for OAuth

## Testing the API (request / response)

To see exactly what request is sent and what the API returns (including SSE events):

1. **Start the backend** (e.g. `npm run start:dev`).
2. **Get a bearer token** (either method):
   - **From script (recommended):**  
     `npm run generate-bearer-token -- <your-email>`  
     Example: `npm run generate-bearer-token -- you@example.com`  
     Requires the user to exist in the DB and `.env` with `JWT_SECRET` (and DB_* for lookup).
   - **From browser:** log in via the frontend, then in the browser console:  
     `JSON.parse(localStorage.getItem('scout_user') || '{}').token`
3. **Run the test script**:
   ```bash
   GWEHAI_TEST_JWT=<paste-token-here> npm run test:gwehai-api
   ```
   Or with a custom base URL:
   ```bash
   API_URL=http://localhost:3001 GWEHAI_TEST_JWT=<token> npm run test:gwehai-api
   ```

The script will print:

- **REQUEST: POST /api/gwehai/chat** – method, URL, headers (auth redacted), and body (e.g. `messages`, `model_key`).
- **RESPONSE: POST /api/gwehai/chat** – status code and body (e.g. `job_id`, `stream_id`).
- **REQUEST: GET /api/gwehai/chat/stream** – stream URL.
- **RESPONSE: Stream (SSE)** – status and content-type, then each SSE event (`status`, `error`, `done`, etc.) with its data.

Use this to verify payloads and that error events return a normalized message instead of raw provider JSON.

### Groq request/response only

To see the **exact payload sent to Groq** and the **raw response from Groq** when a user says *"Please pentest this website http://testphp.vulnweb.com/"*:

```bash
npm run test:groq-request-response
```

The script runs a **multi-turn tool loop** like a real user: send request → get `tool_calls` → mock tool results → send back → repeat. Each turn logs **REQUEST** (full payload) and **RESPONSE** (status + body). Uses the same system prompt, user message, and tools as the app. Requires `GROQ_API_KEY` in `.env`. Optional: `DEFAULT_AUTO_MODEL`, `MAX_OUTPUT_TOKENS_TOOLS`, `GROQ_TEST_MAX_TURNS` (default 10).

**If you see** `npm error arg Argument starts with non-ascii dash`: you likely pasted a command that uses an en dash (–) instead of a regular hyphen (-). Type the command manually or replace the dash with a normal hyphen, e.g. `npm run test:groq-request-response` or `GROQ_TEST_MAX_TURNS=2 npm run test:groq-request-response`.

## Development Notes

- Database auto-syncs in development (`synchronize: true`)
- In production, use migrations (`synchronize: false`)
- Point balances are cached for performance but verified via ledger
- All point operations are transactional and ACID-safe
