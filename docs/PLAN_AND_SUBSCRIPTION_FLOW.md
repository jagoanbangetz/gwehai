# Plan and Subscription Flow

This document describes **how plans and subscriptions work** in GwehAI: plan tiers, how a user’s plan is determined, and the full subscription lifecycle (subscribe, activate, cancel, admin actions).

---

## 1. Plan tiers

| Plan ID   | Marketing name | Price   | Workers | Scans/day | Sub-agents | Notes              |
|-----------|----------------|--------|---------|-----------|------------|--------------------|
| **FREE**  | Free           | $0     | 1       | 3         | 0          | Default for new users |
| **PRO**   | Pro            | $19/mo | 5       | Unlimited | 3          |                    |
| **PRO_PLUS** | Pro Plus    | $49/mo | 10      | Unlimited | 6          | Priority queue     |
| **ULTRA** | Ultra          | $99/mo | 50      | Unlimited | Unlimited  | Throttle on soft cap |

- **Workers** = concurrent pentest targets (scans) at once.
- **Scans/day** = how many new scan sessions per day (FREE: 3; paid: unlimited).
- **Sub-agents** = parallel AI workers spawnable in one run (FREE: 0).
- Limits are defined in `backend/src/config/plans.config.ts` and enforced by `PlanUsageService` / `plan-limits.validation`.

---

## 2. How a user’s plan is resolved

- The **source of truth** for “what plan is this user on?” is **`User.planId`** (FREE, PRO, PRO_PLUS, ULTRA).
- **PlanResolutionService.getUserPlan(userId)**:
  1. Loads the user and reads `user.planId`.
  2. If `planId` is null/empty and `PLAN_MIGRATION_FROM_POINTS` is enabled, plan can be derived from point balance (migration path).
  3. Otherwise returns `planId` or **FREE** as default.
- All limit checks (sessions per day, workers, sub-agents, tokens) use this resolved plan via `getPlanDefinition(planId)`.

So: **subscription state is reflected in `User.planId`**. When a subscription is activated, we set `user.planId` to the paid plan; when it is cancelled/suspended/expired, we set it back to **FREE**.

---

## 3. Subscription flow (PayPal)

End-to-end flow when a user subscribes to a paid plan.

### 3.1 Create subscription (user clicks “Subscribe with PayPal”)

1. **Frontend (Pricing)**  
   User chooses a paid plan → calls  
   `POST /api/subscriptions/create`  
   with `planId`, `returnUrl`, `cancelUrl` (e.g. `returnUrl=/pricing?success=1`, `cancelUrl=/pricing?cancel=1`).

2. **Backend (SubscriptionsService.createPayPalSubscription)**  
   - Uses admin billing config or env for PayPal (client id/secret, plan IDs).  
   - Creates the subscription in PayPal (Subscriptions API).  
   - Creates a **local `Subscription`** row with:
     - `userId`, `planId`, `plan` (enum)
     - `status = approval_pending`
     - `providerSubscriptionId` = PayPal subscription ID  
   - Returns `{ approvalUrl, subscriptionId }`.

3. **Frontend**  
   Redirects the user to `approvalUrl` (PayPal approval page).

### 3.2 User approves on PayPal

4. User completes approval on PayPal.  
   PayPal redirects the user to **returnUrl** with query params (e.g. `subscription_id` or `token`).

5. **Frontend (Pricing)**  
   On load with `?success=1` and `subscription_id` (or `token`):  
   - Calls `POST /api/subscriptions/complete` with that ID (and JWT).  
   - **Backend (SubscriptionsService.completeSubscription)**  
     - Finds the local `Subscription` by `providerSubscriptionId` and `userId`, status must be `approval_pending`.  
     - Calls **activateFromPayPal(paypalSubscriptionId)** (see below).  
   - Frontend shows a success message and can clear URL params.

6. **Backend (SubscriptionsService.activateFromPayPal)**  
   - Loads the `Subscription` by PayPal subscription ID.  
   - Sets `user.planId` to the subscription’s plan (PRO / PRO_PLUS / ULTRA).  
   - Sets subscription `status = active`, `currentPeriodStart` / `currentPeriodEnd`.  
   - Saves subscription.  
   - Optionally sends **subscription success email** to the user (if SMTP is configured).

So the user’s plan is upgraded either when they **complete** the return flow (step 5) or when the webhook is processed (next).

