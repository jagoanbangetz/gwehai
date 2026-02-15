---
name: add-skill
description: "Add a new skill so the agent can reuse it later. Use add_skill when you need a reusable procedure that is not in the built-in skills (e.g. custom recon step or tool workflow)."
---

# Add Skill Skill

## Purpose

When you need a **reusable procedure or checklist** that does not exist in the built-in skills (e.g. a custom recon step, a GraphQL testing flow, or a tool-specific workflow), you can **add a new skill** with **add_skill**. The skill is stored under **skills/custom/** and can be loaded later with **memory_get(path: "skills/custom/<name>/SKILL.md")**.

## When to Use

- You have a repeated workflow (e.g. "how I test GraphQL endpoints") that you want to reuse in this or future runs.
- The built-in skills (recon, sqli, xss, etc.) do not cover a specific technique or tool you use often.
- The user asks you to "remember this procedure" or "add a skill for X".

## Tool: add_skill

- **name** (required): Short slug for the skill (e.g. `graphql-checks`, `my-recon-step`). Will be lowercased and sanitized (alphanumeric, hyphen, underscore).
- **content** (required): Markdown content of the skill: purpose, when to use, steps, examples. Same style as other SKILL.md files (Purpose, Preconditions, Steps, Safety).
- **description** (optional): One-line description for the skill index.

After a successful call, the backend returns the path (e.g. `skills/custom/graphql-checks/SKILL.md`). Load it later with **memory_get(path: "skills/custom/<name>/SKILL.md")**.

## Steps

1. **Decide the skill name** — e.g. `custom-graphql` or `auth-bypass-checks`.
2. **Write the content** — Markdown with: Purpose, When to use, Preconditions (scope, memory), Steps (numbered), Safety, and optionally Proof/Reporting if it leads to **report_finding**.
3. **Call add_skill** with **name**, **content**, and optionally **description**.
4. **Use the skill** — In the same or a later turn, **memory_get(path: "skills/custom/<name>/SKILL.md")** to load it, then follow the steps.

## Safety

- **add_skill** only writes under **skills/custom/**. It cannot overwrite core skills (recon, sqli, etc.).
- Keep content focused and safe: no destructive or out-of-scope actions. Follow the same safety rules as other skills (scope, PoC only, **report_finding** when confirming vulns).

## Example

- Add a skill for GraphQL introspection checks:
  - **name**: `graphql-introspection`
  - **content**: Purpose: Check GraphQL endpoints for introspection enabled. Steps: 1) Send `{"query": "{ __schema { types { name } } }"}` to the GraphQL endpoint. 2) If types are returned, document and report_finding with detail and poc. Safety: In-scope only.
  - **description**: "GraphQL introspection check — detect enabled introspection and report."

Then later: **memory_get(path: "skills/custom/graphql-introspection/SKILL.md")** and run the steps.
