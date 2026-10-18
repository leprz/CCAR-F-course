---
title: Part 7 — MCP: resources, tools, scopes and auth
topic: Model Context Protocol in Claude Code and the Agent SDK
date: 2026-10-18
depth: chapter
tags: [cca-f, part-7, mcp, resources, tool-descriptions, scopes, O34, O35, O36]
---

# Part 7 — MCP: resources, tools, scopes and auth

In Part 1 you wrote tools by hand: a JSON schema in the request, a handler in your own code, and a loop that connects
them. That works well for one application. It stops working when the same backend has to be reachable from Claude Code
on every developer's laptop, from an Agent SDK service in production, and from whatever assistant the support team uses
next year. Each of those would need its own copy of the tool definitions, its own handlers, and its own way of finding
out what exists.

The **Model Context Protocol (MCP)** solves that by putting the capabilities behind a server with a standard protocol.
Any MCP-capable host (Claude Code, the Agent SDK, Claude Desktop, your own client) connects to the server, asks what it
offers, and uses it. Writing the server is easy. The exam questions on this topic are about three decisions that are
easy to get wrong. Should a piece of content be offered as a **tool** or as a **resource**? How do you write tool
descriptions so Claude picks the right one of several similar tools? And how do you wire a server into a project (which
**scope**, where the **credentials** go, and how you **check** it actually connected)?

By the end of this chapter you'll be able to look at an agent that wastes turns exploring a server and say which content
should have been a resource, rewrite a set of look-alike tool descriptions so they route correctly, and review a team's
`.mcp.json` for scope and secret mistakes. The two lessons that follow have you do each of those in code.

> **Objectives:** O34 MCP resources vs tools · O36 tool descriptions that prevent misrouting · O35 server scope, env-var auth, tool discovery
> **Lessons:** [Lesson 17](../../../lessons/17-mcp-resources-vs-tools/) · [Lesson 18](../../../lessons/18-mcp-integration-scope-auth/)
> **Sources checked:** 2026-10-18 (links in *Going deeper*). SDK pinned: `@modelcontextprotocol/sdk` 1.32.1, `@anthropic-ai/claude-agent-sdk` 0.3.302.

## The running example

We return to the online shop from Part 1 (`fixtures/support/`). The customers and orders are the same: Ana (`cus_001`,
premium) with orders `A1001`, `A1002` and `A1003`; Ben (`cus_002`) with a delivered laptop `B2001` and a refunded order;
Chen (`cus_003`) with one cancelled order.

The support team has moved its backend behind an MCP server called **`shop`**. Besides order and customer data, it now
serves the four **support policies** the agents have to follow (`lessons/17-mcp-resources-vs-tools/shop-data.ts`):

| topic | title | gist |
|-------|-------|------|
| `refunds` | Refund policy | Refunds go to the original payment method within 5 business days, up to 30 days after delivery. Duplicate charges are always refunded in full and escalated to billing. |
| `shipping` | Shipping policy | Ships within 2 business days via UPS, DHL or FedEx. Premium customers get free express shipping. |
| `warranty` | Warranty policy | Electronics carry a 2-year warranty. Claims need the order id and a description of the defect. |
| `account-security` | Account security | Reset emails expire after 1 hour. Never ask for a password. Locked accounts go to a human. |

The first version of the server (the Lesson 17 starter) offers five **tools**: `list_policies`, `get_policy`, `get_order`,
`search_orders` and `search_customers`. Each description is two or three words ("List policies.", "Get order.",
"Search."). Two things go wrong in production:

1. Before answering *anything*, the agent spends two or three turns calling `list_policies`, then `get_policy` for each
   policy that might be relevant. The policies don't change during a conversation, and the support app already knows
   which policy a ticket needs.
2. The agent mixes up the three data tools. Given "where is my order A1002?", it sometimes calls `search_customers`.

There's a third problem in how the server is wired in (the Lesson 18 starter). The team's committed `.mcp.json` contains live
API tokens and one developer's personal notes server, and the production Agent SDK service runs with
`bypassPermissions` and never checks whether the server connected.

We'll fix the first problem in sections 1–2, the second in section 3, and the wiring in sections 4–6.

## 1. What does an MCP server offer an agent?

### The problem

If you think of an MCP server as "a bag of tools", every fix looks like another tool. Need the policies? Add
`get_policy`. Need to know which policies exist? Add `list_policies`. That's exactly how the `shop` server ended up with
two tools whose only job is to let the model read documents. To see why that's a design mistake, you need the full
picture of what a server can offer.

### The idea

An MCP server can expose three kinds of things, called **primitives**. They differ in *who decides when they're used*,
and that's the most important column in the table:

