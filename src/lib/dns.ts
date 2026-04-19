import { Resolver } from 'node:dns/promises';

const TIMEOUT_MS = 5_000;

function createResolver(): Resolver {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  return resolver;
}

export interface DnsError extends Error {
  code?: string;
}

export async function resolveTxt(name: string): Promise<string[][]> {
  const resolver = createResolver();
  return resolver.resolveTxt(name);
}

export async function resolveMx(
  name: string,
): Promise<{ exchange: string; priority: number }[]> {
  const resolver = createResolver();
  return resolver.resolveMx(name);
}

export function joinTxtChunks(chunks: string[]): string {
  return chunks.join('');
}

export function flattenTxt(records: string[][]): string[] {
  return records.map(joinTxtChunks);
}
