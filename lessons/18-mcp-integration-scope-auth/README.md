# L18 — MCP integration: scope, env-var auth, tool discovery

**Objective:** O35 (pick the server scope, configure auth through env-var expansion, verify tool discovery)
**Scenario:** the support team wires the `shop` (HTTP) and `tickets` (stdio) MCP servers into Claude Code and into an Agent SDK service
**Read first:** [Part 7 lecture](../../teach-me/lectures/07-mcp/lecture.md), sections 4–6 (*Where should a server's configuration live?*, *How do you keep credentials out of the configuration?*, *How do you know the tools actually arrived?*)

## Situation

Someone committed `.mcp.json` with live tokens in it, plus their own personal notes server. The Agent SDK service connects
with `bypassPermissions` and a hard-coded token. Nobody checks whether the servers actually connected, so when the token
expires the agent quietly falls back to its built-in tools.

> The `.mcp.json` files in `starter/` and `solution/` are lesson fixtures that the tests parse. Claude Code only reads
> `.mcp.json` from a project root, so these files don't configure this repo.

## Your task

1. `starter/.mcp.json`: replace the literal credentials with `${VAR}` references, and remove the personal server (it belongs in local or user scope).
2. `chooseScope`: choose between project, user and local.
3. `expandEnv`: implement `${VAR}` and `${VAR:-default}`. An unset variable with no default stays as written and is reported.
4. `findHardcodedSecrets`: flag literal tokens in `headers` and `env`.
5. `mcpToolName` and `agentOptions`: build `mcp__<server>__<tool>` names, read the token from the environment (fail fast if it's missing),
   grant access with `allowedTools: ['mcp__shop__*']` instead of `bypassPermissions`, and set `strictMcpConfig`.
6. `missingTools` and `unavailableServers`: verify discovery through `tools/list`, and read the SDK init message, where `pending` is not a failure.

```bash
npx vitest lessons/18
SOLUTION=1 npx vitest run lessons/18
npm run test:live -- lessons/18     # Agent SDK session with an in-process SDK MCP server
```

Related CLI commands (the lecture covers them):
`claude mcp add --transport http shop --scope project https://…` (writes to `.mcp.json`), `claude mcp list` (health and
missing-variable warnings), `claude mcp get shop`, and `/mcp` inside a session.
