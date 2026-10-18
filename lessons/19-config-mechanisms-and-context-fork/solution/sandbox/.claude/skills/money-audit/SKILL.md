---
name: money-audit
description: Audit the whole Ledgerly codebase for floating-point money math and rounding mistakes. Use when asked to check money handling.
context: fork
agent: Explore
---

You are auditing the Ledgerly codebase (TypeScript, under `src/`) for money-handling bugs. You have no
prior conversation context: everything you need is here.

Project rules (from CONVENTIONS.md):
- All amounts are integer cents. Floating-point dollar arithmetic is a bug.
- Round once, at the end of a calculation, with `roundHalfEven` from `src/utils/money.ts`.
- Tax is applied after discounts.
- `src/legacy/**` is frozen; report findings there as "legacy, informational".

Steps:
1. Find money code: grep for `Cents`, `roundHalfEven`, `Math.round`, `toFixed`, `taxRate`, `discount`.
2. Read only the functions that match, not whole directories.
3. Do not edit files.

Return a Markdown table with columns: file, line, problem, rule violated, suggested fix.
Return "No findings" if there are none.
