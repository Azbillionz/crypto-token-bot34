import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const DEXSCREENER_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

interface DexPair {
  tokenAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

export async function fetchDexScreener(): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexPair[]>(DEXSCREENER_URL, { timeout: 10000 });
    const pairs: DexPair[] = Array.isArray(res.data) ? res.data : [];
    const results: TokenAlert[] = [];

    for (const pair of pairs) {
      const ca = pair.tokenAddress ?? pair.baseToken?.address;
      const symbol = pair.baseToken?.symbol ?? "UNKNOWN";
      if (!ca) continue;

      const links: Array<{ type?: string; label?: string; url?: string }> = pair.links ?? [];
      const tgLink = links.find(
        (l) =>
          l.url &&
          (l.type === "telegram" ||
            (l.label ?? "").toLowerCase().includes("telegram") ||
            l.url.includes("t.me") ||
            l.url.includes("telegram")),
      );
      if (!tgLink?.url) continue;

      results.push({ ca, symbol, telegramLink: tgLink.url, source: "DexScreener" });
    }

    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "DexScreener", status }, "DexScreener fetch failed");
    return [];
  }
}
