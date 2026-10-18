---
paths:
  - "tests/**"
---

# Test rules

- One `describe` per exported function.
- Build fixtures with the `makeOrder()` / `makeLine()` factories.
- Assert on behaviour (totals, errors, edge cases), not on implementation details.
