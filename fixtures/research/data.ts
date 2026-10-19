/**
 * Research scenario: "Does a four-day work week improve software team productivity?"
 *
 * Ten short sources of mixed quality. They deliberately disagree, one is outdated and studies a different
 * intervention, one is a vendor whitepaper with an unsupported headline number, and one is an anecdotal blog.
 * Each source is `sources/<id>.md`, the markdown an agent reads. `ANSWER_KEY` records which claims the evidence actually supports, for grading synthesis (Part 6).
 */

import { readFileSync } from 'node:fs';

export const RESEARCH_QUESTION = 'Does a four-day work week (same pay, ~32 hours) improve software team productivity?';

export type SourceType = 'peer-reviewed' | 'government' | 'survey' | 'news' | 'blog' | 'vendor-whitepaper';

export type ClaimId =
  | 'wellbeing' // burnout / stress / wellbeing
  | 'retention' // attrition, hiring
  | 'output' // delivered output / productivity
  | 'on-call' // incident response / support coverage
  | 'collaboration'; // meetings, cross-team coordination

export interface SourceFinding {
  claim: ClaimId;
  direction: 'improves' | 'worsens' | 'no-change' | 'mixed';
  statement: string;
  /** Optional quantitative result exactly as the source reports it. */
  metric?: string;
}

export interface ResearchSource {
  id: string;
  title: string;
  author: string;
  org: string;
  /** ISO date of publication. */
  date: string;
  type: SourceType;
  url: string;
  /** Sample size or basis, when stated. */
  basis: string;
  excerpt: string;
  findings: SourceFinding[];
  /** Caveats a careful reader should notice. Not given to the model as "the answer". */
  qualityNotes: string[];
}

/**
 * What the source files don't say: the direction of each reported finding (keyed by claim) and the caveats a
 * careful reader should notice. Not given to the model as "the answer".
 */
const ANNOTATIONS: Record<string, { direction: Partial<Record<ClaimId, SourceFinding['direction']>>; qualityNotes: string[] }> = {
  S1: {
    direction: { wellbeing: 'improves', output: 'no-change', retention: 'improves' },
    qualityNotes: ['Self-selected firms', 'Productivity largely self-reported'],
  },
  S2: {
    direction: { output: 'no-change', collaboration: 'mixed', 'on-call': 'worsens' },
    qualityNotes: ['Objective metrics', 'PR counts are an imperfect proxy for value'],
  },
  S3: {
    direction: { wellbeing: 'improves', retention: 'improves', output: 'no-change', 'on-call': 'mixed' },
    qualityNotes: ['Matched comparison group', 'Public sector, not product engineering'],
  },
  S4: {
    direction: { wellbeing: 'improves', collaboration: 'worsens' },
    qualityNotes: ['Correlational', 'Self-selected respondents'],
  },
  S5: {
    direction: { output: 'improves', wellbeing: 'improves' },
    qualityNotes: ['Anecdotal, n=1 team', 'Story points are not comparable over time'],
  },
  S6: {
    direction: { output: 'improves' },
    qualityNotes: ['Vendor sells the solution', 'Methodology and sample not disclosed', '"Up to" figure'],
  },
  S7: {
    direction: { output: 'no-change', wellbeing: 'mixed' },
    qualityNotes: ['Outdated (2009)', 'Different intervention: 4×10 hours, not reduced hours'],
  },
  S8: {
    direction: { 'on-call': 'mixed' },
    qualityNotes: ['Interview-based', 'Small sample'],
  },
  S9: {
    direction: { output: 'worsens', retention: 'improves' },
    qualityNotes: ['Randomised design', 'Working paper (not yet peer-reviewed in a journal)', 'Services firm, not product company'],
  },
  S10: {
    direction: { wellbeing: 'improves', output: 'no-change' },
    qualityNotes: ['Smaller hours reduction than a true four-day week', 'Public sector'],
  },
};

