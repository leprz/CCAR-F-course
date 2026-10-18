---
name: migrate-tests
description: Migrate the test suite from Jest to Vitest in reviewed phases.
disable-model-invocation: true
---

Migrate the test suite from Jest to Vitest. Work in phases and stop at every checkpoint.

## Phase 1: Explore
List every test file and every Jest API in use (`jest.fn`, `jest.mock`, timers, snapshots). Write the list
to `migration/inventory.md`. Do not edit any test file.

**Checkpoint:** show the inventory and a migration plan, then stop and wait for approval.

## Phase 2: Pilot
Migrate 3 representative files. Run `npm test` on them.

**Checkpoint:** show the diff and the test output, then stop and wait for approval.

## Phase 3: Batches
Migrate the remaining files in batches of 20. After each batch, run the tests and append the batch result to
`migration/progress.md`, so an interrupted run can resume from the last completed batch.

## Phase 4: Verify
Run the full suite and `npm run typecheck`. Report remaining failures. Do not commit; a human reviews the result.
