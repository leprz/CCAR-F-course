import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type LessonTarget = 'starter' | 'solution';

/** `SOLUTION=1` points the tests at `solution/`; otherwise they run against `starter/`. */
export function lessonTarget(): LessonTarget {
  return process.env.SOLUTION === '1' ? 'solution' : 'starter';
}

/**
 * Import a lesson entry file from the active target folder next to the test file.
 *
 * Usage in a test: `const lesson = await loadLesson<typeof import('./solution/index.ts')>(import.meta.url);`
 * Typing against the solution makes `tsc` flag a starter whose exports drift from it.
 */
export async function loadLesson<T>(testFileUrl: string, entry = 'index.ts'): Promise<T> {
  const dir = path.dirname(fileURLToPath(testFileUrl));
  return (await import(pathToFileURL(path.join(dir, lessonTarget(), entry)).href)) as T;
}
