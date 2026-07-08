import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo } from "./utils";

const GT_BASE = "https://api.geckoterminal.com/api/v2";

// Networks to scan for new pools
const NETWORKS = ["solana", "bsc", "eth", "base", "arbitrum"];

interface GeckoPool {
  id?: string;
  attributes?: {
    name?: string;
    pool_created_at?: string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    network?: { data?: { id?: string } };
  };
}

function extractAddress(tokenId?: string): string | undefined {
  if (!tokenId) return undefined;
  // Format: "solana_<address>" or "eth_0x..."
  const idx = tokenId.indexOf("_");
  return idx >= 0 ? tokenId.slice(idx + 1) : tokenId;
}

export async function fetchGeckoTerminal(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    // Fetch new_pools for all networks in parallel
    const poolResponses = await Promise.allSettled(
      NETWORKS.map((net) =>
        axios.get<{ data: GeckoPool[] }>(`${GT_BASE}/networks/${net}/new_pools?page=1`, {
          timeout: 12000,
          headers: { Accept: "application/json" },
        })
      )
    );

    // Extract base token addresses
    const candidates: Array<{ ca: string; network: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < NETWORKS.length; i++) {
      const res = poolResponses[i];
      if (res.status !== "fulfilled") continue;
      const pools: GeckoPool[] = res.value.data?.data ?? [];
      const net = NETWORKS[i];

      for (const pool of pools) {
        const tokenId = pool.relationships?.base_token?.data?.id;
        const ca = extractAddress(tokenId);
        if (!ca || seen.has(ca.toLowerCase())) continue;
        seen.add(ca.toLowerCase());
        candidates.push({ ca, network: net });
      }
    }

    if (candidates.length === 0) {
      logger.info({ source: "GeckoTerminal", found: 0 }, "GeckoTerminal fetch complete");
      return [];
    }

    // Look up DexScreener for Telegram links and market data
    const pairInfo = await getPairInfo(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, network } of candidates) {
      const info = pairInfo.get(ca.toLowerCase());
      if (!info?.telegramLink) continue; // must have Telegram link from DexScreener

      results.push({
        ca,
        symbol: info.symbol ?? ca.slice(0, 6).toUpperCase(),
        name: info.name,
        chain: network,
        telegramLink: info.telegramLink,
        source: `GeckoTerminal (${network})`,
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

    logger.info(
      { source: "GeckoTerminal", networks: NETWORKS.length, scanned: candidates.length, found: results.length },
      "GeckoTerminal fetch complete"
    );
    return results;
  } catch (err) {
    logger.warn({ source: "GeckoTerminal", err: (err as Error).message?.slice(0, 80) }, "GeckoTerminal fetch failed");
    return [];
  }
}
