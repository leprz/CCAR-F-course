/**
 * Lesson quality gate: structural tests must FAIL against starter/ and PASS against solution/.
 * Usage: npx tsx scripts/gate.ts [lesson-dir-prefix ...]   e.g. `01 02`, or nothing for all lessons.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const prefixes = process.argv.slice(2);
const lessons = readdirSync('lessons', { withFileTypes: true })
  .filter((d) => d.isDirectory() && (prefixes.length === 0 || prefixes.some((p) => d.name.startsWith(p))))
  .map((d) => d.name)
  .sort();

if (lessons.length === 0) {
  console.error('No matching lessons.');
  process.exit(1);
}

function run(lesson: string, solution: boolean): boolean {
  const res = spawnSync('npx', ['vitest', 'run', `lessons/${lesson}`], {
    env: { ...process.env, SOLUTION: solution ? '1' : '' },
    encoding: 'utf8',
  });
  return res.status === 0;
}

let ok = true;
for (const lesson of lessons) {
  const starterPasses = run(lesson, false);
  const solutionPasses = run(lesson, true);
  const good = !starterPasses && solutionPasses;
  ok &&= good;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${lesson}  starter:${starterPasses ? 'passes (should fail)' : 'fails'}  solution:${solutionPasses ? 'passes' : 'FAILS'}`,
  );
}
process.exit(ok ? 0 : 1);
