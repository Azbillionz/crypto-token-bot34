import axios from "axios";

export const TEN_MIN_MS = 10 * 60 * 1000;
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface PairInfo {
  createdAt: number;
  symbol?: string;
  name?: string;
  priceUsd?: number;
  fdv?: number;
  volume24h?: number;
  liquidity?: number;
  buys24h?: number;
  sells24h?: number;
  telegramLink?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  imageUrl?: string;
}

/**
 * Batch-fetches pair data for a list of token addresses via DexScreener.
 * Returns a Map of lowercase(CA) → PairInfo (earliest creation time + full market data + socials).
 */
export async function getPairInfo(addresses: string[]): Promise<Map<string, PairInfo>> {
  const result = new Map<string, PairInfo>();
  if (addresses.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  const chunkResults = await Promise.allSettled(
    chunks.map((chunk) =>
      axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { timeout: 10000 },
      )
    )
  );

  for (const settled of chunkResults) {
    if (settled.status === "rejected") continue;
    try {
      const res = settled.value;
      const pairs: Array<{
        baseToken?: { address?: string; name?: string; symbol?: string };
        pairCreatedAt?: number;
        priceUsd?: string;
        fdv?: number;
        volume?: { h24?: number };
        liquidity?: { usd?: number };
        txns?: { h24?: { buys?: number; sells?: number } };
        info?: {
          imageUrl?: string;
          websites?: Array<{ label?: string; url?: string }>;
          socials?: Array<{ type?: string; url?: string }>;
        };
      }> = res.data?.pairs ?? [];

      for (const pair of pairs) {
        const ca = pair.baseToken?.address?.toLowerCase();
        const createdAt = pair.pairCreatedAt;
        if (!ca || !createdAt) continue;

        const telegramSocial = pair.info?.socials?.find(
          (s) => s.type?.toLowerCase() === "telegram",
        );
        const twitterSocial = pair.info?.socials?.find(
          (s) => s.type?.toLowerCase() === "twitter",
        );
        const websiteUrl = pair.info?.websites?.[0]?.url;
        const telegramLink = telegramSocial?.url;
        const twitterUrl = twitterSocial?.url;
        const imageUrl = pair.info?.imageUrl?.startsWith("http")
          ? pair.info.imageUrl
          : undefined;

        const existing = result.get(ca);
        if (!existing || existing.createdAt > createdAt) {
          result.set(ca, {
            createdAt,
            symbol: pair.baseToken?.symbol,
            name: pair.baseToken?.name,
            priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
            fdv: pair.fdv ?? undefined,
            volume24h: pair.volume?.h24 ?? undefined,
            liquidity: pair.liquidity?.usd ?? undefined,
            buys24h: pair.txns?.h24?.buys ?? undefined,
            sells24h: pair.txns?.h24?.sells ?? undefined,
            telegramLink,
            websiteUrl,
            twitterUrl,
            imageUrl,
          });
        } else if (existing && !existing.telegramLink && telegramLink) {
          existing.telegramLink = telegramLink;
          existing.twitterUrl = twitterUrl ?? existing.twitterUrl;
          existing.websiteUrl = websiteUrl ?? existing.websiteUrl;
          existing.imageUrl = imageUrl ?? existing.imageUrl;
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
