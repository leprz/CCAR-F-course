/**
 * Machine-readable version of fixtures/codebase/ISSUES.md, used to score a review. Never put this in a prompt.
 */
export type Category = 'security' | 'business-logic' | 'api-design';

export interface Finding {
  category: Category;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number | null;
  summary: string;
  rule: string;
}

interface Seeded {
  id: string;
  category: Category;
  file: string;
  matches: RegExp;
}

export const SEEDED: Seeded[] = [
  { id: 'SEC-1', category: 'security', file: 'src/config.ts', matches: /key|secret|credential/i },
  { id: 'SEC-2', category: 'security', file: 'src/repositories/orderRepository.ts', matches: /sql|inject|concaten/i },
  { id: 'SEC-3', category: 'security', file: 'src/routes/orders.ts', matches: /authori|idor|access|any customer/i },
  { id: 'BIZ-1', category: 'business-logic', file: 'src/services/billingService.ts', matches: /round/i },
  { id: 'BIZ-2', category: 'business-logic', file: 'src/services/billingService.ts', matches: /tax.*discount|discount.*tax|before.*discount/i },
  { id: 'BIZ-3', category: 'business-logic', file: 'src/repositories/orderRepository.ts', matches: /pag|offset|off-by-one/i },
  { id: 'API-1', category: 'api-design', file: 'src/routes/orders.ts', matches: /shape|httpError|format|\{ ?message/i },
  { id: 'API-2', category: 'api-design', file: 'src/routes/orders.ts', matches: /verb|\/delete|DELETE|REST|resource/i },
  { id: 'API-3', category: 'api-design', file: 'src/routes/orders.ts', matches: /404|not.?found|mask/i },
];

/** Accepted patterns: a finding that matches one of these is a false positive. */
export const ACCEPTED: { id: string; file: RegExp; matches: RegExp }[] = [
  { id: 'OK-1', file: /src\/legacy\//, matches: /any/i },
  { id: 'OK-2', file: /src\/utils\/logger\.ts/, matches: /catch|swallow/i },
  { id: 'OK-3', file: /src\/utils\/logger\.ts/, matches: /random/i },
  { id: 'OK-4', file: /src\/utils\/logger\.ts/, matches: /console/i },
  { id: 'OK-5', file: /src\/auth\.ts/, matches: /admin/i },
  { id: 'OK-6', file: /src\/services\/billingService\.ts/, matches: /instal|remainder|last part/i },
];

export function scoreReview(findings: Finding[]) {
  const found = SEEDED.filter((s) =>
    findings.some((f) => f.category === s.category && f.file === s.file && s.matches.test(f.summary)),
  ).map((s) => s.id);
  const falsePositives = ACCEPTED.filter((a) => findings.some((f) => a.file.test(f.file) && a.matches.test(f.summary))).map(
    (a) => a.id,
  );
  return { found, missed: SEEDED.map((s) => s.id).filter((id) => !found.includes(id)), falsePositives, recall: found.length / SEEDED.length };
}
