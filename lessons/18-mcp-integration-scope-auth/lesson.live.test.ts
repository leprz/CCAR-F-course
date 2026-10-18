import { expect, it } from 'vitest';
import { createSdkMcpServer, query, tool, type SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { getOrder } from '../../fixtures/support/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L18 live: an Agent SDK session discovers and uses an MCP server', () => {
  it('connects, lists mcp__shop__get_order in init, and calls it', async () => {
    const shop = createSdkMcpServer({
      name: 'shop',
      tools: [
        tool('get_order', 'Fetch one order by exact id such as "A1002".', { order_id: z.string() }, async ({ order_id }) => ({
          content: [{ type: 'text', text: JSON.stringify(await getOrder(order_id)) }],
        })),
      ],
    });

    let init: SDKSystemMessage | undefined;
    let result = '';
    for await (const message of query({
      prompt: 'What is the status of order A1002? Use the shop tools.',
      options: {
        model: modelFromEnv(),
        mcpServers: { shop },
        allowedTools: [lesson.mcpToolName('shop', '*')],
        strictMcpConfig: true,
        maxTurns: 4,
      },
    })) {
      if (message.type === 'system' && message.subtype === 'init') init = message;
      if (message.type === 'result' && message.subtype === 'success') result = message.result;
    }

    expect(init).toBeDefined();
    expect(lesson.unavailableServers(init!)).toEqual([]);
    expect(init!.tools).toContain(lesson.mcpToolName('shop', 'get_order'));
    expect(result.toLowerCase()).toContain('shipped');
  });
});
