import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const TOP100_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

interface DexToken {
  tokenAddress?: string;
  chainId?: string;
  icon?: string;
  description?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

export async function fetchTop100Token(): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<DexToken[]>(TOP100_URL, {
      timeout: 10000,
      params: { chainId: "bsc" },
    });

    const tokens: DexToken[] = Array.isArray(res.data) ? res.data : [];
    const results: TokenAlert[] = [];

    for (const token of tokens) {
      const ca = token.tokenAddress;
      if (!ca) continue;

      const tgLink = (token.links ?? []).find(
        (l) =>
          l.url &&
          (l.type === "telegram" ||
            (l.label ?? "").toLowerCase().includes("telegram") ||
            l.url.includes("t.me") ||
            l.url.includes("telegram")),
      );
      if (!tgLink?.url) continue;

      results.push({ ca, symbol: ca.slice(0, 8), telegramLink: tgLink.url, source: "BSC/DexScreener" });
    }

    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "top100token", status }, "BSC/DexScreener fetch failed");
    return [];
  }
}
