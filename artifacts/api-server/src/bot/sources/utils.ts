import axios from "axios";

export const TEN_MIN_MS = 10 * 60 * 1000;

export interface PairInfo {
  createdAt: number;
  symbol?: string;
  name?: string;
}

/**
 * Batch-fetches pair data for a list of token addresses via DexScreener.
 * Returns a Map of lowercase(CA) → PairInfo (earliest creation time + symbol/name).
 */
export async function getPairInfo(addresses: string[]): Promise<Map<string, PairInfo>> {
  const result = new Map<string, PairInfo>();
  if (addresses.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    try {
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { timeout: 10000 },
      );
      const pairs: Array<{
        baseToken?: { address?: string; name?: string; symbol?: string };
        pairCreatedAt?: number;
      }> = res.data?.pairs ?? [];

      for (const pair of pairs) {
        const ca = pair.baseToken?.address?.toLowerCase();
        const createdAt = pair.pairCreatedAt;
        if (!ca || !createdAt) continue;
        const existing = result.get(ca);
        if (!existing || existing.createdAt > createdAt) {
          result.set(ca, {
            createdAt,
            symbol: pair.baseToken?.symbol,
            name: pair.baseToken?.name,
          });
        }
      }
    } catch (_) {}
  }

  return result;
}

/**
 * Convenience wrapper — returns only createdAt times (backward-compatible).
 */
export async function getCreationTimes(addresses: string[]): Promise<Map<string, number>> {
  const info = await getPairInfo(addresses);
  const result = new Map<string, number>();
  for (const [ca, { createdAt }] of info) {
    result.set(ca, createdAt);
  }
  return result;
}

/** Returns true if createdAtMs is within the last 10 minutes */
export function isRecent(createdAtMs: number): boolean {
  return Date.now() - createdAtMs <= TEN_MIN_MS;
}