### 3.3 Webhook (PayPal → backend)

7. PayPal sends **BILLING.SUBSCRIPTION.ACTIVATED** to  
   `POST /api/webhooks/paypal`.  
   Backend calls **activateFromPayPal(subscriptionId)** again (idempotent: same logic as step 6).

8. For **cancellation/suspension/expiry**, PayPal sends  
   **BILLING.SUBSCRIPTION.CANCELLED** (or SUSPENDED / EXPIRED).  
   Backend calls **cancelFromPayPal(subscriptionId)**:
   - Sets subscription `status = cancelled`, `cancelledAt`.
   - Sets **`user.planId = 'FREE'`**.

So: **return URL flow** and **webhook** both update the same local subscription and `User.planId`; the webhook ensures the user is upgraded/downgraded even if they never hit the return URL.

---

## 4. Database (plans and subscriptions)

- **User.planId**  
  Single source of truth for “which plan is this user on?” (FREE | PRO | PRO_PLUS | ULTRA). Updated when a subscription is activated or cancelled.

- **Subscription** (table `subscriptions`)  
  One row per PayPal subscription (or internal subscription):
  - `userId`, `planId`, `plan` (enum), `status` (e.g. `approval_pending`, `active`, `cancelled`)
  - `providerSubscriptionId` (PayPal subscription ID)
  - `currentPeriodStart`, `currentPeriodEnd`, `cancelledAt`
  - Optional: `monthlyPointsGrant` for point grants on renewal

---

## 5. Admin actions (suspend / cancel)

Admins can suspend or cancel a subscription from **Admin → Payment → Subscriptions** (or by ID).

- **Suspend**  
  `POST /api/admin/paypal/subscription/suspend`  
  - Suspends the subscription in PayPal (billing paused; customer can resume later).  
  - Local subscription row is **not** changed (we do not have a “suspended” status in the DB); PayPal remains source of truth for suspend.

- **Cancel**  
  `POST /api/admin/paypal/subscription/cancel`  
  - Cancels the subscription in PayPal.  
  - Backend then calls **SubscriptionsService.cancelFromPayPal(subscriptionId)** so that:
    - Local `Subscription` is set to `status = cancelled`, `cancelledAt` set.
    - **User.planId** is set to **FREE**.  
  This keeps the UI and limits in sync (e.g. no “approval_pending” left after cancel).

Confirmation is required in the UI before suspend/cancel.

---

## 6. Notifications

- **Subscription success (email)**  
  When a subscription is activated (in **activateFromPayPal**), if SMTP is configured, the backend sends a “Subscription successful” email to the user (plan name, that the plan is active).  
  Sending is fire-and-forget so a mail failure does not block activation.

- **In-app**  
  After the user returns from PayPal and **complete** succeeds, the Pricing page shows a success message (and mentions the confirmation email).

---

## 7. Credit deduction (how the bot uses credits)

When the user sends a message (chat or pentest), the bot uses the AI and **deducts credit** so usage is tracked and limited. This section explains how that works.

### 7.1 Two modes: points vs plan-only

- **`POINTS_ENABLED=true`** (env in backend):  
  The system uses a **point balance** (credits). Each chat or pentest turn **deducts points** from the user’s balance. If the balance is too low, the request is rejected (“Insufficient points”).  
  Balance is stored in **UserPointBalance** and changed via **PointLedger** (spend entries).

- **`POINTS_ENABLED=false`** (default):  
  **No point deduction** happens. Limits are enforced only by **plan quotas** (workers, sessions per day, tokens per day, steps per session). The “Credit” shown in the UI (e.g. **0 / 250000**) is the **token usage vs plan’s tokens_per_day** (usage is tracked for display and quota; nothing is subtracted from a point balance).

So: **credits** in the sense of “something that goes down when the bot runs” are either **points** (when POINTS_ENABLED) or **plan token/session quotas** (when not). The UI “Credit” display reflects the plan-based token usage (used vs limit) in both cases; when points are enabled, the backend also decrements the user’s point balance.

### 7.2 When does deduction happen?

Deduction runs in **ChatService** when processing a message (simple chat or pentest with tools):

1. **Resolve conversation and model**  
   The conversation’s model (or default) is loaded. Each **Model** has:
   - `pointsPer1kInputTokens`, `pointsPer1kOutputTokens`  
   or a **fixed cost per call** (if configured).