| Primitive | Controlled by | What it is | Protocol methods |
|-----------|---------------|------------|------------------|
| **Tool** | The **model** | A function with a JSON Schema input that the model decides to call: search, create, send, query live data | `tools/list`, `tools/call` |
| **Resource** | The **application** (host) | Passive, read-only data with a URI and a MIME type: documents, DB schemas, API docs, catalogues | `resources/list`, `resources/templates/list`, `resources/read`, subscriptions |
| **Prompt** | The **user** | A reusable message template with arguments, invoked explicitly (in Claude Code, as a slash command) | `prompts/list`, `prompts/get` |

A **tool** is the same thing you built in Part 1, just served over the protocol. The model sees its name, description and
input schema, and decides on its own whether to call it. Every call costs at least one model turn: the model asks, the
host runs it, the result comes back, and the model reads it.

A **resource** is content, identified by a URI such as `shop://policies/refunds`. The model doesn't "call" a resource.
The **host** (the application around the model) lists the resources, decides which ones are relevant, reads them, and
puts their content into the model's context. In Claude Code the user can do the deciding by @-mentioning a resource. The
point is that the decision happens *outside* the model's turn loop, so it costs no model turns at all.

A **prompt** is a template the user picks on purpose. In Claude Code an MCP prompt shows up as a slash command named
`/mcp__<server>__<prompt>`.

Resources come in two shapes:

- A **direct resource** has a fixed URI, such as `shop://policies` (an index of all policies).
- A **resource template** has parameters in its URI, such as `shop://policies/{topic}`. Clients can ask the server to
  **complete** a parameter (type `ref` and get `refunds`), and the template can have a `list` callback that enumerates
  its concrete instances, so each policy also appears in `resources/list`.

### Worked example: what the `shop` server really contains

Sort the `shop` server's content by the "who decides" question:

| Content | Changes during a conversation? | Who knows it's needed? | Primitive |
|---------|-------------------------------|------------------------|-----------|
| The four policies | No | The support app (it knows the ticket's category) or the agent's user | **Resource** |
| The list of policies | No | Same | **Resource** (the `shop://policies` index) |
| One order's status | Yes, live | The model, once it reads the order id in the ticket | **Tool** (`get_order`) |
| A customer's orders | Yes, live | The model, once it knows the email | **Tool** (`search_orders`) |
| Customer profiles | Yes, live | The model, mid-investigation | **Tool** (`search_customers`) |

Two of the five tools fail the test. They exist only to let the model read stable documents that someone outside the
model could have handed it.

### What goes wrong

**Everything as a tool.** This is the default for anyone coming from plain function calling, and it's the pattern the
exam describes as an agent that "makes several list/search calls to find reference docs before every answer". The
symptom is turns and tokens spent on discovery, before any real work starts.

**Everything as a resource.** The opposite mistake is to see that resources save turns and try to turn live queries into
resources too. An order's status depends on an id the model only learns mid-task, and it can change between requests.
That's a tool's job. A useful shorthand: a database *schema* is a resource, *running a query* is a tool.

> **Check yourself:** A team exposes its 200-page API reference through an MCP tool `search_docs(query)`. Their
> coding agent calls it 4–6 times per task with slightly different queries before writing any code. Which primitive
> fits better, and what changes for the agent?
>
> <details><summary>Answer</summary>
>
> The API reference is stable, read-only and browsable, so it fits **resources**: one resource per page or section
> (or a resource template like `docs://api/{section}`), plus an index resource. The host, or the developer through an
> @-mention, attaches the relevant sections up front, and the agent starts with the content in context instead of
> searching for it turn by turn. A search tool can still be useful for genuinely open-ended lookups, but it shouldn't be
> the *only* way to reach stable reference content. The tempting wrong answers are "write a better search tool" and
> "raise `max_turns`". Both keep the exploration loop and only make it faster or longer.
>
> </details>

## 2. When should content be a resource instead of a tool?

### The problem

Section 1 gave the classification. This section shows the cost difference in an actual run, because that cost is how
the exam frames O34: "reduce exploratory tool calls and improve agent efficiency".

Take ticket **T-100**, from Ben: *"Charged twice?? I see two charges for my laptop order last month… One of them needs
to go back to me ASAP."* To answer correctly, the agent needs the refund policy (duplicate charges are refunded in full
and escalated to billing) and Ben's orders.

### The idea

With policies behind tools, the run looks like this:

```text
turn 1  model → tools/call list_policies {}                     ← discovery
        host  ← ["refunds","shipping","warranty","account-security"]
turn 2  model → tools/call get_policy {"topic":"refunds"}       ← discovery
        host  ← "# Refund policy ... Duplicate charges are always refunded in full ..."
turn 3  model → tools/call search_orders {"customer_email":"ben.kowalski@example.com"}
        host  ← [{ "id":"B2001", "status":"delivered", "totalUsd":899.99, ... }, ...]
turn 4  model → final answer
```

