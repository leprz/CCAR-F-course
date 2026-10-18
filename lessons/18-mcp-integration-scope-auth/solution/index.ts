import type { Options, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export type Scope = 'local' | 'project' | 'user';

/**
 * project: committed `.mcp.json`, the whole team gets it (with an approval prompt on first use).
 * user:    `~/.claude.json`, private to you, loads in every project.
 * local:   `~/.claude.json` under this project's path, private, this project only (the default).
 */
export function chooseScope(need: { sharedWithTeam: boolean; acrossAllProjects: boolean }): Scope {
  if (need.sharedWithTeam) return 'project';
  if (need.acrossAllProjects) return 'user';
  return 'local';
}

/**
 * `.mcp.json` expansion rules: `${VAR}` takes the variable; `${VAR:-default}` falls back to the default.
 * An unset variable with no default does NOT fail the load: the text stays as written and
 * `claude mcp list` warns, so report it as missing.
 */
export function expandEnv(value: string, env: Record<string, string | undefined>): { value: string; missing: string[] } {
  const missing: string[] = [];
  const expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name: string, fallback?: string) => {
    const set = env[name];
    if (set !== undefined) return set;
    if (fallback !== undefined) return fallback;
    missing.push(name);
    return whole;
  });
  return { value: expanded, missing };
}

export interface McpJson {
  mcpServers: Record<
    string,
    { type?: string; url?: string; command?: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string> }
  >;
}

const TOKEN_LIKE = /[A-Za-z0-9_-]{16,}/;

/** Paths of header/env values that carry a literal credential instead of a `${VAR}` reference. */
export function findHardcodedSecrets(config: McpJson): string[] {
  const hits: string[] = [];
  for (const [name, server] of Object.entries(config.mcpServers)) {
    for (const field of ['headers', 'env'] as const) {
      for (const [key, value] of Object.entries(server[field] ?? {})) {
        const literalPart = value.replace(/\$\{[^}]*\}/g, '');
        if (TOKEN_LIKE.test(literalPart)) hits.push(`${name}.${field}.${key}`);
      }
    }
  }
  return hits;
}

/** `mcp__<server>__<tool>`; characters outside letters, digits, `_` and `-` in the server name become `_`. */
export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__${tool}`;
}

/**
 * Agent SDK options for the shop server. The credential comes from the environment and is checked up
 * front. MCP access is granted with an allowedTools wildcard for exactly this server, not with
 * bypassPermissions. strictMcpConfig ignores whatever `.mcp.json` happens to be on disk.
 */
export function agentOptions(env: Record<string, string | undefined>): Options {
  const token = env.SHOP_API_TOKEN;
  if (!token) throw new Error('SHOP_API_TOKEN is not set: export it before starting the agent.');
  return {
    mcpServers: {
      shop: {
        type: 'http',
        url: env.SHOP_MCP_URL ?? 'https://mcp.shop.example.com/mcp',
        headers: { Authorization: `Bearer ${token}` },
      },
    },
    allowedTools: [mcpToolName('shop', '*')],
    strictMcpConfig: true,
  };
}

/** Tool discovery check: which expected tools did `tools/list` NOT return? */
export async function missingTools(client: Client, expected: string[]): Promise<string[]> {
  const { tools } = await client.listTools();
  const found = new Set(tools.map((t) => t.name));
  return expected.filter((name) => !found.has(name));
}

/** From the SDK init message: servers that will not work. `pending` is not a failure (still connecting / cached). */
export function unavailableServers(init: Pick<SDKSystemMessage, 'mcp_servers'>): string[] {
  return init.mcp_servers.filter((s) => s.status === 'failed' || s.status === 'needs-auth').map((s) => s.name);
}
