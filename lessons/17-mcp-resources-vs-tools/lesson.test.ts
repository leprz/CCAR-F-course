import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { loadLesson } from '../../lib/lesson.ts';
import { connectInMemory } from './harness.ts';
import { POLICIES } from './shop-data.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});
const connect = async () => (client = await connectInMemory(lesson.createShopServer()));

const descriptionOf = async (c: Client, name: string) => {
  const tool = (await c.listTools()).tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} missing`);
  return tool.description ?? '';
};

describe('TODO(1) policies are exposed as resources', () => {
  it('has an index resource at shop://policies listing every policy uri', async () => {
    const c = await connect();
    const { resources } = await c.listResources();
    expect(resources.map((r) => r.uri)).toContain('shop://policies');

    const { contents } = await c.readResource({ uri: 'shop://policies' });
    const index = JSON.parse(String(contents[0] && 'text' in contents[0] ? contents[0].text : '[]')) as { uri: string }[];
    expect(index.map((p) => p.uri).sort()).toEqual(POLICIES.map((p) => `shop://policies/${p.topic}`).sort());
  });

  it('has a shop://policies/{topic} template, and every policy is listed as a resource', async () => {
    const c = await connect();
    const { resourceTemplates } = await c.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain('shop://policies/{topic}');

    const { resources } = await c.listResources();
    for (const p of POLICIES) expect(resources.map((r) => r.uri)).toContain(`shop://policies/${p.topic}`);
  });

  it('reads a policy as markdown', async () => {
    const c = await connect();
    const { contents } = await c.readResource({ uri: 'shop://policies/refunds' });
    expect(contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    expect(contents[0] && 'text' in contents[0] ? contents[0].text : '').toContain('# Refund policy');
  });
});

describe('TODO(2) exploratory tools are gone', () => {
  it('does not expose list_policies or get_policy', async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('list_policies');
    expect(names).not.toContain('get_policy');
    expect(names.sort()).toEqual(['get_order', 'search_customers', 'search_orders']);
  });
});

describe('TODO(3) tool descriptions prevent misrouting', () => {
  it('get_order states the id format and points to search_orders for customer lookups', async () => {
    const d = await descriptionOf(await connect(), 'get_order');
    expect(d).toMatch(/[A-Z]\d{4}/);
    expect(d).toMatch(/search_orders/);
  });
  it('search_orders says it takes an email and points to get_order when the id is known', async () => {
    const d = await descriptionOf(await connect(), 'search_orders');
    expect(d).toMatch(/email/i);
    expect(d).toMatch(/get_order/);
  });
  it('search_customers says it returns profiles, not orders, and names search_orders', async () => {
    const d = await descriptionOf(await connect(), 'search_customers');
    expect(d).toMatch(/search_orders/);
    expect(d).toMatch(/not|never/i);
  });
  it('every description is more than a one-liner', async () => {
    const c = await connect();
    for (const t of (await c.listTools()).tools) {
      expect((t.description ?? '').length, t.name).toBeGreaterThan(120);
    }
  });
});

describe('TODO(4) loadPolicyContext reads resources, not tools', () => {
  it('wraps each requested policy and never calls a tool', async () => {
    const c = await connect();
    let toolCalls = 0;
    const original = c.callTool.bind(c);
    c.callTool = ((...args: Parameters<Client['callTool']>) => {
      toolCalls++;
      return original(...args);
    }) as Client['callTool'];

    const context = await lesson.loadPolicyContext(c, ['refunds', 'shipping']);
    expect(toolCalls).toBe(0);
    expect(context).toContain('<policy uri="shop://policies/refunds">');
    expect(context).toContain('<policy uri="shop://policies/shipping">');
    expect(context).toContain('# Shipping policy');
  });
});
