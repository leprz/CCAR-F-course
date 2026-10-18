import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { GUIDANCE, type Mechanism } from './scenarios.ts';
import { asList, matchesGlob, Sandbox } from './support/config-files.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);
const box = Sandbox.forLesson(import.meta.url);

const EXPECTED: Record<string, Mechanism> = {
  G1: 'claude-md',
  G2: 'path-rule',
  G3: 'hook',
  G4: 'permissions',
  G5: 'skill',
  G6: 'subagent',
  G7: 'path-rule',
  G8: 'permissions',
  G9: 'skill',
  G10: 'hook',
};

describe('TODO(1) chooseMechanism', () => {
  for (const g of GUIDANCE) {
    it(`${g.id}: ${g.text}`, () => {
      expect(lesson.chooseMechanism(g)).toBe(EXPECTED[g.id]);
    });
  }
});

describe('TODO(2) CLAUDE.md keeps only always-relevant facts', () => {
  const claudeMd = () => box.text('CLAUDE.md');
  it('still holds the repo-wide money rules and commands', () => {
    expect(claudeMd()).toMatch(/integer cents/i);
    expect(claudeMd()).toMatch(/npm test/);
  });
  it('no longer carries path-specific route or test rules', () => {
    expect(claudeMd()).not.toMatch(/verbs in paths/i);
    expect(claudeMd()).not.toMatch(/makeOrder/);
  });
  it('no longer carries the release procedure (that is a skill)', () => {
    expect(claudeMd()).not.toMatch(/release notes/i);
  });
  it('no longer pretends advisory text enforces .env, migrations or formatting rules', () => {
    expect(claudeMd()).not.toMatch(/\.env|migrations|prettier/i);
  });
  it('stays short', () => {
    expect(claudeMd().trim().split('\n').length).toBeLessThanOrEqual(25);
  });
});

describe('TODO(3) path-scoped rules', () => {
  const rules = () =>
    box.list('.claude/rules').map((rel) => ({ rel, ...box.markdown(rel) }));
  const ruleFor = (file: string) => rules().filter((r) => asList(r.frontmatter.paths).some((p) => matchesGlob(file, p)));

  it('a rule with HTTP conventions loads for route files only', () => {
    const matching = ruleFor('src/routes/orders.ts');
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.map((r) => r.body).join('\n')).toMatch(/httpError/);
    expect(matching.map((r) => r.body).join('\n')).toMatch(/authorize/);
    expect(ruleFor('src/services/billingService.ts').some((r) => /httpError/.test(r.body))).toBe(false);
  });
  it('a rule with test conventions loads for test files', () => {
    expect(ruleFor('tests/billingService.spec.ts').map((r) => r.body).join('\n')).toMatch(/makeOrder/);
  });
});

describe('TODO(4) settings: deterministic controls', () => {
  interface Settings {
    permissions?: { allow?: string[]; deny?: string[] };
    hooks?: Record<string, { matcher?: string; hooks: { type: string; command?: string }[] }[]>;
  }
  const settings = () => box.json<Settings>('.claude/settings.json');

  it('denies reading .env files', () => {
    expect(settings().permissions?.deny ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/^Read\(\.?\/?\.env\)$/)]));
  });
  it('denies edits and writes under migrations/', () => {
    const deny = settings().permissions?.deny ?? [];
    expect(deny.some((r) => /^Edit\(.*migrations/.test(r))).toBe(true);
    expect(deny.some((r) => /^Write\(.*migrations/.test(r))).toBe(true);
  });
  it('formats every edited file with a PostToolUse hook on Edit and Write', () => {
    const groups = settings().hooks?.PostToolUse ?? [];
    const formatter = groups.find((g) => g.hooks.some((h) => /prettier/.test(h.command ?? '')));
    expect(formatter).toBeDefined();
    const matcher = formatter!.matcher ?? '';
    expect(matcher.split('|')).toEqual(expect.arrayContaining(['Edit', 'Write']));
  });
});

describe('TODO(5) context: fork where isolation pays off, and only there', () => {
  it('money-audit runs forked, in a read-only Explore subagent', () => {
    const fm = box.markdown('.claude/skills/money-audit/SKILL.md').frontmatter;
    expect(fm.context).toBe('fork');
    expect(fm.agent).toBe('Explore');
  });
  it("money-audit's body is self-contained (it can't see the conversation)", () => {
    const body = box.markdown('.claude/skills/money-audit/SKILL.md').body;
    expect(body).toMatch(/integer cents/i);
    expect(body).toMatch(/return|report/i);
  });
  it('money-style (guidelines, no task) is NOT forked', () => {
    expect(box.markdown('.claude/skills/money-style/SKILL.md').frontmatter.context).toBeUndefined();
  });
});

describe('TODO(6) side-effecting skills are user-invoked only', () => {
  it('release has disable-model-invocation: true', () => {
    expect(box.markdown('.claude/skills/release/SKILL.md').frontmatter['disable-model-invocation']).toBe(true);
  });
});
