export interface Principal {
  userId: string;
  customerId: string;
  role: 'customer' | 'admin';
}

export interface Request {
  principal: Principal;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
}

export interface Response {
  status: number;
  body: unknown;
}

export type Handler = (req: Request) => Promise<Response>;

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  handler: Handler;
}

export function ok(body: unknown, status = 200): Response {
  return { status, body };
}

export function httpError(status: number, code: string, message: string): Response {
  return { status, body: { error: { code, message } } };
}
