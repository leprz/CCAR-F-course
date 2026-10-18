# Ledgerly conventions

These are the project standards. Reviewers must apply them, and must **not** flag what they explicitly allow.

## Money
- All amounts are **integer cents** (`number`, named `...Cents`). Never use floating-point dollars in calculations.
- Round **once**, at the end of a calculation, using `roundHalfEven` from `src/utils/money.ts`.
- Tax is applied **after** discounts.

## Data access
- SQL goes through `Db.query(sql, params)` with `$1, $2…` placeholders. String-building SQL with user input is forbidden.
- Repositories return domain objects, never raw rows.
- Pagination is `page` (1-based) + `pageSize` (max 100).

## HTTP API
- Resource-oriented routes: `GET/POST /orders`, `GET/PATCH/DELETE /orders/:id`. No verbs in paths.
- Every error response uses `httpError(status, code, message)`, giving the shape `{ "error": { "code", "message" } }`.
- Every route that reads or changes customer data must call `authorize(principal, customerId)` first.

## Secrets & config
- Secrets come from environment variables via `src/config.ts`. Never commit literal secrets.

## Accepted patterns (do NOT flag)
- `src/legacy/**` may use `any` and `as any`. It is frozen code scheduled for deletion.
- `src/utils/logger.ts` swallows its own errors in an empty `catch` marked `// best-effort`. Logging must never crash a request.
- `Math.random()` is fine for **non-security** ids such as request/correlation ids.
- `console.log` is allowed **only** inside `src/utils/logger.ts`.
- Admin principals (`role: "admin"`) may read any customer's data; `authorize` already handles this.

## Tests
- Vitest, one `describe` per exported function, fixtures built with `makeOrder()` / `makeLine()` factories.
- Test behaviour (totals, errors, edge cases), not implementation details. Don't assert on mock call counts unless the call is the behaviour.
