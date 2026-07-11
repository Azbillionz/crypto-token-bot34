import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo, isWithin24h, isUnderMaxMarketCap, fetchWithRetry } from "./utils";

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const RECENT_URL = `${GT_BASE}/tokens/info_recently_updated`;
const PAGES = [1, 2, 3];
const NEW_POOL_NETWORKS = ["solana", "bsc", "eth", "base", "arbitrum", "ton"];

interface GeckoToken {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    telegram_handle?: string;
    websites?: string[];
    twitter_handle?: string;
    image_url?: string;
  };
  relationships?: {
    network?: { data?: { id?: string } };
  };
}

interface GeckoPool {
  attributes?: {
    pool_created_at?: string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
  };
}

function extractAddress(tokenId?: string): string | undefined {
  if (!tokenId) return undefined;
  const idx = tokenId.indexOf("_");
  return idx >= 0 ? tokenId.slice(idx + 1) : tokenId;
}

async function fetchRecentlyUpdated(): Promise<
  Array<{ ca: string; symbol: string; name?: string; tgLink: string; network: string; imageUrl?: string; websiteUrl?: string; twitterUrl?: string }>
> {
  const pageResponses = await Promise.allSettled(
    PAGES.map((page) =>
      fetchWithRetry<{ data: GeckoToken[] }>(`${RECENT_URL}?page=${page}`, {
        timeout: 12000,
        headers: { Accept: "application/json" },
      })
    )
  );

  const failedPages = pageResponses.filter((r) => r.status === "rejected").length;
  if (failedPages > 0) {
    logger.warn({ source: "GeckoTerminal", failedPages }, "Some recently_updated pages failed after retry");
  }

  const tokens: GeckoToken[] = [];
  for (const r of pageResponses) {
    if (r.status === "fulfilled") tokens.push(...(r.value.data?.data ?? []));
  }

  const seen = new Set<string>();
  const out: Array<{ ca: string; symbol: string; name?: string; tgLink: string; network: string; imageUrl?: string; websiteUrl?: string; twitterUrl?: string }> = [];

  for (const token of tokens) {
    const attrs = token.attributes;
    const ca = attrs?.address;
    const tgHandle = attrs?.telegram_handle;
    if (!ca || !tgHandle) continue;
    if (seen.has(ca.toLowerCase())) continue;
    seen.add(ca.toLowerCase());

    const network = token.relationships?.network?.data?.id ?? token.id?.split("_")[0] ?? "unknown";
    const tgLink = tgHandle.startsWith("http") ? tgHandle : `https://t.me/${tgHandle.replace(/^@/, "")}`;
    const imageUrl = attrs?.image_url && attrs.image_url.startsWith("http") ? attrs.image_url : undefined;
    const websiteUrl = attrs?.websites?.[0];
    const twitterHandle = attrs?.twitter_handle;
    const twitterUrl = twitterHandle
      ? twitterHandle.startsWith("http") ? twitterHandle : `https://twitter.com/${twitterHandle.replace(/^@/, "")}`
      : undefined;

    out.push({ ca, symbol: attrs?.symbol ?? "UNKNOWN", name: attrs?.name, tgLink, network, imageUrl, websiteUrl, twitterUrl });
  }

  return out;
}

async function fetchNewPoolCandidates(): Promise<Array<{ ca: string; network: string }>> {
  const poolResponses = await Promise.allSettled(
    NEW_POOL_NETWORKS.map((net) =>
      fetchWithRetry<{ data: GeckoPool[] }>(`${GT_BASE}/networks/${net}/new_pools?page=1`, {
        timeout: 12000,
        headers: { Accept: "application/json" },
      })
    )
  );

  const failedNets = poolResponses.filter((r) => r.status === "rejected").length;
  if (failedNets > 0) {
    logger.warn({ source: "GeckoTerminal", failedNets }, "Some new_pools networks failed after retry");
  }

  const candidates: Array<{ ca: string; network: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < NEW_POOL_NETWORKS.length; i++) {
    const res = poolResponses[i];
    if (res.status !== "fulfilled") continue;
    const pools: GeckoPool[] = res.value.data?.data ?? [];
    for (const pool of pools) {
      const createdAt = pool.attributes?.pool_created_at
        ? new Date(pool.attributes.pool_created_at).getTime()
        : undefined;
      if (createdAt && !isWithin24h(createdAt)) continue;

      const ca = extractAddress(pool.relationships?.base_token?.data?.id);
      if (!ca || seen.has(ca.toLowerCase())) continue;
      seen.add(ca.toLowerCase());
      candidates.push({ ca, network: NEW_POOL_NETWORKS[i] });
    }
  }

  return candidates;
}