/** Parse `sources/<id>.md`, the markdown an agent reads (see sourceToMarkdown), and add the annotations. */
function readSource(id: string): ResearchSource {
  const md = readFileSync(new URL(`./sources/${id}.md`, import.meta.url), 'utf8');
  const [head = '', findingsBlock = ''] = md.split('\n## Reported findings\n');
  const [titleLine = '', metaBlock = '', ...rest] = head.split('\n\n');
  const meta = Object.fromEntries(metaBlock.split('\n').map((l) => l.replace(/^- /, '').split(/: (.*)/s).slice(0, 2)));
  const notes = ANNOTATIONS[id];
  if (!notes) throw new Error(`No annotations for research source ${id}`);
  const findings = findingsBlock
    .split('\n')
    .filter((l) => l.startsWith('- ('))
    .map((l): SourceFinding => {
      const m = /^- \(([^)]+)\) (.*?)(?: \[(.*)\])?$/.exec(l);
      if (!m) throw new Error(`Unreadable finding in ${id}.md: ${l}`);
      const claim = m[1] as ClaimId;
      const direction = notes.direction[claim];
      if (!direction) throw new Error(`No direction for ${id} ${claim}`);
      return { claim, direction, statement: m[2]!, ...(m[3] ? { metric: m[3] } : {}) };
    });
  return {
    id: meta.id,
    title: titleLine.replace(/^# /, ''),
    author: meta.author,
    org: meta.org,
    date: meta.date,
    type: meta.type as SourceType,
    url: meta.url,
    basis: meta.basis,
    excerpt: rest.join('\n\n').trim(),
    findings,
    qualityNotes: notes.qualityNotes,
  };
}

export const sources: ResearchSource[] = Object.keys(ANNOTATIONS).map(readSource);

export type ClaimStatus = 'well-established' | 'contested' | 'insufficient-evidence';

export interface AnswerKeyEntry {
  claim: ClaimId;
  status: ClaimStatus;
  /** What a careful synthesis should say. */
  summary: string;
  supportingSources: string[];
  conflictingSources: string[];
  /** Sources a careful synthesis should discount, with the reason. */
  discount: Record<string, string>;
}

export const ANSWER_KEY: AnswerKeyEntry[] = [
  {
    claim: 'wellbeing',
    status: 'well-established',
    summary: 'Multiple independent studies, including ones with comparison groups, find reduced burnout and improved wellbeing.',
    supportingSources: ['S1', 'S3', 'S4', 'S10'],
    conflictingSources: [],
    discount: { S7: 'outdated and studies 4×10 compressed hours, a different intervention', S5: 'anecdotal' },
  },
  {
    claim: 'retention',
    status: 'well-established',
    summary: 'Turnover falls in pilots, a government comparison study and a randomised experiment.',
    supportingSources: ['S1', 'S3', 'S9'],
    conflictingSources: [],
    discount: {},
  },
  {
    claim: 'output',
    status: 'contested',
    summary:
      'Rigorous studies mostly find output maintained (S1, S2, S3, S10), one randomised study finds total output fell 9% while output per hour rose (S9). ' +
      'Claims of large gains rest on an anecdote (S5) and an undisclosed vendor figure (S6).',
    supportingSources: ['S1', 'S2', 'S3', 'S10'],
    conflictingSources: ['S9'],
    discount: { S5: 'single team, story points', S6: 'vendor marketing, no methodology', S7: 'outdated, different intervention' },
  },
  {
    claim: 'on-call',
    status: 'contested',
    summary: 'Evidence of slower incident response for on-call teams (S2, S8) but mitigated by rota design (S3, S8). Limited, mostly qualitative.',
    supportingSources: ['S2'],
    conflictingSources: ['S3', 'S8'],
    discount: {},
  },
  {
    claim: 'collaboration',
    status: 'insufficient-evidence',
    summary: 'Fewer meetings (S2) but more context switching (S4); too little evidence to conclude.',
    supportingSources: ['S2'],
    conflictingSources: ['S4'],
    discount: {},
  },
];
