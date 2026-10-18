import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const WRITE_OR_EXEC = ['Write', 'Edit', 'NotebookEdit', 'Bash'];
const WEB = ['WebSearch', 'WebFetch'];
const tools = (name: keyof typeof lesson.SUBAGENTS) => lesson.SUBAGENTS[name].tools;

describe('TODO(1) least-privilege tools per role', () => {
  it('every subagent declares an explicit tools list (omitting it inherits everything)', () => {
    for (const name of lesson.SUBAGENT_NAMES) expect(tools(name), name).toBeDefined();
  });
  it('source-analyst is read-only and offline', () => {
    expect(tools('source-analyst')).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob']));
    for (const t of [...WRITE_OR_EXEC, ...WEB]) expect(tools('source-analyst')).not.toContain(t);
  });
  it('web-researcher only searches and fetches', () => {
    expect([...(tools('web-researcher') ?? [])].sort()).toEqual(['WebFetch', 'WebSearch']);
  });
  it('report-writer can write the report but cannot research or run commands', () => {
    expect(tools('report-writer')).toContain('Write');
    for (const t of [...WEB, 'Bash', 'Grep']) expect(tools('report-writer')).not.toContain(t);
  });
  it('no specialist can spawn further agents', () => {
    for (const name of lesson.SUBAGENT_NAMES) {
      expect(tools(name)).not.toContain('Agent');
      expect(tools(name)).not.toContain('Task');
    }
  });
});

describe('TODO(2) descriptions let the coordinator choose', () => {
  it.each(['source-analyst', 'web-researcher', 'report-writer'] as const)('%s says what it does and when to use it', (name) => {
    const d = lesson.SUBAGENTS[name].description;
    expect(d.split(/\s+/).length).toBeGreaterThanOrEqual(12);
    expect(d).toMatch(/\buse (for|when|only|once|this)\b/i);
  });
});

describe('TODO(3) coordinator only plans and delegates', () => {
  it('has the spawn tool', () => {
    expect(lesson.COORDINATOR.tools).toContain('Agent');
  });
  it('cannot research, run commands or write by itself', () => {
    expect(lesson.COORDINATOR.tools).toBeDefined();
    for (const t of [...WEB, ...WRITE_OR_EXEC]) expect(lesson.COORDINATOR.tools).not.toContain(t);
  });
});

describe('TODO(4) buildOptions wires a headless multi-agent run', () => {
  const opts = lesson.buildOptions('/tmp/research');

  it('runs the coordinator as the main thread and registers every agent', () => {
    expect(opts.agent).toBe('coordinator');
    expect(Object.keys(opts.agents ?? {}).sort()).toEqual(['coordinator', ...lesson.SUBAGENT_NAMES].sort());
    expect(opts.agents?.coordinator).toEqual(lesson.COORDINATOR);
  });
  it('pre-approves the spawn tool and every tool the agents use', () => {
    const needed = ['Agent', ...Object.values(lesson.ROLE_TOOLS).flat()];
    expect(opts.allowedTools).toEqual(expect.arrayContaining(needed));
  });
  it('denies instead of prompting, and isolates from filesystem settings', () => {
    expect(opts.permissionMode).toBe('dontAsk');
    expect(opts.settingSources).toEqual([]);
  });
  it('caps turns and spend', () => {
    expect(opts.maxTurns).toBeGreaterThan(0);
    expect(opts.maxBudgetUsd).toBeGreaterThan(0);
  });
});

describe('TODO(5) effectiveTools', () => {
  const available = ['Agent', 'Read', 'Grep', 'Glob', 'Write', 'Bash', 'WebSearch'];
  it('omitting tools inherits everything available', () => {
    expect(lesson.effectiveTools({}, available)).toEqual(available);
  });
  it('a tools list keeps only listed tools that exist', () => {
    expect(lesson.effectiveTools({ tools: ['Read', 'WebFetch'] }, available)).toEqual(['Read']);
  });
  it('disallowedTools always removes', () => {
    expect(lesson.effectiveTools({ disallowedTools: ['Write', 'Bash'] }, available)).toEqual(['Agent', 'Read', 'Grep', 'Glob', 'WebSearch']);
  });
});

describe('TODO(6) delegation detection', () => {
  it('recognises the current Agent tool and the legacy Task name', () => {
    expect(lesson.isSubagentCall({ type: 'tool_use', name: 'Agent' })).toBe(true);
    expect(lesson.isSubagentCall({ type: 'tool_use', name: 'Task' })).toBe(true);
    expect(lesson.isSubagentCall({ type: 'tool_use', name: 'Read' })).toBe(false);
  });
  it('lists only the coordinator-level delegations', () => {
    const stream = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'source-analyst' } }] } },
      { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
      { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'report-writer' } }] } },
      { type: 'result', subtype: 'success' },
    ];
    expect(lesson.listDelegations(stream)).toEqual(['source-analyst', 'report-writer']);
  });
});
