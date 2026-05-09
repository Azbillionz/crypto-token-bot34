import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo, isRecent } from "./utils";

const BOOSTED_URL = "https://api.dexscreener.com/token-boosts/latest/v1";

interface DexBoosted {
  tokenAddress?: string;
  chainId?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

export async function fetchTop100Token(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexBoosted[]>(BOOSTED_URL, { timeout: 10000 });
    const tokens: DexBoosted[] = Array.isArray(res.data) ? res.data : [];

    const candidates: Array<{ ca: string; chainId: string; tgUrl: string; imageUrl?: string }> = [];
    for (const token of tokens) {
      const ca = token.tokenAddress;
      const chainId = token.chainId ?? "unknown";
      if (!ca) continue;
      const links = token.links ?? [];
      const tgLink = links.find(
        (l) =>
          l.url &&
          (l.type === "telegram" ||
            (l.label ?? "").toLowerCase().includes("telegram") ||
            l.url.includes("t.me") ||
            l.url.includes("telegram")),
      );
      if (!tgLink?.url) continue;

      const rawIcon = token.icon;
      const imageUrl =
        rawIcon && rawIcon.startsWith("http")
          ? rawIcon
          : token.openGraph && token.openGraph.startsWith("http")
          ? token.openGraph
          : undefined;

      candidates.push({ ca, chainId, tgUrl: tgLink.url, imageUrl });
    }

    const pairInfo = await getPairInfo(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, chainId, tgUrl, imageUrl } of candidates) {
      const info = pairInfo.get(ca.toLowerCase());
      if (info && !isRecent(info.createdAt)) continue;
      results.push({
        ca,
        symbol: info?.symbol ?? ca.slice(0, 6).toUpperCase(),
        name: info?.name,
        chain: chainId,
        telegramLink: tgUrl,
        source: `Boosted (${chainId})`,
        imageUrl,
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