Two of the four turns are pure discovery. Each turn is a full model request that re-sends the whole conversation, so
discovery costs latency *and* input tokens, and it costs them on every ticket.

With policies as resources, the support app does the reading before the model starts. It already classified the ticket
as a billing/refund case, so it knows the refund policy is relevant:

```text
host  → resources/read shop://policies/refunds                  ← no model turn
host  : put the policy text into the prompt
turn 1  model → tools/call search_orders {"customer_email":"ben.kowalski@example.com"}
        host  ← [{ "id":"B2001", ... }]
turn 2  model → final answer
```

The model still uses a tool for the live data (Ben's orders), because only the model knows mid-task which customer to
look up. But nothing is spent discovering what policies exist.

```mermaid
flowchart LR
  subgraph Before["Policies behind tools"]
    M1[Model] -->|turn 1: list_policies| S1[(shop)]
    M1 -->|turn 2: get_policy refunds| S1
    M1 -->|turn 3: search_orders| S1
  end
  subgraph After["Policies as resources"]
    H[Host app] -->|resources/read shop://policies/refunds| S2[(shop)]
    H -->|policy attached to prompt| M2[Model]
    M2 -->|turn 1: search_orders| S2
  end
```

The decision rule:

- If the content is **stable, browsable and read-only**, and the **application or the user can tell up front** what's
  relevant, make it a **resource**.
- If it's an **action**, has **side effects**, or is a **live query whose parameters the model works out mid-task**, make
  it a **tool**.

### Worked example: the `shop` server, rewritten

Here's the resource half of the Lesson 17 solution. The first registration is a direct resource, the index:

```ts
server.registerResource(
  'policy-index',
  'shop://policies',
  { title: 'Support policy index', description: 'Every support policy with its resource URI.', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(POLICIES.map((p) => ({ topic: p.topic, title: p.title, uri: `shop://policies/${p.topic}` }))),
    }],
  }),
);
```

The second is a resource template, one URI pattern that covers all four policies:

```ts
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
```

Notice three things. The read callback returns `contents`, a list of items each with a `uri`, a `mimeType` and `text`.
That's the shape a `resources/read` response has on the wire. The `list` callback is what makes `resources/list` return
`shop://policies/refunds`, `shop://policies/shipping` and so on, rather than only the template. And `complete` lets a
client autocomplete the `{topic}` parameter. With these registered, `list_policies` and `get_policy` are deleted.

On the host side, reading a resource is one protocol call, and no model turn is involved. This is Lesson 17's
`loadPolicyContext`:

```ts
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
```

The Lesson 17 tests check exactly this: after `loadPolicyContext`, the server has seen `resources/read` requests and **no**
`tools/call`.

In **Claude Code**, resources appear in the `@` autocomplete and can be referenced as `@server:protocol://path`, for
example `@shop:shop://policies/refunds`. A referenced resource is fetched and attached automatically. Claude Code also
gives the model tools to list and read resources when a server supports them, so the model isn't cut off from them,
but the cheap path is for the user or app to attach what's needed.

### What goes wrong

**A host that never reads resources.** Resources only help if the host does something with them. A plain Messages API
application has no built-in idea of MCP resources: it has to read them itself and put them in the prompt, which is what
`loadPolicyContext` does. If you move content to resources and nobody reads them, the agent simply loses access.

**Attaching everything.** Resources cost context when attached. Attaching all four policies to every ticket is
harmless here, but attaching a whole documentation site is not. Use templates and the index to pick what's relevant.

**Hiding live data in a resource.** If a resource's content depends on parameters the model only discovers mid-task, or
changes per request, you've rebuilt a tool with extra steps. Keep it a tool.

> **Check yourself:** A data team's MCP server has a `describe_table(name)` tool and a `run_sql(query)` tool. Their
> analytics agent calls `describe_table` for five tables at the start of every question. What would you change?
>
> <details><summary>Answer</summary>
>
> The table schemas are stable, read-only reference content, so expose them as resources: a `db://schema` index plus a
> `db://schema/{table}` template. The host (or the analyst, through @-mentions) attaches the relevant schemas before the
> model starts. Keep `run_sql` as a tool, because running a query is a live operation whose parameters the model works
> out. The tempting wrong answer is to "batch `describe_table` into one call that returns every table". That cuts the
> turn count, but it's still discovery inside the model's loop, and it dumps every schema into context whether it's
> needed or not.
>
> </details>

## 3. How does Claude choose between similar tools?

### The problem

After section 2, the `shop` server has three tools left: `get_order`, `search_orders` and `search_customers`. They look
alike. All three return shop data, and two of them "search". With the starter's descriptions:

