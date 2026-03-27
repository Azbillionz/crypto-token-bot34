import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const URL = "https://api.geckoterminal.com/api/v2/tokens/info_recently_updated";

interface GeckoToken {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    telegram_handle?: string;
    network_id?: string;
  };
  relationships?: {
    network?: { data?: { id?: string } };
  };
}

export async function fetchGeckoTerminal(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<{ data: GeckoToken[] }>(URL, {
      timeout: 10000,
      headers: { Accept: "application/json" },
    });

    const tokens: GeckoToken[] = res.data?.data ?? [];
    const results: TokenAlert[] = [];

    for (const token of tokens) {
      const attrs = token.attributes;
      const ca = attrs?.address;
      const symbol = attrs?.symbol ?? "UNKNOWN";
      const tgHandle = attrs?.telegram_handle;
      if (!ca || !tgHandle) continue;

      const network = token.relationships?.network?.data?.id ?? token.id?.split("_")[0] ?? "unknown";
      const tgLink = tgHandle.startsWith("http") ? tgHandle : `https://t.me/${tgHandle.replace(/^@/, "")}`;

      results.push({ ca, symbol, telegramLink: tgLink, source: `GeckoTerminal (${network})` });
    }

    logger.info({ source: "GeckoTerminal", found: results.length }, "GeckoTerminal fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "GeckoTerminal", status }, "GeckoTerminal fetch failed");
    return [];
  }
}