2. **Compute cost for the turn**  
   - If the model has a fixed cost: use that (in points).  
   - Otherwise:  
     `costPoints = (pointsPer1kInputTokens × inputTokens + pointsPer1kOutputTokens × outputTokens) / 1000`  
     (input/output token counts come from the LLM response or an estimate before the call).  
   Cost is rounded up to at least 1 point.

3. **Deduct points (when POINTS_ENABLED=true)**  
   - **PointsService.spendPoints(userId, costPoints, CHAT_USAGE, 'usage_events', …)** is called.  
   - Inside a transaction it:  
     - Locks the user’s **UserPointBalance** row.  
     - Checks balance ≥ cost; if not, throws “Insufficient points”.  
     - Appends a **PointLedger** row: `deltaPoints = -costPoints`, type SPEND, reason CHAT_USAGE.  
     - Decrements **UserPointBalance.balance** by `costPoints`.  
   So the **bot deducts credit** (points) at the time of that turn.

4. **Record usage for reporting**  
   A **UsageEvent** row is saved (userId, modelId, messageId, inputTokens, outputTokens, **costPoints**). This is used for admin dashboards and the “Credit”/usage display.  
   **PlanUsageService.recordStep(userId, conversationId, tokensThisStep)** is also called so **session** and **daily token usage** are updated (steps used, tokens used today). That feeds **GET /plans/me** (e.g. “Credit 0 / 250000” = tokens used today vs plan’s `tokens_per_day`).

So in short: **the bot deducts credit (points) when POINTS_ENABLED is true**, and **always** records token/step usage for plan quotas and the Credit display.

### 7.3 Where do credits (points) come from?

When the system uses points (`POINTS_ENABLED=true`), the user’s balance can increase from:

- **Signup** — A one-time grant (e.g. 10 points) on registration.
- **Subscription** — If a subscription has `monthlyPointsGrant` > 0, renewal can add points (subscription renewal flow).
- **Credit purchase** — If you have a credit-purchase flow, buying a pack adds points via **PointLedger** (reason CREDIT_PURCHASE) and increases **UserPointBalance**.

So: **subscription** (and optionally signup/purchase) **adds** credits; **the bot deducts** them when the user chats or runs a pentest.

### 7.4 Summary (credit deduction)

| What                | When POINTS_ENABLED=true     | When POINTS_ENABLED=false   |
|---------------------|-----------------------------|-----------------------------|
| Bot runs (chat/scan)| Deducts points from balance | No deduction                |
| Balance check       | Must have enough points     | N/A                         |
| Limits              | Plan limits still apply     | Plan limits only            |
| “Credit” in UI      | Plan token usage (used/limit)| Same (token usage only)     |
| Source of “credits” | Point balance (ledger)      | Plan quotas (tokens/day etc.)|

The **bot** is the part that **does the deduction**: whenever **ChatService** processes a message (simple or with tools), it computes cost from the model, calls **spendPoints** when points are enabled, and records **UsageEvent** + **recordStep** so usage and “Credit” (token usage vs plan) are always up to date.

---

## 8. Summary diagram (subscription only)

```
User on Pricing
    → Clicks "Subscribe with PayPal" (e.g. Pro)
    → POST /subscriptions/create (planId, returnUrl, cancelUrl)
    → Backend: create in PayPal + local Subscription (approval_pending)
    → Frontend: redirect to PayPal approvalUrl

User on PayPal
    → Approves
    → Redirect to returnUrl (?success=1&subscription_id=...)

Frontend (Pricing)
    → POST /subscriptions/complete (subscription_id)
    → Backend: activateFromPayPal → set User.planId, Subscription active, send email
    → Show success message

PayPal (async)
    → BILLING.SUBSCRIPTION.ACTIVATED → POST /webhooks/paypal
    → Backend: activateFromPayPal (idempotent)

PayPal (later)
    → BILLING.SUBSCRIPTION.CANCELLED (or SUSPENDED/EXPIRED) → POST /webhooks/paypal
    → Backend: cancelFromPayPal → Subscription cancelled, User.planId = FREE
```

Plan usage (limits, workers, scans/day, tokens) is always derived from **User.planId** via **PlanResolutionService.getUserPlan** and **getPlanDefinition**; subscription state is what updates that field.
