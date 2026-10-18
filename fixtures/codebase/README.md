# fixtures/codebase: "Ledgerly" order and billing API

A small TypeScript HTTP service used as the review and exploration target in Part 4 (context management) and
Part 8 (Claude Code review and exploration). It is **deliberately buggy**. `ISSUES.md` is the answer key, so keep it out of
any prompt you're evaluating, because a reviewer that reads it is cheating.

Layout:

```
CONVENTIONS.md            project standards (the "persistent context" for reviews)
ISSUES.md                 answer key: seeded issues + accepted patterns
src/config.ts             env/config
src/db.ts                 Db interface (parameterised queries)
src/http.ts               tiny router types + standard error helper
src/auth.ts               request principal + authorisation helper
src/repositories/orderRepository.ts
src/repositories/invoiceRepository.ts
src/services/billingService.ts
src/services/orderService.ts
src/routes/orders.ts
src/routes/invoices.ts
src/utils/money.ts
src/utils/logger.ts
src/legacy/csvExport.ts   legacy module (relaxed rules, see CONVENTIONS.md)
tests/*.spec.ts.txt       existing tests (".txt" so the repo's vitest/tsc ignore them)
```

The source compiles under the repo's strict `tsconfig.json`. All seeded bugs are logic, security or API-design bugs,
not type errors.
