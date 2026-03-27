import axios from "axios";

export const TEN_MIN_MS = 10 * 60 * 1000;

/**
 * Batch-fetches the earliest pair creation time for a list of token addresses
 * using DexScreener. Returns a Map of lowercase(CA) → pairCreatedAt (ms).
 */
export async function getCreationTimes(addresses: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (addresses.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    try {
      const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`, {
        timeout: 10000,
      });
      const pairs: Array<{ baseToken?: { address?: string }; pairCreatedAt?: number }> =
        res.data?.pairs ?? [];
      for (const pair of pairs) {
        const ca = pair.baseToken?.address?.toLowerCase();
        const createdAt = pair.pairCreatedAt;
        if (!ca || !createdAt) continue;
        if (!result.has(ca) || result.get(ca)! > createdAt) {
          result.set(ca, createdAt);
        }
      }
    } catch (_) {}
  }

  return result;
}

/** Returns true if createdAtMs is within the last 10 minutes */
export function isRecent(createdAtMs: number): boolean {
  return Date.now() - createdAtMs <= TEN_MIN_MS;
}
