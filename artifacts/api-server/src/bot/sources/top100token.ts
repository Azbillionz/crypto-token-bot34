import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo, isWithin24h, isUnderMaxMarketCap } from "./utils";

const BOOSTED_URL = "https://api.dexscreener.com/token-boosts/latest/v1";

interface DexBoosted {
  tokenAddress?: string;
  chainId?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

function extractLink(
  links: Array<{ type?: string; label?: string; url?: string }>,
  matchers: { type?: string; urlIncludes?: string[] },
): string | undefined {
  const match = links.find((l) => {
    if (!l.url) return false;
    if (matchers.type && l.type === matchers.type) return true;
    if (matchers.urlIncludes?.some((s) => l.url!.includes(s))) return true;
    return false;
  });
  return match?.url;
}

export async function fetchTop100Token(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexBoosted[]>(BOOSTED_URL, { timeout: 10000 });
    const tokens: DexBoosted[] = Array.isArray(res.data) ? res.data : [];

    const candidates: Array<{
      ca: string;
      chainId: string;
      tgUrl: string;
      imageUrl?: string;
      websiteUrl?: string;
      twitterUrl?: string;
    }> = [];

    for (const token of tokens) {
      const ca = token.tokenAddress;
      const chainId = token.chainId ?? "unknown";
      if (!ca) continue;
      const links = token.links ?? [];

      const tgUrl = extractLink(links, { type: "telegram", urlIncludes: ["t.me", "telegram"] });
      if (!tgUrl) continue;

      const websiteUrl = extractLink(links, { type: "website", urlIncludes: [] });
      const twitterUrl = extractLink(links, {
        type: "twitter",
        urlIncludes: ["twitter.com", "x.com"],
      });

      const rawIcon = token.icon;
      const imageUrl =
        rawIcon && rawIcon.startsWith("http")
          ? rawIcon
          : token.openGraph && token.openGraph.startsWith("http")
          ? token.openGraph
          : undefined;

      candidates.push({ ca, chainId, tgUrl, imageUrl, websiteUrl, twitterUrl });
    }

    const pairInfo = await getPairInfo(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, chainId, tgUrl, imageUrl, websiteUrl, twitterUrl } of candidates) {
      const info = pairInfo.get(ca.toLowerCase());
      if (info?.createdAt && !isWithin24h(info.createdAt)) continue; // only genuinely new tokens
      if (info && !isUnderMaxMarketCap(info)) continue; // max $10k market cap (allow through if no data yet)
      results.push({
        ca,
        symbol: info?.symbol ?? ca.slice(0, 6).toUpperCase(),
        name: info?.name,
        chain: chainId,
        telegramLink: tgUrl,
        source: `Boosted (${chainId})`,
        imageUrl,
        websiteUrl,
        twitterUrl,
        priceUsd: info?.priceUsd,
        fdv: info?.fdv,
        volume24h: info?.volume24h,
        liquidity: info?.liquidity,
        buys24h: info?.buys24h,
        sells24h: info?.sells24h,
      });
    }

    logger.info({ source: "DexScreener-Boosted", found: results.length }, "Boosted tokens fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "DexScreener-Boosted", status }, "Boosted tokens fetch failed");
    return [];
  }
}
