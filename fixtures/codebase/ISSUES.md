# Answer key: seeded issues in Ledgerly

**Do not include this file in any prompt you're evaluating.** IDs are stable; lessons and graders refer to them.

| ID | Category | Severity | Location | Issue | Violates |
|----|----------|----------|----------|-------|----------|
| SEC-1 | security | high | `src/config.ts` `loadConfig` | Literal live-looking payments key used as a fallback when `PAYMENTS_API_KEY` is unset | Secrets & config |
| SEC-2 | security | critical | `src/repositories/orderRepository.ts` `findByCustomer` | SQL built by string concatenation; `status` comes straight from the query string (SQL injection) | Data access |
| SEC-3 | security | high | `src/routes/orders.ts` `GET /orders/:id` + `OrderService.getOrder` | No `authorize` call: any customer can read any order by id (IDOR) | HTTP API (authorize first) |
| BIZ-1 | business-logic | high | `src/services/billingService.ts` `computeTotals` | Per-line rounding through a tax-inclusive round-trip produces fractional-cent subtotals; must round once at the end | Money |
| BIZ-2 | business-logic | high | `src/services/billingService.ts` `computeTotals` | Tax is computed on the pre-discount subtotal; tax must be applied after discounts | Money |
| BIZ-3 | business-logic | medium | `src/repositories/orderRepository.ts` `list` | `offset = page * size` with 1-based pages skips the first page (off-by-one) | Data access (pagination) |
| API-1 | api-design | medium | `src/routes/orders.ts` `GET /orders/:id` | 404 returns `{ message }` instead of the standard `httpError` shape | HTTP API (error shape) |
| API-2 | api-design | medium | `src/routes/orders.ts` `POST /orders/:id/delete` | Verb in path; should be `DELETE /orders/:id` | HTTP API (resource routes) |
| API-3 | api-design | low | `src/routes/orders.ts` `POST /orders/:id/invoice` | Every non-403 error is reported as 404 `order_not_found`, which masks server errors | HTTP API (error shape) |

## Accepted patterns: flagging these is a FALSE POSITIVE

| ID | Location | Looks like | Why it's fine |
|----|----------|-----------|---------------|
| OK-1 | `src/legacy/csvExport.ts` | `any` / `as any` | Legacy code may use `any` (CONVENTIONS.md) |
| OK-2 | `src/utils/logger.ts` `log` | Empty `catch` | Marked `// best-effort`; logging must never crash a request |
| OK-3 | `src/utils/logger.ts` `requestId` | `Math.random()` for an id | Non-security correlation id |
| OK-4 | `src/utils/logger.ts` | `console.log` | Allowed only in the logger |
| OK-5 | `src/auth.ts` `authorize` | Admin bypass of the customer check | Admins may read any customer's data |
| OK-6 | `src/services/billingService.ts` `splitInstalments` | Last instalment differs from the others | Intentional: the remainder goes on the last part so the parts sum to the total (tested) |

## Coverage gaps (for test-generation lessons)
- `computeTotals` has no tests (BIZ-1/BIZ-2 would be caught by behavioural tests on totals with discount + tax).
- `OrderRepository.list` has no pagination test (BIZ-3).
