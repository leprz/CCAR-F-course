import { expect, it } from 'vitest';
import { createClient, modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { connectInMemory, toAnthropicTools } from './harness.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L17 live: descriptions route requests to the right MCP tool', () => {
  const cases = [
    { ask: 'What is the status of order A1002?', expected: 'get_order' },
    { ask: 'Which orders has ben.kowalski@example.com placed?', expected: 'search_orders' },
    { ask: 'Is the customer named Chen Li a premium customer?', expected: 'search_customers' },
  ];

  for (const { ask, expected } of cases) {
    it(`routes "${ask}" to ${expected}`, async () => {
      const mcp = await connectInMemory(lesson.createShopServer());
      const tools = await toAnthropicTools(mcp);
      const policies = await lesson.loadPolicyContext(mcp, ['refunds']);
      const response = await createClient().messages.create({
        model: modelFromEnv(),
        max_tokens: 512,
        system: `You are a support agent. Reference material:\n${policies}`,
        tools,
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: ask }],
      });
      await mcp.close();
      const call = response.content.find((b) => b.type === 'tool_use');
      expect(call?.type === 'tool_use' && call.name).toBe(expected);
    });
  }
});
