---
name: money-style
description: Ledgerly's style guide for writing money code. Use when writing or changing code that handles amounts.
context: fork
---

- Name every amount `...Cents` and keep it an integer.
- Do the whole calculation first, then call `roundHalfEven` exactly once.
- Format for display only at the edge, with `formatUsd`.
