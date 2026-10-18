import { describe } from 'vitest';

/** `describe` when an API key is configured, `describe.skip` otherwise. */
export const describeLive = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;
