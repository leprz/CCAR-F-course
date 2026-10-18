import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { customers, getOrder, orders } from '../../../fixtures/support/index.ts';
import { POLICIES } from '../shop-data.ts';

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

export function createShopServer(): McpServer {
  const server = new McpServer({ name: 'shop', version: '1.0.0' });

  // TODO(1): the policies are static, read-only documents. Expose them as MCP resources instead:
  //  - `shop://policies`: an index resource (application/json) listing topic, title and uri of each policy
  //  - `shop://policies/{topic}`: a resource template (text/markdown) whose `list` callback enumerates every
  //    policy, so each one appears in resources/list
  // TODO(2): once they are resources, delete these two exploratory tools.
  server.registerTool(
    'list_policies',
    { description: 'List policies.' },
    async () => json(POLICIES.map((p) => p.topic)),
  );
  server.registerTool(
    'get_policy',
    { description: 'Get a policy.', inputSchema: { topic: z.string() } },
    async ({ topic }) => json(POLICIES.find((p) => p.topic === topic)?.body ?? 'not found'),
  );

  // TODO(3): the model mixes up these three tools. Rewrite each description so it states:
  //  - what it returns, and the input format (with an example)
  //  - when to use it
  //  - which sibling tool to use instead, by name
  server.registerTool(
    'get_order',
    { description: 'Get order.', inputSchema: { order_id: z.string() } },
    async ({ order_id }) => json(await getOrder(order_id)),
  );

  server.registerTool(
    'search_orders',
    {
      description: 'Search orders.',
      inputSchema: {
        customer_email: z.string(),
        status: z.enum(['processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
      },
    },
    async ({ customer_email, status }) => {
      const customer = customers.find((c) => c.email === customer_email);
      if (!customer) return { ...json({ error: `No customer with email ${customer_email}` }), isError: true };
      return json(orders.filter((o) => o.customerId === customer.id && (!status || o.status === status)));
    },
  );

  server.registerTool(
    'search_customers',
    { description: 'Search.', inputSchema: { query: z.string() } },
    async ({ query }) => {
      const q = query.toLowerCase();
      return json(customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
    },
  );

  return server;
}

/**
 * TODO(4): the host already knows which policies the ticket needs, so it should read the resources itself
 * (`readResource` on `shop://policies/<topic>`) instead of calling a tool. Wrap each one as
 * `<policy uri="shop://policies/<topic>">…</policy>` and join them with newlines.
 */
export async function loadPolicyContext(client: Client, topics: string[]): Promise<string> {
  const blocks: string[] = [];
  for (const topic of topics) {
    const result = await client.callTool({ name: 'get_policy', arguments: { topic } });
    blocks.push(JSON.stringify(result.content));
  }
  return blocks.join('\n');
}
