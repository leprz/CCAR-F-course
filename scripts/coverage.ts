/**
 * Merge a teach-me `progress.json` export into COVERAGE.md.
 *
 *   npx tsx scripts/coverage.ts [progress.json] [COVERAGE.md]
 *
 * Defaults: ./progress.json and ./COVERAGE.md (relative to the current directory).
 *
 * Only the region between `<!-- coverage:start -->` and `<!-- coverage:end -->`
 * is touched. In the markdown table inside it, the first column holds the
 * objective id (e.g. `O01`) and the column titled `Latest quiz` is set to
 * `NN% (c/t, YYYY-MM-DD)` from progress.json. Rows without data in progress.json
 * keep their current cell (`–` when blank), so an export from a browser with
 * cleared storage never wipes older results.
 * Running it twice with the same input gives the same file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const START = '<!-- coverage:start -->';
const END = '<!-- coverage:end -->';
const COLUMN = 'Latest quiz';
const EMPTY = '–';

interface ObjectiveResult {
  correct: number;
  total: number;
  lastAttempt: string;
  source?: string;
}

interface Progress {
  exportedAt?: string;
  objectives: Record<string, ObjectiveResult>;
}

function fail(message: string): never {
  console.error(`coverage: ${message}`);
  process.exit(1);
}

function readProgress(path: string): Progress {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read ${path} (export it from the teach-me portal: "Export progress")`);
  }
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null || !('objectives' in data)) {
    fail(`${path} has no "objectives" object`);
  }
  const objectives = (data as { objectives: unknown }).objectives;
  if (typeof objectives !== 'object' || objectives === null) fail(`${path}: "objectives" must be an object`);
  return data as Progress;
}

function formatResult(r: ObjectiveResult | undefined): string {
  if (!r || typeof r.correct !== 'number' || typeof r.total !== 'number' || r.total <= 0) return EMPTY;
  const pct = Math.round((100 * r.correct) / r.total);
  const date = typeof r.lastAttempt === 'string' ? r.lastAttempt.slice(0, 10) : '';
  return date ? `${pct}% (${r.correct}/${r.total}, ${date})` : `${pct}% (${r.correct}/${r.total})`;
}

/** Split a markdown table row into trimmed cells (no escaped-pipe support needed here). */
function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map((c) => c.trim());
}

function joinRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

const isTableRow = (line: string): boolean => line.trim().startsWith('|');
const isSeparator = (line: string): boolean => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());

function rewriteRegion(region: string, progress: Progress): { text: string; filled: number } {
  const lines = region.split('\n');
  let column = -1;
  let filled = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!isTableRow(line)) {
      column = -1; // a table ended; the next table needs its own header
      continue;
    }
    if (column === -1) {
      // header row: find the target column, the next row must be the separator
      const idx = splitRow(line).findIndex((c) => c === COLUMN);
      if (idx > 0 && isSeparator(lines[i + 1] ?? '')) {
        column = idx;
        i++; // skip separator
      }
      continue;
    }
    const cells = splitRow(line);
    const id = (cells[0] ?? '').replace(/[`*]/g, '');
    if (!/^O[0-9]{2}$/.test(id)) continue;
    while (cells.length <= column) cells.push('');
    const value = formatResult(progress.objectives[id]);
    if (value !== EMPTY) {
      filled++;
      cells[column] = value;
    } else if (!cells[column]) {
      cells[column] = EMPTY;
    }
    lines[i] = joinRow(cells);
  }
  return { text: lines.join('\n'), filled };
}

function main(): void {
  const progressPath = resolve(process.argv[2] ?? 'progress.json');
  const coveragePath = resolve(process.argv[3] ?? 'COVERAGE.md');

  const progress = readProgress(progressPath);
  let doc: string;
  try {
    doc = readFileSync(coveragePath, 'utf8');
  } catch {
    fail(`cannot read ${coveragePath}`);
  }

  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start === -1 || end === -1 || end < start) fail(`${coveragePath} needs ${START} ... ${END} markers`);

  const regionStart = start + START.length;
  const { text, filled } = rewriteRegion(doc.slice(regionStart, end), progress);
  const next = doc.slice(0, regionStart) + text + doc.slice(end);

  if (next === doc) {
    console.log(`coverage: ${coveragePath} already up to date (${filled} objective(s) with data)`);
    return;
  }
  writeFileSync(coveragePath, next);
  console.log(`coverage: updated ${coveragePath} (${filled} objective(s) with data)`);
}

main();
