import type { Principal } from './http.ts';

export class ForbiddenError extends Error {}

/** Throws unless the principal may access the customer's data. Admins may access everything. */
export function authorize(principal: Principal, customerId: string): void {
  if (principal.role === 'admin') return;
  if (principal.customerId !== customerId) {
    throw new ForbiddenError(`User ${principal.userId} may not access customer ${customerId}`);
  }
}
