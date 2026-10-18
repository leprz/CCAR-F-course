import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';
import { asList, Sandbox } from '../19-config-mechanisms-and-context-fork/support/config-files.ts';
import { SAMPLE_TESTS } from './samples.ts';
import { TOOL_TASKS, type BuiltinTool, type TaskId } from './tool-tasks.ts';
import { Workspace } from './workspace.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);
const box = Sandbox.forLesson(import.meta.url);

const EXPECTED: Record<TaskId, BuiltinTool> = {
  K1: 'Glob', K2: 'Grep', K3: 'Read', K4: 'Bash', K5: 'Bash', K6: 'Grep', K7: 'Read', K8: 'Grep', K9: 'Glob', K10: 'Bash',
};

describe('TODO(1) pick the built-in tool', () => {
  for (const id of Object.keys(TOOL_TASKS) as TaskId[]) {
    it(`${id}: ${TOOL_TASKS[id]}`, () => {
      expect(lesson.TOOL_FOR_TASK[id]).toBe(EXPECTED[id]);
    });
  }
});

describe('TODO(2) findUnauthorizedRoutes explores incrementally', () => {
  it('finds exactly the route with no authorization check (SEC-3)', async () => {
    const found = await lesson.findUnauthorizedRoutes(new Workspace());
    expect(found).toEqual([{ method: 'GET', path: '/orders/:id', file: 'src/routes/orders.ts', line: 9 }]);
  });
  it('never reads files outside src/routes', async () => {
    const ws = new Workspace();
    await lesson.findUnauthorizedRoutes(ws);
    const reads = ws.calls.filter((c) => c.tool === 'Read');
    expect(reads.every((c) => c.arg.startsWith('src/routes/'))).toBe(true);
  });
  it('reads windows, not whole files, and uses search to find them', async () => {
    const ws = new Workspace();
    await lesson.findUnauthorizedRoutes(ws);
    expect(ws.calls.some((c) => c.tool === 'Grep')).toBe(true);
    expect(ws.calls.filter((c) => c.tool === 'Read').every((c) => /:\d+\+\d+$/.test(c.arg))).toBe(true);
  });
  it('keeps what enters context well under a quarter of the codebase', async () => {
    const ws = new Workspace();
    await lesson.findUnauthorizedRoutes(ws);
    expect(ws.charsInContext).toBeLessThan(ws.totalChars / 4);
  });
});

describe('TODO(3) buildTestGenPrompt', () => {
  const codebase = loadCodebase({ include: (p) => p.startsWith('src/') || p.startsWith('tests/') || p === 'CONVENTIONS.md' });
  const prompt = () => lesson.buildTestGenPrompt(codebase);
  const all = () => `${prompt().system}\n${prompt().user}`;

  it('includes the code under test and its dependency', () => {
    expect(all()).toContain('export function computeTotals');
    expect(all()).toContain('export function roundHalfEven');
  });
  it('includes the existing tests, with the factories defined in them', () => {
    expect(all()).toContain('export function makeOrder');
    expect(all()).toContain("describe('splitInstalments'");
  });
  it("includes the project's test conventions", () => {
    expect(all()).toContain('one `describe` per exported function');
  });
  it('states what makes a test meaningful and bans trivial assertions', () => {
    expect(all()).toMatch(/toBeDefined/);
    expect(all()).toMatch(/typeof/);
    expect(all()).toMatch(/concrete|exact/i);
  });
  it('names the business-rule edge cases to cover', () => {
    expect(all()).toMatch(/tax applied after the discount|tax after (the )?discount/i);
    expect(all()).toMatch(/discount larger than the subtotal/i);
  });
});

describe('TODO(4) isTrivialTest', () => {
  for (const sample of SAMPLE_TESTS) {
    it(`${sample.id} → ${sample.trivial ? 'trivial' : 'behavioural'}`, () => {
      expect(lesson.isTrivialTest(sample.source)).toBe(sample.trivial);
    });
  }
});

describe('TODO(5) sandbox: explorer subagent and test-writing skill', () => {
  it('the explorer is read-only and names Grep and Glob explicitly', () => {
    const agent = box.markdown('.claude/agents/codebase-explorer.md');
    const tools = asList(agent.frontmatter.tools);
    expect(tools).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob']));
    expect(tools.some((t) => /^(Edit|Write|Bash)/.test(t))).toBe(false);
  });
  it('the explorer works search-first and reads targeted windows', () => {
    const body = box.markdown('.claude/agents/codebase-explorer.md').body;
    expect(body).not.toMatch(/read every file/i);
    expect(body).toMatch(/Grep/);
    expect(body).toMatch(/offset|window/i);
  });
  it('the write-tests skill injects the existing tests and conventions', () => {
    const body = box.markdown('.claude/skills/write-tests/SKILL.md').body;
    expect(body).toMatch(/```!\s*\ncat tests\//);
    expect(body).toMatch(/CONVENTIONS\.md/);
  });
  it('the write-tests skill defines meaningful vs trivial tests', () => {
    const body = box.markdown('.claude/skills/write-tests/SKILL.md').body;
    expect(body).toMatch(/toBeDefined/);
    expect(body).toMatch(/makeOrder/);
  });
});
