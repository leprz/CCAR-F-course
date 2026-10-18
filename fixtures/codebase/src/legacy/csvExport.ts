// Frozen legacy exporter, scheduled for deletion (see CONVENTIONS.md: relaxed rules apply here).
export function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] as any);
  const lines = rows.map((row) => headers.map((h) => JSON.stringify((row as any)[h] ?? '')).join(','));
  return [headers.join(','), ...lines].join('\n');
}
