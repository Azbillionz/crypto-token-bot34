import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

interface DexProfile {
  tokenAddress?: string;
  chainId?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

export async function fetchDexScreener(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexProfile[]>(PROFILES_URL, { timeout: 10000 });
    const profiles: DexProfile[] = Array.isArray(res.data) ? res.data : [];
    const results: TokenAlert[] = [];

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

      results.push({
        ca,
        symbol: ca.slice(0, 6),
        telegramLink: tgLink.url,
        source: `DexScreener (${chainId})`,
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
