import type { Options, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// TODO(1) is in starter/.mcp.json: it is committed to git and shared by the whole team. Fix what doesn't
// belong in a shared file: the literal credentials, and one server.

export type Scope = 'local' | 'project' | 'user';

/**
 * TODO(2): pick the Claude Code MCP scope.
 *  - shared with the team through version control?
 *  - private, but wanted in every project?
 *  - private, this project only?
 */
export function chooseScope(need: { sharedWithTeam: boolean; acrossAllProjects: boolean }): Scope {
  return need.acrossAllProjects ? 'user' : 'project';
}

/**
 * TODO(3): implement `.mcp.json` env expansion: `${VAR}` and `${VAR:-default}`.
 * An unset variable with no default stays in the text exactly as written and is reported in `missing`.
 */
export function expandEnv(value: string, env: Record<string, string | undefined>): { value: string; missing: string[] } {
  return { value: value.replace(/\$\{(\w+)\}/g, (_, name: string) => env[name] ?? ''), missing: [] };
}

export interface McpJson {
  mcpServers: Record<
    string,
    { type?: string; url?: string; command?: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string> }
  >;
}

/**
 * TODO(4): return `"<server>.<headers|env>.<key>"` for every header/env value that carries a literal
 * credential (a run of 16+ letters, digits, `_` or `-`) outside `${...}` references.
 * `"Bearer ${TOKEN}"` is fine; `"Bearer shp_live_8f3a…"` is not.
 */
export function findHardcodedSecrets(_config: McpJson): string[] {
  return [];
}

/**
 * TODO(5a): full MCP tool name as used in allowedTools: `mcp__<server>__<tool>`. Characters in the server
 * name outside letters, digits, `_` and `-` become `_` (`my.server` → `mcp__my_server__…`).
 */
export function mcpToolName(server: string, tool: string): string {
  return `${server}__${tool}`;
}

/**
 * TODO(5b): Agent SDK options for the shop server.
 *  - read the token from `env.SHOP_API_TOKEN`; throw a clear error if it is missing
 *  - grant exactly this server's tools with an allowedTools wildcard instead of bypassing permissions
 *  - ignore any `.mcp.json` on disk (there is an option for that)
 */
export function agentOptions(_env: Record<string, string | undefined>): Options {
  return {
    mcpServers: {
      shop: {
        type: 'http',
        url: 'https://mcp.shop.example.com/mcp',
        headers: { Authorization: 'Bearer shp_live_8f3a91c2d4e5b6a7f8091a2b3c4d5e6f' },
      },
    },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };
}

/** TODO(6a): verify discovery: which of the expected tools did the server NOT list? */
export async function missingTools(_client: Client, _expected: string[]): Promise<string[]> {
  return [];
}

/**
 * TODO(6b): from the SDK `system/init` message, return the servers that will not work.
 * Careful: `pending` is not a failure.
 */
export function unavailableServers(init: Pick<SDKSystemMessage, 'mcp_servers'>): string[] {
  return init.mcp_servers.filter((s) => s.status !== 'connected').map((s) => s.name);
}
