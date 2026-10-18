import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, toolUse } from '../../lib/testing/index.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const CONVENTIONS = loadCodebase()['CONVENTIONS.md']!;
const source = () => loadCodebase({ include: (p) => p.startsWith('src/') });
const tmp = () => mkdtemp(path.join(tmpdir(), 'l10-'));
const userText = (call: MessageCreateParamsNonStreaming | undefined) => JSON.stringify(call?.messages ?? []);

/** Scripted model: answers every analyze call with one finding mentioning the file it was given. */
const reviewer = () =>
  new FakeClient(
    Array.from({ length: 50 }, () => (params: MessageCreateParamsNonStreaming) => {
      const file = /<file path="([^"]+)"/.exec(String(params.messages[0]?.content))?.[1] ?? 'unknown';
      return reply([toolUse('report_findings', { findings: [{ category: 'security', summary: `issue in ${file}` }] })]);
    }),
  );

describe('TODO(1) diffSnapshots', () => {
  it('detects changed content even when the path is the same', () => {
    const prev = { 'a.ts': 'h1', 'b.ts': 'h2', 'c.ts': 'h3' };
    const curr = { 'a.ts': 'h1', 'b.ts': 'h2-edited', 'd.ts': 'h4' };
    expect(lesson.diffSnapshots(prev, curr)).toEqual({
      added: ['d.ts'],
      changed: ['b.ts'],
      removed: ['c.ts'],
      unchanged: ['a.ts'],
    });
  });
});

describe('TODO(2) scratchpad persistence', () => {
  it('returns null when there is no previous session', async () => {
    await expect(lesson.loadScratchpad(path.join(await tmp(), 'missing.json'))).resolves.toBeNull();
  });
  it('round-trips hashes and findings and leaves no temp file behind', async () => {
    const dir = await tmp();
    const file = path.join(dir, 'review.json');
    const pad = { version: 1 as const, updatedAt: '2026-10-18T00:00:00.000Z', fileHashes: { 'a.ts': 'h1' }, findings: [{ file: 'a.ts', category: 'security' as const, summary: 'x' }] };
    await lesson.saveScratchpad(file, pad);
    await expect(lesson.loadScratchpad(file)).resolves.toEqual(pad);
    expect(await readdir(dir)).toEqual(['review.json']);
  });
  it('still throws on a corrupt scratchpad instead of silently starting over', async () => {
    const file = path.join(await tmp(), 'bad.json');
    await writeFile(file, '{not json');
    await expect(lesson.loadScratchpad(file)).rejects.toThrow();
  });
});

describe('TODO(3) planResume', () => {
  it('re-analyzes only changed and added files and carries the rest', () => {
    const files = { 'a.ts': 'A', 'b.ts': 'B2', 'd.ts': 'D' };
    const pad = {
      version: 1 as const,
      updatedAt: 'x',
      fileHashes: lesson.snapshot({ 'a.ts': 'A', 'b.ts': 'B', 'c.ts': 'C' }),
      findings: [
        { file: 'a.ts', category: 'security' as const, summary: 'a1' },
        { file: 'b.ts', category: 'api-design' as const, summary: 'b1' },
        { file: 'c.ts', category: 'business-logic' as const, summary: 'c1' },
      ],
    };
    expect(lesson.planResume(pad, files)).toEqual({
      toAnalyze: ['b.ts', 'd.ts'],
      carried: [{ file: 'a.ts', category: 'security', summary: 'a1' }],
      reverify: [{ file: 'b.ts', category: 'api-design', summary: 'b1' }],
      removed: ['c.ts'],
    });
  });
  it('analyzes everything on the first session', () => {
    expect(lesson.planResume(null, { 'z.ts': '1', 'a.ts': '2' }).toAnalyze).toEqual(['a.ts', 'z.ts']);
  });
});

describe('TODO(4) analyzeFile isolation', () => {
  it('sends one fresh message with only this file, conventions in system, forced tool', async () => {
    const files = source();
    const client = reviewer();
    const findings = await lesson.analyzeFile(client, 'src/config.ts', files['src/config.ts']!, {
      conventions: CONVENTIONS,
      prior: [{ file: 'src/config.ts', category: 'security', summary: 'hard-coded payments key' }],
    });
    const call = client.calls[0]!;
    expect(call.messages).toHaveLength(1);
    expect(String(call.system)).toContain('Accepted patterns');
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'report_findings' });
    expect(userText(call)).toContain('<file path=\\"src/config.ts\\">');
    expect(userText(call)).toContain('hard-coded payments key');
    expect(userText(call)).not.toContain('orderRepository');
    expect(findings).toEqual([{ file: 'src/config.ts', category: 'security', summary: 'issue in src/config.ts' }]);
  });
});

describe('TODO(5) resumeReview', () => {
  it('second session re-analyzes only the edited file and keeps earlier findings', async () => {
    const padPath = path.join(await tmp(), 'review.json');
    const files = source();

    const first = reviewer();
    const one = await lesson.resumeReview(first, padPath, files, { conventions: CONVENTIONS });
    expect(first.calls).toHaveLength(Object.keys(files).length);
    expect(one.pad.fileHashes).toEqual(lesson.snapshot(files));

    const edited = { ...files, 'src/config.ts': files['src/config.ts']!.replace(/sk_live_FAKE_\w+/, '') };
    const second = reviewer();
    const two = await lesson.resumeReview(second, padPath, edited, { conventions: CONVENTIONS });
    expect(second.calls).toHaveLength(1);
    expect(two.analyzed).toEqual(['src/config.ts']);
    expect(userText(second.calls[0])).toContain('issue in src/config.ts'); // prior finding injected to re-verify
    expect(two.pad.findings).toHaveLength(Object.keys(files).length);
    expect(await lesson.loadScratchpad(padPath)).toEqual(two.pad);
  });
});

describe('TODO(6) resumeBriefing', () => {
  it('summarizes state for a resumed session without pasting file contents', () => {
    const pad = {
      version: 1 as const,
      updatedAt: '2026-10-18T00:00:00.000Z',
      fileHashes: {},
      findings: [{ file: 'src/routes/orders.ts', category: 'security' as const, summary: 'GET /orders/:id has no authorize call' }],
    };
    const briefing = lesson.resumeBriefing(pad, { toAnalyze: ['src/config.ts'], carried: [], reverify: [], removed: ['src/old.ts'] });
    expect(briefing).toContain('GET /orders/:id has no authorize call');
    expect(briefing).toContain('src/config.ts');
    expect(briefing).toContain('src/old.ts');
    expect(briefing).not.toContain('loadConfig(');
  });
});

describe('TODO(7) agentSdkResumeOptions', () => {
  it('resumes in place, or forks into a new session id', () => {
    expect(lesson.agentSdkResumeOptions('sess-1')).toEqual({ resume: 'sess-1' });
    expect(lesson.agentSdkResumeOptions('sess-1', { fork: true })).toEqual({ resume: 'sess-1', forkSession: true });
  });
});
