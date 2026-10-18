# Ledgerly

Order and billing API. TypeScript, Vitest.

## Commands
- `npm test` runs the test suite
- `npm run typecheck` runs tsc

## Money
- All amounts are integer cents (`...Cents`). Never use floating-point dollars.
- Round once, at the end of a calculation, with `roundHalfEven` from `src/utils/money.ts`.
- Tax is applied after discounts.

## HTTP routes (src/routes)
- Resource-oriented routes only. No verbs in paths: use `DELETE /orders/:id`, not `POST /orders/:id/delete`.
- Every error response uses `httpError(status, code, message)`.
- Every route that reads or changes customer data calls `authorize(principal, customerId)` first.

## Tests (tests/)
- One `describe` per exported function.
- Build fixtures with the `makeOrder()` / `makeLine()` factories.

## Release procedure
1. Make sure main is green.
2. Bump the version in package.json (semver: breaking = major).
3. Collect merged PR titles since the last tag.
4. Write release notes grouped by Features / Fixes / Internal.
5. Commit "release: vX.Y.Z".
6. Tag `vX.Y.Z` and push the tag.
7. Post the notes in #releases.

## IMPORTANT
- NEVER read `.env` or `.env.*` files. They contain live credentials.
- NEVER edit anything under `migrations/`. Migrations are generated.
- ALWAYS run `npx prettier --write <file>` after editing a file.
