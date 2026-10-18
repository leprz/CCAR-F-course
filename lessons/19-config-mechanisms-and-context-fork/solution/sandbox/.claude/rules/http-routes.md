---
paths:
  - "src/routes/**/*.ts"
---

# HTTP route rules

- Resource-oriented routes only. No verbs in paths: use `DELETE /orders/:id`, not `POST /orders/:id/delete`.
- Every error response uses `httpError(status, code, message)`, giving `{ "error": { "code", "message" } }`.
- Every route that reads or changes customer data calls `authorize(principal, customerId)` first.
