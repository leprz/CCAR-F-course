import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RESEARCH_QUESTION, sources, type ResearchSource } from './data.ts';

/** Render one source as the markdown file an agent would read with Read/Grep. */
export function sourceToMarkdown(s: ResearchSource): string {
  return [
    `# ${s.title}`,
    '',
    `- id: ${s.id}`,
    `- author: ${s.author}`,
    `- org: ${s.org}`,
    `- date: ${s.date}`,
    `- type: ${s.type}`,
    `- url: ${s.url}`,
    `- basis: ${s.basis}`,
    '',
    s.excerpt,
    '',
    '## Reported findings',
    ...s.findings.map((f) => `- (${f.claim}) ${f.statement}${f.metric ? ` [${f.metric}]` : ''}`),
    '',
  ].join('\n');
}

/**
 * Write the corpus to `<dir>/sources/S*.md` plus `<dir>/QUESTION.md`, for live tests where a real agent
 * explores files. Returns the directory. Creates a temp dir when none is given.
 */
export async function materializeSources(dir?: string): Promise<string> {
  const root = dir ?? (await mkdtemp(path.join(tmpdir(), 'research-')));
  await mkdir(path.join(root, 'sources'), { recursive: true });
  await writeFile(path.join(root, 'QUESTION.md'), `# Research question\n\n${RESEARCH_QUESTION}\n`);
  await Promise.all(sources.map((s) => writeFile(path.join(root, 'sources', `${s.id}.md`), sourceToMarkdown(s))));
  return root;
}
