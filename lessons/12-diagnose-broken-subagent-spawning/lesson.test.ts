import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';

type Lesson = typeof import('./solution/index.ts');
type Setup = import('./solution/index.ts').SpawnSetup;
const lesson = await loadLesson<Lesson>(import.meta.url);

const GOOD_AGENT = {
  description: 'Reads local sources and extracts findings with metadata. Use for questions the corpus answers.',
  prompt: 'Extract findings.',
  tools: ['Read', 'Grep', 'Glob'],
};

function setup(overrides: Partial<Setup> & { options?: Record<string, unknown> } = {}): Setup {
  return {
    headless: false,
    expectedAgents: ['analyst'],
    ...overrides,
    options: { allowedTools: ['Agent', 'Read'], agents: { analyst: GOOD_AGENT }, ...overrides.options },
  };
}
const codes = (s: Setup) => lesson.diagnose(s).map((f) => (f.agent ? `${f.code}:${f.agent}` : f.code)).sort();

describe('baseline', () => {
  it('a healthy setup has no findings', () => {
    expect(lesson.diagnose(setup())).toEqual([]);
  });
});

describe('TODO(1) AGENT_NOT_REGISTERED', () => {
  it('flags an expected agent missing from options.agents', () => {
    expect(codes(setup({ expectedAgents: ['analyst', 'writer'] }))).toEqual(['AGENT_NOT_REGISTERED:writer']);
  });
  it('flags every expected agent when agents were never passed', () => {
    expect(codes(setup({ options: { agents: undefined } }))).toContain('AGENT_NOT_REGISTERED:analyst');
  });
});

describe('TODO(2) SPAWN_TOOL_UNAVAILABLE', () => {
  it('flags a base tool set without the spawn tool', () => {
    expect(codes(setup({ options: { tools: ['Read', 'Grep'] } }))).toEqual(['SPAWN_TOOL_UNAVAILABLE']);
  });
  it('flags a main-thread agent whose tools omit the spawn tool', () => {
    const s = setup({ options: { agent: 'lead', agents: { analyst: GOOD_AGENT, lead: { ...GOOD_AGENT, tools: ['Read'] } } } });
    expect(codes(s)).toEqual(['SPAWN_TOOL_UNAVAILABLE']);
  });
  it('flags the spawn tool in disallowedTools', () => {
    expect(codes(setup({ options: { disallowedTools: ['Agent'] } }))).toEqual(['SPAWN_TOOL_UNAVAILABLE']);
  });
  it('accepts Agent, legacy Task, Agent(type) or no restriction at all', () => {
    for (const tools of [['Agent', 'Read'], ['Task'], ['Agent(analyst)', 'Read'], undefined]) {
      expect(codes(setup({ options: { tools } })), String(tools)).toEqual([]);
    }
  });
});

describe('TODO(3) SPAWN_TOOL_NOT_APPROVED', () => {
  it('flags a headless run that does not pre-approve the spawn tool', () => {
    expect(codes(setup({ headless: true, options: { allowedTools: ['Read'] } }))).toEqual(['SPAWN_TOOL_NOT_APPROVED']);
  });
  it('accepts bypassPermissions or a canUseTool callback, and interactive runs', () => {
    expect(codes(setup({ headless: true, options: { allowedTools: [], permissionMode: 'bypassPermissions' } }))).toEqual([]);
    expect(codes(setup({ headless: true, options: { allowedTools: [], canUseTool: async () => ({ behavior: 'allow' }) } }))).toEqual([]);
    expect(codes(setup({ headless: false, options: { allowedTools: [] } }))).toEqual([]);
  });
});

describe('TODO(4) UNKNOWN_FIELD', () => {
  it('flags fields AgentDefinition does not have (they are silently ignored)', () => {
    const s = setup({ options: { agents: { analyst: { ...GOOD_AGENT, allowedTools: ['Read'], system_prompt: 'x' } } } });
    expect(codes(s)).toEqual(['UNKNOWN_FIELD:analyst', 'UNKNOWN_FIELD:analyst']);
  });
});

describe('TODO(5) UNKNOWN_TOOL', () => {
  it('flags misspelled or wrong-case tool names, but accepts MCP tool names', () => {
    const s = setup({ options: { agents: { analyst: { ...GOOD_AGENT, tools: ['read', 'WebSearchTool', 'mcp__docs__search', 'Grep'] } } } });
    expect(codes(s)).toEqual(['UNKNOWN_TOOL:analyst', 'UNKNOWN_TOOL:analyst']);
  });
});

describe('TODO(6) TOOL_CONFLICT', () => {
  it('flags a tool that is both allowed and disallowed', () => {
    const s = setup({ options: { agents: { analyst: { ...GOOD_AGENT, disallowedTools: ['Grep'] } } } });
    expect(codes(s)).toEqual(['TOOL_CONFLICT:analyst']);
  });
});

describe('TODO(7) VAGUE_DESCRIPTION', () => {
  it('flags one-word or cue-less descriptions', () => {
    expect(codes(setup({ options: { agents: { analyst: { ...GOOD_AGENT, description: 'Analyst' } } } }))).toEqual(['VAGUE_DESCRIPTION:analyst']);
    const noCue = 'Reads local sources and extracts findings with their metadata and quotes.';
    expect(codes(setup({ options: { agents: { analyst: { ...GOOD_AGENT, description: noCue } } } }))).toEqual(['VAGUE_DESCRIPTION:analyst']);
  });
});

describe('the incident', () => {
  it('diagnose(BROKEN_SETUP) finds every fault', () => {
    expect(codes(lesson.BROKEN_SETUP)).toEqual(
      [
        'AGENT_NOT_REGISTERED:web-researcher',
        'MISSING_REQUIRED_FIELD:fact-checker',
        'SPAWN_TOOL_NOT_APPROVED',
        'SPAWN_TOOL_UNAVAILABLE',
        'TOOL_CONFLICT:fact-checker',
        'UNKNOWN_FIELD:fact-checker',
        'UNKNOWN_FIELD:report-writer',
        'UNKNOWN_TOOL:source-analyst',
        'VAGUE_DESCRIPTION:source-analyst',
      ].sort(),
    );
  });

  describe('TODO(8) FIXED_SETUP', () => {
    const agents = lesson.FIXED_SETUP.options.agents as Record<string, { tools?: string[] }>;
    it('has no findings', () => {
      expect(lesson.diagnose(lesson.FIXED_SETUP)).toEqual([]);
    });
    it('registers all four agents with least-privilege tools', () => {
      expect(Object.keys(agents).sort()).toEqual(['fact-checker', 'report-writer', 'source-analyst', 'web-researcher']);
      expect([...(agents['web-researcher']?.tools ?? [])].sort()).toEqual(['WebFetch', 'WebSearch']);
      expect([...(agents['fact-checker']?.tools ?? [])].sort()).toEqual(['Read', 'WebFetch']);
      expect(agents['report-writer']?.tools).toContain('Write');
      expect(agents['source-analyst']?.tools).not.toContain('Write');
    });
  });
});
