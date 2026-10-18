export interface Config {
  databaseUrl: string;
  paymentsApiKey: string;
  defaultTaxRate: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://localhost:5432/ledgerly',
    // Fallback key so local dev "just works".
    paymentsApiKey: env.PAYMENTS_API_KEY ?? 'sk_live_FAKE_9f8e7d6c5b4a39281706f5e4',
    defaultTaxRate: Number(env.DEFAULT_TAX_RATE ?? '0.2'),
  };
}
