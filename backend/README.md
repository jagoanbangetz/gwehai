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

Copy `.env.example` to `.env` and configure:

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
```

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

## Development Notes

- Database auto-syncs in development (`synchronize: true`)
- In production, use migrations (`synchronize: false`)
- Point balances are cached for performance but verified via ledger
- All point operations are transactional and ACID-safe
