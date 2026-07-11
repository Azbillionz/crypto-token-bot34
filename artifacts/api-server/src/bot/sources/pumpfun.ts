import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { TWENTY_FOUR_HOURS_MS } from "./utils";

// Pump.fun tokens only — hard cap at $3k
const PUMPFUN_MAX_CAP = 3_000;
const SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";

interface DexPair {
  baseToken?: { address?: string; symbol?: string; name?: string };
  chainId?: string;
  dexId?: string;
  pairCreatedAt?: number;
  marketCap?: number;
  fdv?: number;
  priceUsd?: string;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  info?: {
    imageUrl?: string;
    websites?: Array<{ url?: string }>;
    socials?: Array<{ type?: string; url?: string }>;
  };
}

export async function fetchPumpFun(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<{ pairs: DexPair[] }>(SEARCH_URL, {
      params: { q: "pump.fun" },
      timeout: 10000,
    });

    const pairs: DexPair[] = res.data?.pairs ?? [];
    const seen = new Set<string>();
    const results: TokenAlert[] = [];

    for (const pair of pairs) {
      if (pair.dexId !== "pumpfun") continue;

      const ca = pair.baseToken?.address;
      if (!ca || seen.has(ca.toLowerCase())) continue;
      seen.add(ca.toLowerCase());

      // Must be created within 24 hours
      if (pair.pairCreatedAt && Date.now() - pair.pairCreatedAt > TWENTY_FOUR_HOURS_MS) continue;

      // Must be under $3k market cap — skip if cap is unknown (can't verify)
      const cap = pair.marketCap ?? pair.fdv;
      if (cap === undefined || cap > PUMPFUN_MAX_CAP) continue;

      // Must have a Telegram link
      const tgSocial = pair.info?.socials?.find(
        (s) => s.type?.toLowerCase() === "telegram" || s.url?.includes("t.me"),
      );
      if (!tgSocial?.url) continue;

      const twitterSocial = pair.info?.socials?.find(
        (s) => s.type?.toLowerCase() === "twitter" || s.url?.includes("twitter.com") || s.url?.includes("x.com"),
      );
      const websiteUrl = pair.info?.websites?.[0]?.url;
      const imageUrl = pair.info?.imageUrl?.startsWith("http") ? pair.info.imageUrl : undefined;

      results.push({
        ca,
        symbol: pair.baseToken?.symbol ?? ca.slice(0, 6).toUpperCase(),
        name: pair.baseToken?.name,
        chain: "solana",
        telegramLink: tgSocial.url,
        source: "Pump.fun",
        imageUrl,
        websiteUrl,
        twitterUrl: twitterSocial?.url,
        priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
        fdv: pair.fdv,
        volume24h: pair.volume?.h24,
        liquidity: pair.liquidity?.usd,
        buys24h: pair.txns?.h24?.buys,
        sells24h: pair.txns?.h24?.sells,
      });
    }

    logger.info({ source: "PumpFun", scanned: pairs.length, found: results.length }, "PumpFun fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "PumpFun", status }, "PumpFun fetch failed");
    return [];
  }
}