```ts
server.registerTool('get_order',        { description: 'Get order.',     inputSchema: { order_id: z.string() } }, ...);
server.registerTool('search_orders',    { description: 'Search orders.', inputSchema: { customer_email: z.string(), status: ... } }, ...);
server.registerTool('search_customers', { description: 'Search.',        inputSchema: { query: z.string() } }, ...);
```

Ana's ticket T-101 asks for the status of A1001, A1002 and A1003. Which tool should Claude call? A human knows
immediately: there are order ids, so `get_order`. Claude only sees the definitions above. "Search." could search
anything. Nothing says what format `order_id` takes, or that `search_orders` wants an email. So Claude sometimes calls
`search_customers` with `"A1002"` as the query and gets an empty list back.

### The idea

Claude picks a tool from its **description** and schema, and nothing else. Part 1 quoted the docs: the description is
"by far the most important factor in tool performance". When tools look alike, a description has to do four jobs:

1. **What it returns**, and what it *doesn't* ("returns customer profiles, never orders").
2. **The input format**, with an example (`"A1002"`, an email address exactly as on the ticket).
3. **When to use it**: its use-case boundary.
4. **Which sibling to use instead**, by name ("when you already have an order id, call `get_order` instead").

The fourth job is the one that's easy to forget, and it's the one that prevents misrouting. A description that only
describes the tool itself leaves Claude to work out the boundary between it and its neighbours. A description that names
the neighbour draws the boundary explicitly.

### Worked example: the three descriptions, rewritten

From the Lesson 17 solution:

```ts
server.registerTool('get_order', {
  description:
    'Fetch ONE order by its exact order id (format: one letter + 4 digits, e.g. "A1002"). ' +
    'Returns status, total, placed date and tracking. Use it when the ticket already names an order id. ' +
    'Do not use it to find orders for a customer: use search_orders with the customer email instead.',
  inputSchema: { order_id: z.string().describe('Exact order id, e.g. "A1002".') },
}, ...);

server.registerTool('search_orders', {
  description:
    "List ALL orders belonging to one customer, looked up by the customer's email address. " +
    'Optionally filter by status. Use it when the ticket gives no order id. ' +
    'When you already have an order id, call get_order instead. To look up the customer profile itself, use search_customers.',
  inputSchema: {
    customer_email: z.string().describe('Customer email exactly as on the ticket.'),
    status: z.enum(['processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
  },
}, ...);

server.registerTool('search_customers', {
  description:
    'Find customer PROFILES (id, name, tier) by a partial name or email. ' +
    'Returns customers, never orders. Use it to identify who wrote a ticket or to check their tier. ' +
    'For their orders, call search_orders with the email it returns.',
  inputSchema: { query: z.string().describe('Part of the name or email, case-insensitive, e.g. "kowalski".') },
}, ...);
```

Trace the three tickets through them. T-101 names three order ids, and `get_order` says "use it when the ticket already
names an order id", so three `get_order` calls (in parallel, as in Part 1). T-103 ("I want a refund for my order") has no
order id, and `search_orders` says "use it when the ticket gives no order id". A question like "is Ben a premium
customer?" matches "check their tier" in `search_customers`. Every description also tells Claude where to go if it's in
the wrong place.

Notice the parameter descriptions as well. `z.string().describe('Exact order id, e.g. "A1002".')` ends up as the
`description` of `order_id` in the tool's input schema, so the format hint sits right where Claude fills in the value.

**Practical limits in Claude Code.** Tool descriptions and server instructions are cut off after 4,096 characters for
tools loaded upfront, or 16,384 for tools loaded through tool search. With tool search (the default), only tool names
and server instructions load at startup, so clear **server instructions** are what help Claude decide when to search for
your tools. Put the key words first in both.

### What goes wrong

**Blaming the model.** When Claude picks the wrong one of several similar tools, the tempting fixes are "use a bigger
model", "fine-tune", or "add a routing step". The exam's answer is almost always the descriptions: input format, use-case
boundary, and the named sibling. Fix the cheap thing first.

**Overlapping descriptions.** Two tools both described as "finds orders" are as bad as no descriptions. Each one must say
what makes it different.

**Burying the key words.** A long description that opens with history and caveats, and mentions the input format in
the last sentence, risks being cut off at the character limit, and is harder to match against a short user request.
Lead with what it does and what it takes.

> **Check yourself:** An MCP server has `get_invoice(invoice_id)` and `find_invoices(customer_id)`. Logs show Claude
> calling `find_invoices` with values like `"INV-2041"`. Which part of the descriptions is missing, and how would you
> write it?
>
> <details><summary>Answer</summary>
>
> The input formats and the sibling boundary are missing. Claude is passing an invoice id to the tool that expects a
> customer id. `get_invoice` should say it takes an exact invoice id ("format `INV-` + 4 digits, e.g. `INV-2041`") and
> is the one to use when the request names an invoice. `find_invoices` should say it takes a customer id (with the
> format and an example), lists every invoice for that customer, and that "when you already have an invoice id, call
> `get_invoice` instead". Parameter descriptions should repeat the formats. Renaming the tools can help a little, but
> descriptions carry most of the weight.
>
> </details>