export async function fetchGeckoTerminal(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const [recentTokens, newPoolCandidates] = await Promise.all([
      fetchRecentlyUpdated(),
      fetchNewPoolCandidates(),
    ]);

    const results: TokenAlert[] = [];
    const addedCas = new Set<string>();

    // 1. Tokens from recently_updated already have a Telegram handle directly from GeckoTerminal
    if (recentTokens.length > 0) {
      const pairInfo = await getPairInfo(recentTokens.map((t) => t.ca));
      for (const t of recentTokens) {
        const info = pairInfo.get(t.ca.toLowerCase());
        if (info?.createdAt && !isWithin24h(info.createdAt)) continue; // only genuinely new tokens
        if (info && !isUnderMaxMarketCap(info)) continue; // max $10k market cap (allow through if no data yet)
        addedCas.add(t.ca.toLowerCase());
        results.push({
          ca: t.ca,
          symbol: info?.symbol ?? t.symbol,
          name: info?.name ?? t.name,
          chain: t.network,
          telegramLink: t.tgLink,
          source: `GeckoTerminal (${t.network})`,
          imageUrl: info?.imageUrl ?? t.imageUrl,
          websiteUrl: info?.websiteUrl ?? t.websiteUrl,
          twitterUrl: info?.twitterUrl ?? t.twitterUrl,
          priceUsd: info?.priceUsd,
          fdv: info?.fdv,
          volume24h: info?.volume24h,
          liquidity: info?.liquidity,
          buys24h: info?.buys24h,
          sells24h: info?.sells24h,
        });
      }
    }

    // 2. New pool candidates — check DexScreener for a Telegram link (catches brand-new launches once indexed)
    const freshCandidates = newPoolCandidates.filter((c) => !addedCas.has(c.ca.toLowerCase()));
    if (freshCandidates.length > 0) {
      const pairInfo = await getPairInfo(freshCandidates.map((c) => c.ca));
      for (const c of freshCandidates) {
        const info = pairInfo.get(c.ca.toLowerCase());
        if (!info?.telegramLink) continue;
        if (info.createdAt && !isWithin24h(info.createdAt)) continue; // only genuinely new tokens
        if (!isUnderMaxMarketCap(info)) continue; // max $10k market cap
        results.push({
          ca: c.ca,
          symbol: info.symbol ?? c.ca.slice(0, 6).toUpperCase(),
          name: info.name,
          chain: c.network,
          telegramLink: info.telegramLink,
          source: `GeckoTerminal (${c.network})`,
          imageUrl: info.imageUrl,
          websiteUrl: info.websiteUrl,
          twitterUrl: info.twitterUrl,
          priceUsd: info.priceUsd,
          fdv: info.fdv,
          volume24h: info.volume24h,
          liquidity: info.liquidity,
          buys24h: info.buys24h,
          sells24h: info.sells24h,
        });
      }
    }

    logger.info(
      { source: "GeckoTerminal", recentTokens: recentTokens.length, newPools: newPoolCandidates.length, found: results.length },
      "GeckoTerminal fetch complete"
    );
    return results;
  } catch (err) {
    logger.warn({ source: "GeckoTerminal", err: (err as Error).message?.slice(0, 80) }, "GeckoTerminal fetch failed");
    return [];
  }
}
