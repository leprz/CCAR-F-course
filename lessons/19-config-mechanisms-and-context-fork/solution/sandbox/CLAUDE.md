# Ledgerly

Order and billing API. TypeScript, Vitest. Full standards: CONVENTIONS.md.

## Commands
- `npm test` runs the test suite
- `npm run typecheck` runs tsc

## Money
- All amounts are integer cents (`...Cents`). Never use floating-point dollars.
- Round once, at the end of a calculation, with `roundHalfEven` from `src/utils/money.ts`.
- Tax is applied after discounts.