## 4. Where should a server's configuration live?

### The problem

The `shop` server now has good primitives. Next, every member of the support-engineering team has to be able to use it
from Claude Code. The first attempt was to have each developer run `claude mcp add` themselves. Half the team got the
URL wrong, a new hire didn't get the server at all, and one developer's personal notes server ended up in the shared
file. You need to know where each kind of server configuration belongs.

### The idea

Claude Code stores MCP server configuration in one of three **scopes**:

| Scope | Stored in | Loads in | Shared |
|-------|-----------|----------|--------|
| **local** (default) | `~/.claude.json`, under this project's path | this project only | no |
| **project** | `.mcp.json` at the repo root (committed) | this project | yes, through git. Each user approves it on first use |
| **user** | `~/.claude.json` | all your projects | no |

The decision follows from two questions. Does the whole team need this server in this project? Then use **project**
scope: it's committed in `.mcp.json`, so everyone who clones the repo gets it. Is it a personal server you want
everywhere? Then use **user** scope. Is it personal and only for this project (an experiment, a server with your own
credentials)? Then use **local** scope, which is the default.

If the same server name is configured in several places, precedence is **local > project > user > plugin > claude.ai
connectors**. The whole entry from the winning source is used, and fields aren't merged between them.

The commands:

```bash
claude mcp add --transport http|sse|stdio --scope local|project|user [--env K=V] [--header "K: V"] <name> <url | -- cmd args>
claude mcp list          # every server and its health: connected, needs authentication, or failed to connect
claude mcp get <name>    # one server's details
/mcp                     # inside a session: status, authentication, tools
```

### Worked example: sorting the team's servers

Lesson 18's `chooseScope` encodes the decision:

```ts
export function chooseScope(need: { sharedWithTeam: boolean; acrossAllProjects: boolean }): Scope {
  if (need.sharedWithTeam) return 'project';
  if (need.acrossAllProjects) return 'user';
  return 'local';
}
```

Apply it to the team's three servers:

- **`shop`** (HTTP) and **`tickets`** (stdio): every support engineer needs both in this repo, so `project`. They go in
  the committed `.mcp.json`, and `claude mcp add --scope project ...` writes them there.
- **`ana-notes`**, a developer's notes server at `/Users/ana/dev/notes-mcp/index.js`: personal, and the path only exists
  on Ana's machine. It's `user` scope if Ana wants it in every project, or `local` if only in this one. It must not be
  in `.mcp.json`.

### What goes wrong

**Personal servers in project scope.** Everyone who clones the repo is asked to approve `ana-notes`, and then it fails
for them because the path doesn't exist. Project scope is shared trust: only put servers there that the whole team
should run.

**Team servers in local scope.** The new hire never gets them. That's the exam's "new teammates don't get the Jira MCP
server" scenario, and the fix is to move the server to project scope, not to write onboarding instructions.

> **Check yourself:** A developer configured the `shop` server in local scope while testing a new URL. The team's
> `.mcp.json` also defines `shop` with the production URL and an auth header. Which configuration does Claude Code use
> for that developer, and what happens to the header?
>
> <details><summary>Answer</summary>
>
> The local entry wins (local > project > user), and the **whole** entry is used. Fields aren't merged, so if the local
> entry has no auth header, the developer's requests go without one, even though the project entry has it. To test a
> new URL safely, either copy the full entry (headers included) into the local config, or use `${SHOP_MCP_URL:-...}` in
> the project entry and set the variable locally, which is the approach in section 5.
>
> </details>

## 5. How do you keep credentials out of the configuration?

### The problem

Project scope means `.mcp.json` is committed. Here's what the Lesson 18 starter's `.mcp.json` looks like:

```json
{
  "mcpServers": {
    "shop": {
      "type": "http",
      "url": "https://mcp.shop.example.com/mcp",
      "headers": { "Authorization": "Bearer shp_live_8f3a91c2d4e5b6a7f8091a2b3c4d5e6f" }
    },
    "tickets": {
      "command": "npx",
      "args": ["-y", "@example/tickets-mcp"],
      "env": { "TICKETS_API_KEY": "tk_live_29d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4" }
    },
    "ana-notes": { "command": "node", "args": ["/Users/ana/dev/notes-mcp/index.js"] }
  }
}
```

Two live credentials are now in git history, readable by everyone with access to the repo, and everyone uses the same
token, so you can't tell their requests apart or revoke one person's access.

### The idea

`.mcp.json` supports **environment variable expansion** in `command`, `args`, `env`, `url` and `headers`:

