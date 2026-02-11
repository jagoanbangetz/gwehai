---
name: logic-flaw
description: "Business logic flaws — multi-step bypass, parameter tampering, race condition, replay. PoC only; report_finding with steps + evidence."
---

# Logic Flaw Skill

## Purpose

Test business logic flaws: multi-step process bypass (skip step, reorder, repeat for gain), parameter tampering (price, quantity, discount, coupon), race conditions (double spend, double redeem), replay (reuse token or request). PoC only; no destructive outcome (e.g. tamper to minimal value or test coupon).

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "logic flaw" or "parameter tampering" or "race") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Identify multi-step flows and parameters (checkout, coupon, transfer, redeem) from recon or ui-flow HAR.

## Inputs

- **target URL** (base URL and endpoints for flow).
- **Optional**: session cookies (from auth-journey or post-login-acl) for authenticated flows.
- **Optional**: list of steps and parameters from recon (e.g. step1=cart, step2=payment, param=amount).

## Workflow

### THINK

- Which flows are multi-step (cart → payment → confirm)? Which parameters affect outcome (price, quantity, discount, coupon, step)?
- Already tested (memory_search)? Retest only new flow or if user asked.
- Is target in SCOPE? PoC must use harmless values (e.g. price=0.01, quantity=1; no real transfer).

### ACT

1. **memory_search**(query: target + "logic flaw" or "parameter tampering", max_results: 10).
2. **Multi-step bypass**: **exec**(curl) to submit step N without completing step N-1 (e.g. POST /checkout/confirm without POST /checkout/payment). **report_finding** if server accepts and state changes.
3. **Parameter tampering**: **exec**(curl -X POST -d "price=0.01&quantity=1" CHECKOUT_URL) or modify discount/coupon in request. **report_finding** if server applies tampered value (only PoC: minimal price or test coupon).
4. **Race condition**: **craft_payload** to send two identical requests (e.g. redeem coupon) in parallel; **exec** or **craft_payload** (2 concurrent curl). **report_finding** if both succeed (double redeem). No mass parallel requests; 2 only for PoC.
5. **Replay**: Reuse same token or request (e.g. payment token, reset token) in second request; **exec**(curl) twice with same body. **report_finding** if second request succeeds when it should be invalidated.
6. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: Logic flaw — bypass: []; tampering: []; race: []; replay: []. Tested vectors: [list].").

### OBSERVE

- Response status and body (success, error "step required", "already used"); actual state (e.g. order total, coupon usage count).

### REFLECT

- Is proof in poc (steps performed + request + response showing flaw)? If not, do not mark done.
- Only PoC (minimal price, test coupon, 2 parallel requests max); no real payment or real asset transfer.

### LOG

- **write_file**: "Tested vectors: [flow, vector type, request, result]. Checklist progress: Logic flaw — done."
- **report_finding** for every confirmed logic flaw before marking phase done.

## Confirmation criteria

- **Bypass**: Server accepts step out of order or skips required step and state changes.
- **Tampering**: Server applies client-supplied price/discount/quantity that should be server-side.
- **Race**: Two concurrent identical requests both succeed (e.g. coupon redeemed twice).
- **Replay**: Reused token or request succeeds when it should be one-time.

## Proof requirements

- **poc**: Steps (e.g. "POST /confirm without /payment") + request (method, URL, body) + response (status, body excerpt).
- **evidence**: Response snippet or HAR; for race include timing (two requests, both 200).

## Tool calls guidance

- **exec**: `curl -s -X POST -b cookies.txt -d "step=confirm" "https://target.com/checkout"` — skip payment step.
- **exec**: `curl -s -X POST -b cookies.txt -d "amount=0.01" "https://target.com/pay"` — tamper amount (PoC only).
- **craft_payload**: Two concurrent curl (e.g. node Promise.all or bash &) for race; 30s max. **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429, WAF, or lockout; log and continue. **PoC only**: minimal price (0.01), test coupon, 2 parallel requests; no real payment, no real asset transfer.
- **In-scope only**.

## Output fields for report_finding

- **title**: `Logic flaw — [issue]` (e.g. "Logic flaw — Checkout step bypass").
- **severity**: high/critical for payment/transfer flaws; medium for coupon/step bypass; low for minor tampering.
- **target**: Full URL and flow name.
- **description**: Flaw type, steps to reproduce, impact.
- **poc**: Steps + request + response.
- **evidence**: Response snippet or HAR.
