---
name: money-audit
description: Audit the whole Ledgerly codebase for floating-point money math and rounding mistakes. Use when asked to check money handling.
---

Search every file under `src/` for money calculations. Flag:
- arithmetic on dollar floats instead of integer cents
- rounding more than once in one calculation, or with `Math.round` instead of `roundHalfEven`
- tax computed before discounts

Report a table: file, line, problem, suggested fix. Do not edit files.