- `${VAR}` is replaced with the value of `VAR` from the environment.
- `${VAR:-default}` is replaced with `VAR`'s value if it's set, otherwise with `default`.

The committed file holds only *references*. Each developer (or the CI system) sets the actual values in their own
environment.

Some behaviour to know:

- If a variable is unset and has **no default**, the config **still loads**. The text stays as `${VAR}`, and
  `claude mcp list` shows a missing-variable warning. You find out from the warning, or from authentication failures,
  not from a load error.
- In a remote server's `url` and `headers`, Claude Code reads some credential variables (such as `ANTHROPIC_API_KEY`) as
  empty **on purpose**, so those values aren't sent to the remote server even if a config references them.
- In the **Agent SDK** there's no `.mcp.json` expansion step in your code path: you read credentials from `process.env`
  yourself and pass them into the server's `env` or `headers`.
- For OAuth servers, the Agent SDK doesn't run a browser flow. The server reports `needs-auth` until you supply a token
  yourself.

### Worked example: the fixed `.mcp.json`

```json
{
  "mcpServers": {
    "shop": {
      "type": "http",
      "url": "${SHOP_MCP_URL:-https://mcp.shop.example.com/mcp}",
      "headers": { "Authorization": "Bearer ${SHOP_API_TOKEN}" }
    },
    "tickets": {
      "command": "npx",
      "args": ["-y", "@example/tickets-mcp"],
      "env": { "TICKETS_API_KEY": "${TICKETS_API_KEY}" }
    }
  }
}
```

Notice what changed. Both tokens are references now. The URL uses a default, so most developers don't need to set
anything, while someone testing a staging server can set `SHOP_MCP_URL`. And `ana-notes` is gone: it moves to Ana's user
or local scope.

Lesson 18's `expandEnv` implements the same rules, so you can see them exactly:

```ts
export function expandEnv(value: string, env: Record<string, string | undefined>): { value: string; missing: string[] } {
  const missing: string[] = [];
  const expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name: string, fallback?: string) => {
    const set = env[name];
    if (set !== undefined) return set;
    if (fallback !== undefined) return fallback;
    missing.push(name);   // unset, no default: keep the text and report it, don't fail
    return whole;
  });
  return { value: expanded, missing };
}
```

With `SHOP_API_TOKEN=abc` set and `SHOP_MCP_URL` unset, the header becomes `Bearer abc` and the URL falls back to the
production default. With `SHOP_API_TOKEN` unset, the header stays `Bearer ${SHOP_API_TOKEN}` and `missing` reports it,
which mirrors the `claude mcp list` warning.

### What goes wrong

**Fixing the file but not the leak.** Replacing the token with `${SHOP_API_TOKEN}` in a new commit doesn't remove the old
token from git history. A committed credential must be **rotated** first. Then switch to expansion.

**A missing variable that nobody notices.** Because an unset variable doesn't fail the load, a typo in a variable name
leads to authentication failures at runtime rather than an error at startup. That's why section 6 is about verifying.

> **Check yourself:** A security scan finds `"Authorization": "Bearer shp_live_…"` in a `.mcp.json` committed three
> months ago. A teammate proposes replacing it with `${SHOP_API_TOKEN}` and force-pushing a rewritten history. What is
> the right order of steps?
>
> <details><summary>Answer</summary>
>
> First **rotate** the token: revoke the leaked one and issue a new one, because anyone who cloned or forked the repo in
> the last three months may have it, and rewriting history doesn't reach their copies. Then change `.mcp.json` to
> `Bearer ${SHOP_API_TOKEN}` and have each developer (and CI) set the variable in their environment. Rewriting history
> is optional clean-up. The tempting wrong answer is to treat it as the fix, when the leaked token is still valid.
>
> </details>

## 6. How do you know the tools actually arrived?

### The problem

The last problem from the running example: the production Agent SDK service connects to `shop` with
`bypassPermissions` and a hard-coded token. When the token expired last month, the server failed to connect. The agent
didn't crash. It carried on with its built-in tools, answered tickets without order data, and nobody noticed for two
days. A configured server isn't the same as a working one, and you have to check.

### The idea

There are three places to check, depending on where the server runs.

**In the Agent SDK.** MCP tools are named `mcp__<server>__<tool>`, so the `shop` server's `get_order` is
`mcp__shop__get_order`. Characters such as `.` in the server name become `_` (a server called `my.server` gives
`mcp__my_server__<tool>`). MCP tools need explicit permission:

- Prefer `allowedTools: ['mcp__shop__*']`, which approves every tool from that one server and nothing else.
- `acceptEdits` doesn't cover MCP tools.
- `bypassPermissions` turns off permission checks for *everything*, which is far more than you need.
- `strictMcpConfig: true` makes the session use only the servers you pass in code, and ignore any `.mcp.json` that
  happens to be on disk.

