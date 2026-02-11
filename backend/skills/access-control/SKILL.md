---
name: access-control
description: "Access control & logic — IDOR, privilege escalation, parameter tampering, multi-step logic flaws. PoC only; report_finding for each confirmed flaw; POC = steps + evidence."
---

# Access Control & Logic Flaw Skill

## Purpose

Identify and verify access control and business logic flaws: IDOR (tamper user/id to access other users' data), privilege escalation (admin functions with low-priv cookie), parameter tampering (price, quantity, discount), multi-step process logic flaws. **report_finding** required for each confirmed flaw.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "IDOR" or "access control" or "privilege escalation" to avoid duplicate testing.
- Identify object references (ids in URL/body), roles, and state-changing flows (checkout, multi-step forms).

## Vulnerability Classes

- **IDOR**: Tamper user/id/document id to access another user's resource.
- **Privilege escalation**: Access admin or elevated function with low-privilege session.
- **Parameter tampering**: Modify price, quantity, discount, or other business parameter (e.g. e‑commerce).
- **Logic flaw**: Bypass or abuse multi-step process (e.g. skip step, repeat step for gain).

## Detection Logic

1. **IDOR**: Enumerate object ids (e.g. /user/1, /order/123); with user A session, request user B's id; observe if data returned.
2. **Privilege escalation**: With low-priv session, request admin URL or action; observe if allowed.
3. **Parameter tampering**: Change price/quantity/discount in request; observe if server accepts and applies.
4. **Logic flaw**: Skip steps, replay steps, or reverse order in multi-step flow; observe outcome.

## Verification Logic

- **exec**(curl with tampered id/param or admin path with low-priv cookie) or **craft_payload** to send requests.
- Confirm when server returns other user's data, allows admin action, or applies tampered parameter.

## Confirmation Criteria

- Evidence of unauthorized access, escalation, or logic bypass. **report_finding** with **poc** = steps + evidence (request + response snippet).

## Proof Requirements (report_finding)

- **poc** must include: (1) steps (e.g. "As user A, GET /order/999 where 999 is user B's order"), (2) evidence (response with user B's data or 200 on admin action). Example: `Steps: GET /api/orders/456 with session of user A | Evidence: 200 + order belonging to user B`.

## Reporting Structure

- **detail**: IDOR / privilege escalation / parameter tampering / logic flaw, location, impact, steps to reproduce.
- **severity**: low / medium / high / critical (context-dependent).
- **target**: URL and parameter or endpoint.
- **poc**: Steps + evidence (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: areas tested (IDOR, escalation, tampering, logic), result per area (confirmed / not found), checklist progress "Access control: done".

## Safety Rules

- PoC only; access only test data or in-scope objects. No mass enumeration, no destructive parameter changes (e.g. set quantity to 0 or negative only if PoC and in scope).
- In-scope only.

## When to Escalate or Pivot

- If IDOR on reset token: see **auth** skill (password reset). **report_finding** in auth or access-control as appropriate.
- If logic flaw requires multiple sessions: use **sessions_spawn** / **sessions_send** if needed to simulate two users; document in poc.

---

## THINK

- Which endpoints use object ids (user, order, document)? Which require elevated role? Which have price/quantity/discount?
- Already tested (memory_search)? Retest only if new endpoints or user asked.

## ACT

1. **memory_search**(query: target + "IDOR" or "access control" or "privilege escalation", max_results: 10).
2. For IDOR: **exec**(curl with other id) or **craft_payload**; capture response; **report_finding** if confirmed.
3. For escalation: **exec**(curl admin URL with low-priv cookie); **report_finding** if confirmed.
4. For tampering: **exec**(curl with modified param); **report_finding** if confirmed.
5. For logic flaw: **exec** or **craft_payload** to replay/skip steps; **report_finding** if confirmed.
6. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Access control — IDOR: []; Escalation: []; Tampering: []; Logic: []. Checklist progress: Access control done.").

## OBSERVE

- Response body (other user's data), status code (200 on admin action), applied price/quantity.

## REFLECT

- Is proof in poc for each finding? If not, do not mark that item done.
- All access-control areas covered? Log and continue checklist.

## LOG

- **write_file** after testing: areas, result per area, checklist progress.
- **report_finding** for every confirmed access control or logic flaw before marking phase done.
