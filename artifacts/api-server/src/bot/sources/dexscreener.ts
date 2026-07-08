import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo } from "./utils";

const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

interface DexProfile {
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

export async function fetchDexScreener(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexProfile[]>(PROFILES_URL, { timeout: 10000 });
    const profiles: DexProfile[] = Array.isArray(res.data) ? res.data : [];

    const candidates: Array<{
      ca: string;
      chainId: string;
      tgUrl: string;
      imageUrl?: string;
      websiteUrl?: string;
      twitterUrl?: string;
    }> = [];

    for (const profile of profiles) {
      const ca = profile.tokenAddress;
      const chainId = profile.chainId ?? "unknown";
      if (!ca) continue;
      const links = profile.links ?? [];

      const tgUrl = extractLink(links, { type: "telegram", urlIncludes: ["t.me", "telegram"] });
      if (!tgUrl) continue;

      const websiteUrl = extractLink(links, { type: "website", urlIncludes: [] });
      const twitterUrl = extractLink(links, {
        type: "twitter",
        urlIncludes: ["twitter.com", "x.com"],
      });

      const rawIcon = profile.icon;
      const imageUrl =
        rawIcon && rawIcon.startsWith("http")
          ? rawIcon
          : profile.openGraph && profile.openGraph.startsWith("http")
          ? profile.openGraph
          : undefined;

      candidates.push({ ca, chainId, tgUrl, imageUrl, websiteUrl, twitterUrl });
    }

    const pairInfo = await getPairInfo(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, chainId, tgUrl, imageUrl, websiteUrl, twitterUrl } of candidates) {
      const info = pairInfo.get(ca.toLowerCase());
      results.push({
        ca,
        symbol: info?.symbol ?? ca.slice(0, 6).toUpperCase(),
        name: info?.name,
        chain: chainId,
        telegramLink: tgUrl,
        source: `DexScreener (${chainId})`,
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

    logger.info({ source: "DexScreener", found: results.length }, "DexScreener fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "DexScreener", status }, "DexScreener fetch failed");
    return [];
  }
}
