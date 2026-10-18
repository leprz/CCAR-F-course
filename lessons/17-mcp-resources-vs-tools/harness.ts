import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages';

/** Connect an MCP client to a server in-process. Same protocol messages as stdio/HTTP, no subprocess. */
export async function connectInMemory(server: McpServer): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'lesson-client', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

/** Map MCP `tools/list` entries to Messages API tool definitions (what an MCP host does for the model). */
export async function toAnthropicTools(client: Client): Promise<AnthropicTool[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => {
    // The MCP SDK stamps a draft-07 `$schema`; the Messages API validates against 2020-12, so drop it.
    const { $schema: _dialect, ...schema } = t.inputSchema as Record<string, unknown>;
    return { name: t.name, description: t.description ?? '', input_schema: { ...schema, type: 'object' as const } };
  });
}
