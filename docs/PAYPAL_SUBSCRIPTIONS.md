# PayPal Subscriptions Integration

Users can subscribe to paid plans (Pro, Pro Plus, Ultra) via [PayPal Subscriptions API v1](https://developer.paypal.com/docs/api/subscriptions/v1/). When PayPal is configured, the Pricing page shows **Subscribe with PayPal** and redirects users to PayPal to approve the subscription.

## Backend configuration

Set these environment variables (e.g. in `backend/.env`):

| Variable | Description |
|----------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal REST app Client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal REST app Client Secret |
| `PAYPAL_MODE` | `sandbox` (default) or `live` |
| `PAYPAL_PLAN_PRO` | PayPal billing plan ID for Pro ($19/mo) |
| `PAYPAL_PLAN_PRO_PLUS` | PayPal billing plan ID for Pro Plus ($49/mo) |
| `PAYPAL_PLAN_ULTRA` | PayPal billing plan ID for Ultra ($99/mo) |
| `PAYPAL_WEBHOOK_ID` | (Optional) Webhook ID for signature verification |

If `PAYPAL_CLIENT_ID` or `PAYPAL_CLIENT_SECRET` is missing, PayPal is disabled and the Pricing page falls back to "Get [Plan]" (navigates to dashboard).

## Creating PayPal plans

1. In [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), create a **Product** (e.g. "GwehAI Plans").
2. For each paid tier, create a **Billing plan** under Subscriptions:
   - **Pro**: $19 USD/month, recurring.
   - **Pro Plus**: $49 USD/month, recurring.
   - **Ultra**: $99 USD/month, recurring.
3. Copy each plan ID (e.g. `P-XXXXXXXX`) into `PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_PRO_PLUS`, `PAYPAL_PLAN_ULTRA`.

Alternatively, use the [Create plan](https://developer.paypal.com/docs/api/subscriptions/v1/#plans_post) API (product_id from Catalog Products API, then create plan with `billing_cycles` and `payment_preferences`).

## Webhook

PayPal sends subscription events to your backend. Configure the webhook URL in PayPal Dashboard → App → Webhooks:

- **URL**: `https://your-api-domain.com/api/webhooks/paypal`
- **Events**: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`

When **ACTIVATED** is received, the backend sets `user.planId` to the subscribed plan and marks the subscription active. When **CANCELLED** / **SUSPENDED** / **EXPIRED** is received, the user is set back to FREE.

## Flow

1. User clicks **Subscribe with PayPal** on Pricing for a paid plan.
2. Frontend calls `POST /api/subscriptions/create` with `planId`, `returnUrl`, `cancelUrl`.
3. Backend creates a subscription in PayPal and a local `Subscription` row (status `approval_pending`), then returns `approvalUrl`.
4. Frontend redirects the user to `approvalUrl` (PayPal approval page).
5. User approves on PayPal and is redirected to `returnUrl` (e.g. `/pricing?success=1`).
6. PayPal sends **BILLING.SUBSCRIPTION.ACTIVATED** to `/api/webhooks/paypal`.
7. Backend sets `user.planId` and subscription status to `active`.

## Database

- **Subscription** entity: `planId` (PRO/PRO_PLUS/ULTRA), `providerSubscriptionId` (PayPal subscription ID), `status` (e.g. `approval_pending`, `active`, `cancelled`).
- **User.planId** is updated by the webhook when the subscription is activated or cancelled.

Run migrations so `subscriptions` has the `planId` column and new enum values:

```bash
cd backend && npm run migration:run
```
