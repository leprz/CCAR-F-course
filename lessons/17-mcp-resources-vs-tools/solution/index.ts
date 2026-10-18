import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { customers, getOrder, orders } from '../../../fixtures/support/index.ts';
import { POLICIES } from '../shop-data.ts';

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

export function createShopServer(): McpServer {
  const server = new McpServer({ name: 'shop', version: '1.0.0' });

  // Static, read-only documents are resources: the host can list them, attach them as context,
  // or let the user @-mention them, with no exploratory tool round trips.
  server.registerResource(
    'policy-index',
    'shop://policies',
    { title: 'Support policy index', description: 'Every support policy with its resource URI.', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(POLICIES.map((p) => ({ topic: p.topic, title: p.title, uri: `shop://policies/${p.topic}` }))),
        },
      ],
    }),
  );

  server.registerResource(
    'policy',
    new ResourceTemplate('shop://policies/{topic}', {
      // `list` makes every concrete policy show up in resources/list, not only the template.
      list: async () => ({
        resources: POLICIES.map((p) => ({ uri: `shop://policies/${p.topic}`, name: p.topic, title: p.title, mimeType: 'text/markdown' })),
      }),
      complete: { topic: (value) => POLICIES.map((p) => p.topic).filter((t) => t.startsWith(value)) },
    }),
    { title: 'Support policy', description: 'One support policy as markdown, by topic.', mimeType: 'text/markdown' },
    async (uri, { topic }) => {
      const policy = POLICIES.find((p) => p.topic === String(topic));
      if (!policy) throw new Error(`Unknown policy topic "${String(topic)}". Read shop://policies for the list.`);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: policy.body }] };
    },
  );

  // Live data the model decides to fetch per request stays a tool. Descriptions separate the
  // three look-alikes by input format, use case, and which sibling to use instead.
  server.registerTool(
    'get_order',
    {
      description:
        'Fetch ONE order by its exact order id (format: one letter + 4 digits, e.g. "A1002"). ' +
        'Returns status, total, placed date and tracking. Use it when the ticket already names an order id. ' +
        'Do not use it to find orders for a customer: use search_orders with the customer email instead.',
      inputSchema: { order_id: z.string().describe('Exact order id, e.g. "A1002".') },
    },
    async ({ order_id }) => json(await getOrder(order_id)),
  );

  server.registerTool(
    'search_orders',
    {
      description:
        "List ALL orders belonging to one customer, looked up by the customer's email address. " +
        'Optionally filter by status. Use it when the ticket gives no order id. ' +
        'When you already have an order id, call get_order instead. To look up the customer profile itself, use search_customers.',
      inputSchema: {
        customer_email: z.string().describe('Customer email exactly as on the ticket.'),
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
    {
      description:
        'Find customer PROFILES (id, name, tier) by a partial name or email. ' +
        'Returns customers, never orders. Use it to identify who wrote a ticket or to check their tier. ' +
        'For their orders, call search_orders with the email it returns.',
      inputSchema: { query: z.string().describe('Part of the name or email, case-insensitive, e.g. "kowalski".') },
    },
    async ({ query }) => {
      const q = query.toLowerCase();
      return json(customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
    },
  );

  return server;
}

/**
 * Application-side context loading: the HOST reads the resources it wants and injects them into the
 * prompt. No model turn and no tools/call is spent discovering what policies exist.
 */
export async function loadPolicyContext(client: Client, topics: string[]): Promise<string> {
  const blocks: string[] = [];
  for (const topic of topics) {
    const uri = `shop://policies/${topic}`;
    const { contents } = await client.readResource({ uri });
    const text = contents.map((c) => ('text' in c ? c.text : '')).join('\n');
    blocks.push(`<policy uri="${uri}">\n${text}\n</policy>`);
  }
  return blocks.join('\n');
}