The session's first message is a `system` message with subtype `init`. It lists the available `tools` and, for each MCP
server, a `status`: `connected`, `pending`, `failed`, `needs-auth` or `disabled`. Treat `failed` and `needs-auth` as
unusable. `pending` can just mean the server is still connecting or that a cached tool list is in use, so it isn't a
failure by itself. Use `mcpServerStatus()` to check again later.

**At the protocol level.** Any MCP client can call `tools/list` and compare the result with the tools you expect. This
is how Lesson 17 and Lesson 18 test the server offline.

**In Claude Code.** `claude mcp list` shows each server's health, and `/mcp` inside a session shows status and tools. A
tool whose full name is longer than 128 characters, or whose schema is invalid, is left out, and the reason is logged.
MCP tool results are capped at 25,000 tokens by default (configurable with `MAX_MCP_OUTPUT_TOKENS`).

### Worked example: the Agent SDK service, fixed

Lesson 18's `agentOptions` builds the options for the production service:

```ts
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
    allowedTools: [mcpToolName('shop', '*')],   // 'mcp__shop__*'
    strictMcpConfig: true,
  };
}
```

Notice the order of defences. A missing token fails **before** the session starts, with a message saying what to do.
Permissions cover exactly the `shop` server's tools. And the session can't pick up a stray `.mcp.json` from the working
directory.

Then the service reads the init message and refuses to continue if a server it depends on isn't usable:

```ts
export function unavailableServers(init: Pick<SDKSystemMessage, 'mcp_servers'>): string[] {
  return init.mcp_servers.filter((s) => s.status === 'failed' || s.status === 'needs-auth').map((s) => s.name);
}
```

For an init message with `[{ name: 'shop', status: 'needs-auth' }, { name: 'tickets', status: 'pending' }]`, this
returns `['shop']`. The service stops and alerts, instead of answering tickets without order data. `tickets` isn't
reported, because `pending` alone isn't a failure.

For the server itself, `missingTools` compares `tools/list` with what the agent expects:

```ts
const missing = await missingTools(client, ['get_order', 'search_orders', 'search_customers']);
// [] when discovery worked; ['get_order'] if a deploy dropped it
```

### What goes wrong

**`bypassPermissions` to "make MCP work".** It does make the MCP tools callable, along with every other tool, with no
checks. The targeted fix is an `allowedTools` entry for the server's tools.

**Wrong tool names in `allowedTools`.** `shop.get_order`, `get_order` or `mcp__my.server__*` don't match anything, so the
tools stay unapproved. The format is `mcp__<server>__<tool>`, with the server name sanitised.

**Not checking at all.** The silent-fallback failure from the running example. An agent that has lost a server usually
still produces fluent answers, which is exactly why nobody notices.

> **Check yourself:** An Agent SDK session's init message shows `{ name: 'crm', status: 'failed' }`, but the agent still
> completes the task and returns a confident summary of a customer's account history. What do you change?
>
> <details><summary>Answer</summary>
>
> Check the init message (or `mcpServerStatus()`) before doing work, and **fail fast** when a required server is
> `failed` or `needs-auth`: stop the run and alert, rather than letting the agent continue with whatever tools remain.
> Then find out why `crm` failed (an expired token, an unset `${VAR}`, a wrong URL). The confident summary is the
> warning sign: without the CRM tools the agent had no real account history, so it either guessed or worked from
> partial data. Raising `maxTurns` or switching to `bypassPermissions` doesn't help, because the server never connected.
>
> </details>

## 7. Putting it together

Here's the whole running example after both lessons, traced through ticket T-100 from Ben.

**Configuration.** The repo's `.mcp.json` defines `shop` and `tickets` in project scope, with `${SHOP_API_TOKEN}` and
`${TICKETS_API_KEY}` references. Every engineer sets those in their own environment, and `claude mcp list` shows both
servers as connected. Ana's notes server lives in her user config. The production service builds its options with
`agentOptions`: it fails fast without `SHOP_API_TOKEN`, approves `mcp__shop__*` only, and sets `strictMcpConfig`.

**Startup.** The service reads the init message. `unavailableServers` returns `[]`, and `missingTools` confirms
`get_order`, `search_orders` and `search_customers` are listed. The service proceeds.

**Context.** The app classifies T-100 as a refund case and calls `loadPolicyContext(client, ['refunds'])`. That's one
`resources/read` of `shop://policies/refunds` and no model turn. The prompt now contains:

```text
<policy uri="shop://policies/refunds">
# Refund policy

Refunds are issued to the original payment method within 5 business days. Orders can be refunded up to 30 days after
delivery. Duplicate charges are always refunded in full and escalated to billing.
</policy>
```

