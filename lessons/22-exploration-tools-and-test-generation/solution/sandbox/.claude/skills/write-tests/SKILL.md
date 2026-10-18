---
name: write-tests
description: Write behavioural Vitest tests for a Ledgerly function, following the project's test conventions.
argument-hint: "<function name> <source file>"
allowed-tools: Read, Grep, Glob, Bash(cat tests/*)
---

Write Vitest tests for `$0` in `$1`.

Existing tests: match their style, and reuse the `makeOrder()` / `makeLine()` factories they define.

```!
cat tests/orderRepository.spec.ts.txt tests/billingService.spec.ts.txt
```

Project test conventions:

```!
sed -n '/^## Tests/,/^## /p' CONVENTIONS.md
```

What counts as a meaningful test:
- It fails when the behaviour is wrong. Assert exact expected values (cents) that you computed by hand from the
  business rules, not values copied from running the code.
- Cover the business rules and edge cases: tax after discount, rounding once at the end, discount larger than the
  subtotal, several lines, zero tax.
- Do NOT write tests whose only assertions are `toBeDefined`, `toBeTruthy`, `typeof` checks, `not.toThrow`, or
  mock call counts.

Write the file next to the existing tests, run `npm test` on it, and report which tests fail against the current
code and why (a failing test may have found a real bug; do not change the expected values to make it pass).
