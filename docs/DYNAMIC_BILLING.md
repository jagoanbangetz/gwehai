# Dynamic Billing (Credits & Admin-Managed Config)

This document describes the **admin-configurable billing system** where credits are deducted based on input/output tokens, plan rules, and model pricing. It is additive to the plan and subscription flow (see [PLAN_AND_SUBSCRIPTION_FLOW.md](PLAN_AND_SUBSCRIPTION_FLOW.md)).

## Overview

- **Credits** are computed from provider cost (USD), plan markup, op-type and model multipliers, then converted to credits via `creditUsd` (USD per credit).
- **Models and pricing** are stored in `llm_models`; **billing policy** in `billing_policies`; **plan rules** (allowed models, caps, multipliers) in `plan_billing_rules`.
- A **versioned snapshot** (`billing_config_state.version`) is used so each job/run uses a consistent config; when admin updates any config, the version is incremented and the in-memory cache is cleared.

## Data model

- **llm_models**: `key`, `provider`, `enabled`, `supportsPromptCache`, `priceInPer1M`, `priceOutPer1M`, `priceCachedInPer1M`, `toolCallFeeUsd`, `minCostCredits`.
- **billing_policies**: One active row; `creditUsd`, `defaultRetryFactor`, `defaultPlatformFeeUsd`, `minCreditsPerOp` (JSON).
- **plan_billing_rules**: One row per plan (FREE, PRO, PRO_PLUS, ULTRA); `planMarkup`, `maxCreditsPerRun`, `maxTokensPerRun`, `maxStepsPerRun`, `allowedModels`, `opMultipliers`, `modelMultiplierOverrides`, etc.
- **billing_config_state**: Single row with `version`; incremented on any config change.

## Cost formula

- **Provider cost (USD)** = `retryFactor * ((missIn/1e6)*priceIn + (cachedIn/1e6)*priceCachedIn + (out/1e6)*priceOut) + toolFee`.
- **Billable USD** = `providerCost * planMarkup * opMultiplier * modelMultiplier + platformFee`.
- **Credits** = `max(minCreditsPerOp[opType], ceil(billableUsd / creditUsd))`, then capped by `maxCreditsPerRun` (per run).

## Reserve → settle

When **POINTS_ENABLED** is true and dynamic billing config is available:

1. **Reserve**: Before the LLM call, estimate output tokens and compute credits; call `PointsService.reserveCredits(userId, amount, messageId)`. If balance is insufficient, the request is rejected (Insufficient points).
2. **Settle**: After the LLM response, compute actual credits; call `PointsService.settleCredits(userId, messageId, reservedAmount, actualCredits)`. This refunds or charges the difference. Idempotent per `messageId` (one settlement per refId).

## Admin API

- **GET /api/admin/billing/config** — Returns current snapshot (version, policy, models, planRules). Admin auth required.
- **PUT /api/admin/billing/models** — Bulk update model fields (enabled, pricing, etc.). Increments config version.
- **PUT /api/admin/billing/policy** — Update active policy (creditUsd, retryFactor, platformFee, minCreditsPerOp). Increments config version.
- **PUT /api/admin/billing/plan-rules** — Update rules per plan. Increments config version. Validation: allowedModels must reference existing model keys; caps positive; creditUsd > 0; minCreditsPerOp has required ops.

## Admin UI

**Admin → Billing** has two main tabs:

1. **PayPal & pricing** — Existing PayPal subscription and plan price settings.
2. **Credits & models** — Sub-tabs:
   - **Models**: List LLM models with enabled toggle and pricing inputs; Save calls PUT models.
   - **Plan rules**: Per plan (FREE, PRO, PRO_PLUS, ULTRA): markup, caps, allowed models (comma-separated keys); Save calls PUT plan-rules.
   - **Policy**: creditUsd, default retry factor, platform fee, min credits per op; Save calls PUT policy.

On save, the config version is shown and a success message is displayed.

## Integration with ChatService

- **processMessage** (single-turn chat): When POINTS_ENABLED and billing config is available, uses dynamic billing: get snapshot, resolve model for plan, reserve (estimated credits), call LLM, settle (actual credits), create UsageEvent with actual cost. Otherwise falls back to legacy (Model entity points per 1k).
- **processMessageWithTools** (pentest): Legacy cost path remains; plan usage (recordStep) is unchanged. Optional future: reserve/settle per agent step using the same CostCalculator and snapshot.

## Consistency per job

- **pentest_jobs.billingConfigVersion** stores the config version at job start so cost calculation can remain consistent for the duration of the run. BillingConfigService caches the snapshot in memory and reloads when the version changes.
