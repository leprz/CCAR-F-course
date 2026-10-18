import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadLesson, lessonTarget } from '../../lib/lesson.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpJson = JSON.parse(readFileSync(path.join(here, lessonTarget(), '.mcp.json'), 'utf8')) as import('./solution/index.ts').McpJson;

describe('TODO(1) the committed .mcp.json is safe to share', () => {
  it('contains no literal credentials: headers and env use ${VAR}', () => {
    const values = Object.values(mcpJson.mcpServers).flatMap((s) => [
      ...Object.values(s.headers ?? {}),
      ...Object.values(s.env ?? {}),
    ]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toMatch(/\$\{[A-Z_]+(:-[^}]*)?\}/);
    expect(JSON.stringify(mcpJson)).not.toMatch(/_live_/);
  });
  it('holds only team servers: the personal server belongs in local or user scope', () => {
    expect(Object.keys(mcpJson.mcpServers).sort()).toEqual(['shop', 'tickets']);
  });
});

describe('TODO(2) chooseScope', () => {
  it('team-shared → project (.mcp.json in the repo)', () => {
    expect(lesson.chooseScope({ sharedWithTeam: true, acrossAllProjects: false })).toBe('project');
  });
  it('private, every project → user', () => {
    expect(lesson.chooseScope({ sharedWithTeam: false, acrossAllProjects: true })).toBe('user');
  });
  it('private, this project only → local (the default)', () => {
    expect(lesson.chooseScope({ sharedWithTeam: false, acrossAllProjects: false })).toBe('local');
  });
});

describe('TODO(3) expandEnv', () => {
  it('expands ${VAR}', () => {
    expect(lesson.expandEnv('Bearer ${TOKEN}', { TOKEN: 'abc' })).toEqual({ value: 'Bearer abc', missing: [] });
  });
  it('uses the default of ${VAR:-default} when VAR is unset, and VAR when set', () => {
    expect(lesson.expandEnv('${URL:-https://x.example/mcp}', {}).value).toBe('https://x.example/mcp');
    expect(lesson.expandEnv('${URL:-https://x.example/mcp}', { URL: 'https://y' }).value).toBe('https://y');
  });
  it('leaves an unset variable without default as written and reports it', () => {
    expect(lesson.expandEnv('Bearer ${TOKEN}', {})).toEqual({ value: 'Bearer ${TOKEN}', missing: ['TOKEN'] });
  });
});

describe('TODO(4) findHardcodedSecrets', () => {
  it('flags literal tokens in headers and env, accepts ${VAR} references', () => {
    const hits = lesson.findHardcodedSecrets({
      mcpServers: {
        a: { headers: { Authorization: 'Bearer shp_live_8f3a91c2d4e5b6a7f8091a2b' } },
        b: { env: { KEY: 'tk_live_29d8c7b6a5f4e3d2c1b0' } },
        c: { headers: { Authorization: 'Bearer ${A_TOKEN}' }, env: { KEY: '${KEY:-dev}' } },
      },
    });
    expect(hits.sort()).toEqual(['a.headers.Authorization', 'b.env.KEY']);
  });
});

describe('TODO(5) Agent SDK options', () => {
  it('names MCP tools mcp__<server>__<tool>, sanitising the server name', () => {
    expect(lesson.mcpToolName('github', 'list_issues')).toBe('mcp__github__list_issues');
    expect(lesson.mcpToolName('my.server', 'list_issues')).toBe('mcp__my_server__list_issues');
  });
  it('grants the shop server via allowedTools, without bypassPermissions', () => {
    const opts = lesson.agentOptions({ SHOP_API_TOKEN: 'from-env' });
    expect(opts.allowedTools).toContain('mcp__shop__*');
    expect(opts.permissionMode).not.toBe('bypassPermissions');
    expect(opts.allowDangerouslySkipPermissions).toBeFalsy();
    expect(opts.strictMcpConfig).toBe(true);
  });
  it('takes the token from the environment and fails fast without it', () => {
    const shop = lesson.agentOptions({ SHOP_API_TOKEN: 'from-env' }).mcpServers?.shop;
    expect(shop && 'headers' in shop ? shop.headers : undefined).toEqual({ Authorization: 'Bearer from-env' });
    expect(() => lesson.agentOptions({})).toThrow(/SHOP_API_TOKEN/);
  });
});

describe('TODO(6) verify discovery', () => {
  it('reports expected tools the server does not list', async () => {
    const server = new McpServer({ name: 'tickets', version: '1.0.0' });
    server.registerTool('create_ticket', { description: 'Create a ticket.' }, async () => ({ content: [] }));
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 't', version: '1' });
    await client.connect(b);
    expect(await lesson.missingTools(client, ['create_ticket', 'close_ticket'])).toEqual(['close_ticket']);
    await client.close();
  });
  it('treats failed and needs-auth as unavailable, but not pending', () => {
    const init = {
      mcp_servers: [
        { name: 'shop', status: 'connected' },
        { name: 'tickets', status: 'pending' },
        { name: 'crm', status: 'needs-auth' },
        { name: 'legacy', status: 'failed' },
      ],
    };
    expect(lesson.unavailableServers(init).sort()).toEqual(['crm', 'legacy']);
  });
});
