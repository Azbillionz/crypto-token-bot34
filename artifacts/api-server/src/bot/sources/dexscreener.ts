import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getCreationTimes, isRecent } from "./utils";

const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

interface DexProfile {
  tokenAddress?: string;
  chainId?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

export async function fetchDexScreener(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexProfile[]>(PROFILES_URL, { timeout: 10000 });
    const profiles: DexProfile[] = Array.isArray(res.data) ? res.data : [];

    const candidates: Array<{ ca: string; chainId: string; tgUrl: string; imageUrl?: string }> = [];
    for (const profile of profiles) {
      const ca = profile.tokenAddress;
      const chainId = profile.chainId ?? "unknown";
      if (!ca) continue;
      const links = profile.links ?? [];
      const tgLink = links.find(
        (l) =>
          l.url &&
          (l.type === "telegram" ||
            (l.label ?? "").toLowerCase().includes("telegram") ||
            l.url.includes("t.me") ||
            l.url.includes("telegram")),
      );
      if (!tgLink?.url) continue;

      const rawIcon = profile.icon;
      const imageUrl =
        rawIcon && rawIcon.startsWith("http")
          ? rawIcon
          : profile.openGraph && profile.openGraph.startsWith("http")
          ? profile.openGraph
          : undefined;

      candidates.push({ ca, chainId, tgUrl: tgLink.url, imageUrl });
    }

    const creationTimes = await getCreationTimes(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, chainId, tgUrl, imageUrl } of candidates) {
      const createdAt = creationTimes.get(ca.toLowerCase());
      if (createdAt && !isRecent(createdAt)) continue;
      results.push({
        ca,
        symbol: ca.slice(0, 6),
        chain: chainId,
        telegramLink: tgUrl,
        source: `DexScreener (${chainId})`,
        imageUrl,
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