**Turn 1.** The ticket gives no order id, only Ben's email. The `search_orders` description says "use it when the ticket
gives no order id", so Claude calls `mcp__shop__search_orders` with `{"customer_email": "ben.kowalski@example.com"}` and
gets back `B2001` (delivered laptop, $899.99) and the refunded `B2002`.

**Turn 2.** Claude answers: the duplicate charge on B2001 will be refunded in full, the case is escalated to billing, and
the refund goes back to the original card within 5 business days. Every fact comes from either the attached policy or
the live tool result.

Compared with the starter: two discovery turns are gone, the right tool is chosen first time, no secret is in git, and
a failed server would have stopped the service instead of letting it guess.

## Summary

- An MCP server offers **tools** (model-controlled actions), **resources** (application-controlled, read-only content
  with URIs) and **prompts** (user-invoked templates).
- If content is **stable, read-only and browsable**, and the app or user can tell what's relevant, make it a
  **resource**. The host reads it with `resources/read` and attaches it, which costs no model turns.
- Actions, side effects and **live queries with parameters the model works out mid-task** stay **tools**.
- Resource templates (`shop://policies/{topic}`) cover a family of resources. A `list` callback enumerates them, and
  `complete` autocompletes their parameters.
- In Claude Code, resources are @-mentionable as `@server:protocol://path`, and MCP prompts become `/mcp__server__prompt`.
- Tool descriptions for look-alike tools must state **what they return, the input format with an example, when to use
  them, and which sibling to use instead**.
- Scopes: **project** (`.mcp.json`, committed, shared, approved on first use), **user** (all your projects), **local**
  (this project, private, the default). Precedence is local > project > user, and whole entries win.
- Keep secrets out of `.mcp.json` with `${VAR}` and `${VAR:-default}`. An unset variable with no default still loads, and
  `claude mcp list` warns. A committed secret must be rotated.
- Agent SDK: tools are `mcp__<server>__<tool>`. Approve them with `allowedTools: ['mcp__shop__*']`, not
  `bypassPermissions`. Read the init message and fail fast on `failed` or `needs-auth`. `pending` isn't a failure.

## Traps and decision rules

- *"The agent makes several list/search calls to find reference docs before every answer."* → Expose the docs as
  **resources** (or a resource template plus an index), and have the host attach them or let users @-mention them. Not
  "write a better search tool", and not "raise `max_turns`".
- *"Turn order status into a resource so the agent doesn't need a tool call."* → No: live, per-request data whose
  parameters the model learns mid-task belongs in a **tool**.
- *"Resources were added but the agent can no longer see the policies."* → The host doesn't read resources. A plain
  Messages API app has to call `resources/read` itself and inject the content.
- *"The agent calls `search_customers` when the user gives an order number."* → Rewrite the descriptions: input format,
  use-case boundary, named sibling. It isn't a model problem, so a bigger model, fine-tuning or a routing classifier is
  the trap answer.
- *"New teammates don't get the Jira MCP server."* → Move it to **project** scope (`.mcp.json` in git), not onboarding
  docs and not user scope.
- *"A developer's personal server is in `.mcp.json`."* → Move it to **user** or **local** scope.
- *"A token was committed in `.mcp.json`."* → **Rotate** it, then switch to `${VAR}` expansion. Rewriting history alone
  isn't the fix.
- *"The config loads but the server keeps returning 401."* → Check for an unset `${VAR}` (an unset variable without a
  default doesn't fail the load; `claude mcp list` shows a warning).
- *"MCP tools aren't being approved in an Agent SDK session."* → Add `mcp__<server>__*` to `allowedTools`. Not
  `bypassPermissions`, and not `acceptEdits` (it doesn't cover MCP tools).
- *"The agent ran without the CRM tools and nobody noticed."* → Check the init message for `failed` or `needs-auth` and
  fail fast. Don't treat `pending` as a failure.
- *"A local `shop` entry and the project's `shop` entry both exist."* → The local entry wins **as a whole**. Fields
  aren't merged.

## Going deeper

- [MCP server concepts: tools, resources, prompts](https://modelcontextprotocol.io/docs/learn/server-concepts): the
  three primitives, who controls each, resource templates and completion.
- [Claude Code: MCP](https://code.claude.com/docs/en/mcp): scopes and precedence, `.mcp.json`, env-var expansion,
  @-mentioning resources, prompts as commands, tool search, description and output limits.
- [Agent SDK: MCP](https://code.claude.com/docs/en/agent-sdk/mcp): `mcpServers`, `allowedTools` naming, init message
  status values, authentication.
- [Define tools: best practices](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) and
  [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents): how to write descriptions
  that route correctly.
- Related chapters: Part 5 (tool distribution per subagent, O33) and Part 8 (Claude Code permissions and settings, O16).
- Next: **Part 8: Claude Code configuration**, which covers where each kind of guidance belongs (CLAUDE.md, rules,
  skills, hooks, permissions).
