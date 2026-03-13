# Plan & pricing profitability analysis

This doc uses the **current** plan prices and cost structure in the codebase to estimate whether the model is profitable and rough profit per plan. Adjust for your real usage mix and infra.

---

## 1. Revenue (current)

| Plan       | Price/mo | Source                    |
|-----------|----------|---------------------------|
| FREE      | $0       | —                         |
| PRO       | $19      | PayPal subscription       |
| PRO_PLUS  | $49      | PayPal subscription       |
| ULTRA     | $99      | PayPal subscription       |

Optional: **credit packs** (e.g. $20 → 100 points). Revenue depends on admin-defined packs and how much users buy.

---

## 2. Costs

### 2.1 LLM (from `cost-manager.service.ts` – approximate $ per 1M tokens)

| Provider  | Input   | Output  |
|-----------|---------|---------|
| DeepSeek  | $0.14   | $0.28   |
| OpenAI    | $2.50   | $10.00  |
| Anthropic | $3.00   | $15.00  |

Actual cost can come from DB (`Model.pointsPer1kInputTokens` / `pointsPer1kOutputTokens`) or dynamic billing (`llm_models.priceInPer1M`, `priceOutPer1M`). Admin shows cost in USD using **POINTS_TO_USD = 0.0001** (10,000 cost points = $1).

### 2.2 Other

- **PayPal**: ~2.9% + $0.30 per transaction (subscription).
- **Infra**: Hosting, DB, pentest-tools, etc. (you need your own numbers).

---

## 3. Is it profitable?

It **can be**, depending on:

1. **Usage mix** (DeepSeek vs OpenAI vs Claude).
2. **Whether POINTS_ENABLED** and how points map to tokens and to revenue (packs vs included in plan).
3. **How much each plan actually uses** (limits vs real usage).

### 3.1 Subscription-only, usage = LLM cost (no points)

Assume **all usage is DeepSeek** and users hit a **fraction of their token limit**:

- **PRO** ($19/mo): e.g. 1M input + 0.3M output/month → cost ≈ 0.14 + 0.084 ≈ **$0.22** → **~$18.78** margin before PayPal and infra.
- **PRO_PLUS** ($49/mo): e.g. 3M input + 1M output → cost ≈ 0.42 + 0.28 ≈ **$0.70** → **~$48.30** margin before PayPal and infra.
- **ULTRA** ($99/mo): e.g. 10M input + 3M output → cost ≈ 1.40 + 0.84 ≈ **$2.24** → **~$96.76** margin before PayPal and infra.

So with **subscription-only** and **mostly DeepSeek**, the **plan structure is profitable** per user; profit is **revenue minus LLM cost, PayPal, and infra**.

If a large share of usage is **OpenAI or Claude**, cost per token is much higher (e.g. 10–50× DeepSeek). Then you need either:

- higher prices, or  
- limits / caps so heavy high-cost usage is bounded.

### 3.2 When POINTS_ENABLED = true

- Users have a **point balance**; usage **deducts points** (and optionally plan is derived from balance).
- Revenue = **subscriptions** + **credit pack purchases** (e.g. $20 for 100 points).
- “Cost” in the app is in **cost points** (admin shows cost in USD with POINTS_TO_USD = 0.0001).

Profitability then depends on:

- **Price per point** (e.g. $20 / 100 = $0.20 per point).
- **How many tokens (or USD cost) one point represents** (model `pointsPer1kInput` / `pointsPer1kOutput` and/or dynamic billing).
- If **1 point** ≈ **$0.0001** of LLM cost, then $0.20 per point is a **~2000× markup** on cost — very profitable as long as most usage is cheap models and you’re not giving away huge point allocations with plans.

So: **the plan method can be profitable**; **how much profit** depends on real usage and how you set points vs cost.

---

## 4. Rough profit summary (subscription, no points, 100% DeepSeek)

| Plan      | Revenue/mo | Example LLM cost/mo | Margin (before PayPal & infra) |
|-----------|------------|----------------------|---------------------------------|
| PRO       | $19        | ~$0.20–$2           | ~$17–$19                        |
| PRO_PLUS  | $49        | ~$0.70–$5           | ~$44–$48                        |
| ULTRA     | $99        | ~$2–$15             | ~$84–$97                        |

- **Lower cost** = light usage (small fraction of token limits).
- **Higher cost** = heavy usage (close to plan limits).
- **PayPal**: subtract ~3% + $0.30 per subscription.
- **Infra**: subtract your monthly cost and divide by number of users to get per-user cost.

**Conclusion:** With current prices and mostly DeepSeek usage, the **plan model is profitable**; profit per user is in the **$17–$97/month range** before PayPal and infra. If usage shifts to expensive models, consider higher prices, stricter limits, or point-based pricing (POINTS_ENABLED) with a healthy markup on points.
