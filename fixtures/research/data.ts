/**
 * Research scenario: "Does a four-day work week improve software team productivity?"
 *
 * Ten short sources of mixed quality. They deliberately disagree, one is outdated and studies a different
 * intervention, one is a vendor whitepaper with an unsupported headline number, and one is an anecdotal blog.
 * `ANSWER_KEY` records which claims the evidence actually supports, for grading synthesis (Part 6).
 */

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

export const sources: ResearchSource[] = [
  {
    id: 'S1',
    title: 'Four-day week pilot: 12-month outcomes across 61 organisations',
    author: 'Schor, J. et al.',
    org: 'Boston College / 4 Day Week Global',
    date: '2025-03-14',
    type: 'peer-reviewed',
    url: 'https://example.org/research/s1-four-day-week-pilot',
    basis: '61 organisations, ~2,900 employees, 12 months, self-selected participants',
    excerpt:
      'Burnout scores fell significantly and stayed lower at 12 months. Self-reported productivity was maintained; ' +
      'organisational revenue was flat to slightly up. Participating firms opted in, which limits generalisation.',
    findings: [
      { claim: 'wellbeing', direction: 'improves', statement: 'Burnout fell and stayed lower at 12 months.', metric: '71% reported lower burnout' },
      { claim: 'output', direction: 'no-change', statement: 'Productivity was maintained, not increased, by self-report and revenue.' },
      { claim: 'retention', direction: 'improves', statement: 'Resignations declined during the trial.', metric: 'resignations -57%' },
    ],
    qualityNotes: ['Self-selected firms', 'Productivity largely self-reported'],
  },
  {
    id: 'S2',
    title: 'Reduced working time and software delivery: evidence from engineering telemetry',
    author: 'Okafor, N. and Lindqvist, M.',
    org: 'KTH Royal Institute of Technology',
    date: '2025-11-02',
    type: 'peer-reviewed',
    url: 'https://example.org/research/s2-engineering-telemetry',
    basis: '14 software companies, 410 engineers, difference-in-differences on merged PRs and deploys',
    excerpt:
      'Merged pull requests per engineer per week did not change significantly after the switch (−2%, CI −7% to +3%). ' +
      'Meeting hours dropped by 30%. Teams with on-call rotations saw median incident acknowledgement time rise.',
    findings: [
      { claim: 'output', direction: 'no-change', statement: 'Objective delivery metrics (PRs, deploys) unchanged.', metric: 'PRs/engineer −2% (CI −7%..+3%)' },
      { claim: 'collaboration', direction: 'mixed', statement: 'Fewer meetings, but cross-timezone handoffs got harder.', metric: 'meeting hours −30%' },
      { claim: 'on-call', direction: 'worsens', statement: 'Median incident acknowledgement time increased for on-call teams.', metric: 'median ack +11 min' },
    ],
    qualityNotes: ['Objective metrics', 'PR counts are an imperfect proxy for value'],
  },
  {
    id: 'S3',
    title: 'Shorter working week trial: final evaluation report',
    author: 'Department for Work Evaluation Unit',
    org: 'UK Government (illustrative)',
    date: '2024-09-20',
    type: 'government',
    url: 'https://example.org/research/s3-government-evaluation',
    basis: 'Public-sector IT and admin teams, 18 months, matched comparison group',
    excerpt:
      'Staff wellbeing and retention improved relative to comparison teams. Service performance indicators were maintained. ' +
      'Out-of-hours IT support required additional rota planning.',
    findings: [
      { claim: 'wellbeing', direction: 'improves', statement: 'Wellbeing improved versus a matched comparison group.' },
      { claim: 'retention', direction: 'improves', statement: 'Staff turnover fell versus the comparison group.', metric: 'turnover −35%' },
      { claim: 'output', direction: 'no-change', statement: 'Service performance indicators were maintained.' },
      { claim: 'on-call', direction: 'mixed', statement: 'Out-of-hours support needed extra rota planning; no SLA breach reported.' },
    ],
    qualityNotes: ['Matched comparison group', 'Public sector, not product engineering'],
  },
  {
    id: 'S4',
    title: 'State of Developer Work 2026',
    author: 'Survey team',
    org: 'DevPulse (developer survey)',
    date: '2026-02-10',
    type: 'survey',
    url: 'https://example.org/research/s4-devpulse-survey',
    basis: '8,200 self-selected respondents; 6% work a four-day week',
    excerpt:
      'Developers on four-day weeks report higher job satisfaction and say they would not return to five days. ' +
      'They also report more context switching on their working days.',
    findings: [
      { claim: 'wellbeing', direction: 'improves', statement: 'Higher reported satisfaction among four-day-week developers.' },
      { claim: 'collaboration', direction: 'worsens', statement: 'More reported context switching on working days.' },
    ],
    qualityNotes: ['Correlational', 'Self-selected respondents'],
  },
  {
    id: 'S5',
    title: 'How our startup doubled velocity with a 4-day week',
    author: 'J. Reyes (CTO)',
    org: 'Personal engineering blog',
    date: '2025-06-01',
    type: 'blog',
    url: 'https://example.org/research/s5-cto-blog',
    basis: 'One 9-person team, story points before/after',
    excerpt:
      'Our story-point velocity doubled within two months of switching. Everyone is happier and nobody wants to go back.',
    findings: [
      { claim: 'output', direction: 'improves', statement: 'Story-point velocity doubled for one team.', metric: 'velocity ×2' },
      { claim: 'wellbeing', direction: 'improves', statement: 'Team reports being happier.' },
    ],
    qualityNotes: ['Anecdotal, n=1 team', 'Story points are not comparable over time'],
  },
  {
    id: 'S6',
    title: 'The 40% Productivity Dividend: Why Compressed Weeks Pay Off',
    author: 'Marketing research team',
    org: 'FlexiSched Inc. (scheduling software vendor)',
    date: '2025-09-15',
    type: 'vendor-whitepaper',
    url: 'https://example.org/research/s6-vendor-whitepaper',
    basis: 'Not disclosed',
    excerpt:
      'Companies adopting a four-day week with FlexiSched see productivity gains of up to 40%. Start your free trial today.',
    findings: [{ claim: 'output', direction: 'improves', statement: 'Productivity gains of up to 40%.', metric: '+40% (up to)' }],
    qualityNotes: ['Vendor sells the solution', 'Methodology and sample not disclosed', '"Up to" figure'],
  },
  {
    id: 'S7',
    title: 'Compressed work weeks (4×10) and employee performance',
    author: 'Baltes, B. et al. (summary)',
    org: 'Journal of Applied Psychology (meta-analysis summary)',
    date: '2009-05-01',
    type: 'peer-reviewed',
    url: 'https://example.org/research/s7-compressed-weeks-2009',
    basis: 'Meta-analysis of compressed schedules: same 40 hours in 4 days',
    excerpt:
      'Compressed schedules (4×10h) improved schedule satisfaction but had no effect on productivity, and fatigue increased on long days.',
    findings: [
      { claim: 'output', direction: 'no-change', statement: 'No productivity effect from 4×10 compressed schedules.' },
      { claim: 'wellbeing', direction: 'mixed', statement: 'Higher schedule satisfaction, more fatigue on 10-hour days.' },
    ],
    qualityNotes: ['Outdated (2009)', 'Different intervention: 4×10 hours, not reduced hours'],
  },
  {
    id: 'S8',
    title: 'Four-day weeks: the on-call problem nobody talks about',
    author: 'A. Brandt',
    org: 'InfoQ (news/feature)',
    date: '2026-01-22',
    type: 'news',
    url: 'https://example.org/research/s8-on-call-feature',
    basis: 'Interviews with SRE leads at 6 companies',
    excerpt:
      'Several SRE leads describe thinner coverage on Fridays and slower incident response, while two report no change after adding a rotating Friday shift.',
    findings: [
      { claim: 'on-call', direction: 'mixed', statement: 'Some teams saw slower incident response; teams with a Friday rota saw no change.' },
    ],
    qualityNotes: ['Interview-based', 'Small sample'],
  },
  {
    id: 'S9',
    title: 'Hours reduction and output in knowledge work: a randomised field experiment',
    author: 'Tanaka, H. and Moretti, E.',
    org: 'NBER working paper',
    date: '2026-04-30',
    type: 'peer-reviewed',
    url: 'https://example.org/research/s9-field-experiment',
    basis: 'Randomised: 1,100 employees at a software services firm, 9 months',
    excerpt:
      'Treated teams delivered 9% fewer client deliverables per week; output per hour rose 13%. Retention improved. ' +
      'Effects on output were driven by client-facing teams with fixed response obligations.',
    findings: [
      { claim: 'output', direction: 'worsens', statement: 'Total weekly deliverables fell 9%, though output per hour rose 13%.', metric: 'deliverables −9%, per-hour +13%' },
      { claim: 'retention', direction: 'improves', statement: 'Retention improved in treated teams.' },
    ],
    qualityNotes: ['Randomised design', 'Working paper (not yet peer-reviewed in a journal)', 'Services firm, not product company'],
  },
  {
    id: 'S10',
    title: 'Four-day week trial in Iceland: a reanalysis',
    author: 'Haraldsdóttir, G.',
    org: 'University of Iceland',
    date: '2023-08-11',
    type: 'peer-reviewed',
    url: 'https://example.org/research/s10-iceland-reanalysis',
    basis: 'Public sector, 2,500 workers, 35–36h weeks (not a full fifth day off)',
    excerpt:
      'Wellbeing improved substantially and service provision was maintained. Note the reduction was to 35–36 hours, not 32.',
    findings: [
      { claim: 'wellbeing', direction: 'improves', statement: 'Substantial wellbeing improvement.' },
      { claim: 'output', direction: 'no-change', statement: 'Service provision maintained.' },
    ],
    qualityNotes: ['Smaller hours reduction than a true four-day week', 'Public sector'],
  },
];

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
