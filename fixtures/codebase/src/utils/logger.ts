export function requestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}

export function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ level, message, ...fields, at: new Date().toISOString() }));
  } catch {
    // best-effort
  }
}
