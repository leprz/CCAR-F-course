# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Team servers in **project** scope (`.mcp.json`, committed) | Everyone gets the same servers through version control. Claude Code asks each person to approve project servers before first use. | "The whole team needs the same server" → project scope / `.mcp.json` |
| Personal server out of `.mcp.json` → **local** (default) or **user** scope | Both are stored in `~/.claude.json` and private. Local covers this project only; user covers every project. | "Only I need it, in all my projects" → user. "Only me, only here, experimenting" → local |
| `"Authorization": "Bearer ${SHOP_API_TOKEN}"`, `"env": {"KEY": "${KEY}"}` | `.mcp.json` expands `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url` and `headers`. Secrets stay in each developer's environment, not in git. | O35: "configure authentication via environment variable expansion" |
| An unset variable without a default is reported, not fatal | Claude Code still loads the config, keeps the `${VAR}` text, and warns in `claude mcp list`. Missing tokens show up as auth failures, so check for them. | Diagnosing "server connected but every call is 401" |
| `allowedTools: ['mcp__shop__*']`, no `bypassPermissions` | MCP tools need explicit permission. A wildcard grants exactly one server. `acceptEdits` doesn't cover MCP, and `bypassPermissions` is far broader than needed. | Least-privilege questions |
| `strictMcpConfig: true` | The SDK service uses only the servers passed in code, not whatever `.mcp.json` is on the machine. That makes it reproducible. | "Agent behaves differently on CI vs a laptop" |
| Fail fast when the token is missing | Better than starting an agent that quietly loses the server's tools. | Reliability |
| Check `tools/list` and the init message's `mcp_servers` | Verify discovery: did the expected tools appear, and is any server `failed` or `needs-auth`? `pending` can just mean "still connecting" or "cached tool list". | O35: "verifying tool discovery" |

Precedence when the same server name is defined twice: local > project > user > plugin > claude.ai connectors. The
whole entry from the winning source is used, and fields aren't merged across scopes.
