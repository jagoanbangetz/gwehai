# Subscriptions and plans

## Plan tiers

| Plan       | Price   | Workers | Scans/day | Sub-agents |
|------------|---------|---------|-----------|------------|
| **Free**   | $0      | 1       | 3         | 0          |
| **Pro**    | $19/mo  | 5       | Unlimited | 3          |
| **Pro Plus** | $49/mo | 10      | Unlimited | 6          |
| **Ultra**  | $99/mo  | 50      | Unlimited | Unlimited  |

Limits are in `backend/src/config/plans.config.ts`. The user’s plan is stored in `User.planId` (FREE, PRO, PRO_PLUS, ULTRA).

## User flow: subscribe

1. User goes to **Pricing**, picks a paid plan, clicks “Subscribe with PayPal”.
2. Frontend calls `POST /api/subscriptions/create` with `planId`, `returnUrl`, `cancelUrl`.
3. Backend creates the subscription in PayPal and a local row with status `approval_pending`, then returns `approvalUrl`.
4. User is redirected to PayPal, approves, and is sent back to `returnUrl` with `subscription_id` (or `token`) in the query.
5. Frontend calls `POST /api/subscriptions/complete` with that ID. Backend activates the subscription, sets `User.planId`, and optionally sends a confirmation email.
6. PayPal also sends a webhook (`BILLING.SUBSCRIPTION.ACTIVATED`); backend calls the same activate logic (idempotent).

## User flow: cancel subscription

- In **Settings** → **Subscription**, if the user has an active PayPal subscription, a **Cancel subscription** button is shown.
- On confirm, frontend calls `POST /api/subscriptions/cancel`. Backend cancels the subscription in PayPal and sets the user back to Free (`User.planId = FREE`, subscription status `cancelled`).

## Admin actions

Admins (**Admin → Payment → Subscriptions**) can:

- **Suspend** — Pause billing in PayPal; user can resume later.
- **Cancel** — Cancel in PayPal and set user to Free (same as user self-cancel).

Both can be done from the table or by entering a PayPal subscription ID.

## Credits and limits

- **Points mode** (`POINTS_ENABLED=true`): each chat/pentest turn deducts points from the user’s balance.
- **Plan-only mode** (default): no point deduction; limits are workers, sessions per day, tokens per day, etc. “Credit” in the UI is token usage vs the plan’s daily token limit.
