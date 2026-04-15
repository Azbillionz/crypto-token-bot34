import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getCreationTimes, isRecent } from "./utils";

const GT_URL = "https://api.geckoterminal.com/api/v2/tokens/info_recently_updated";

interface GeckoToken {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    telegram_handle?: string;
    image_url?: string;
  };
  relationships?: {
    network?: { data?: { id?: string } };
  };
}

export async function fetchGeckoTerminal(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<{ data: GeckoToken[] }>(GT_URL, {
      timeout: 10000,
      headers: { Accept: "application/json" },
    });

    const tokens: GeckoToken[] = res.data?.data ?? [];

    const candidates: Array<{
      ca: string;
      symbol: string;
      name?: string;
      tgLink: string;
      network: string;
      imageUrl?: string;
    }> = [];

    for (const token of tokens) {
      const attrs = token.attributes;
      const ca = attrs?.address;
      const symbol = attrs?.symbol ?? "UNKNOWN";
      const tgHandle = attrs?.telegram_handle;
      if (!ca || !tgHandle) continue;

      const network =
        token.relationships?.network?.data?.id ?? token.id?.split("_")[0] ?? "unknown";
      const tgLink = tgHandle.startsWith("http")
        ? tgHandle
        : `https://t.me/${tgHandle.replace(/^@/, "")}`;
      const imageUrl =
        attrs?.image_url && attrs.image_url.startsWith("http") ? attrs.image_url : undefined;

      candidates.push({ ca, symbol, name: attrs?.name, tgLink, network, imageUrl });
    }

    const creationTimes = await getCreationTimes(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, symbol, name, tgLink, network, imageUrl } of candidates) {
      const createdAt = creationTimes.get(ca.toLowerCase());
      if (createdAt && !isRecent(createdAt)) continue;
      results.push({
        ca,
        symbol,
        name,
        chain: network,
        telegramLink: tgLink,
        source: `GeckoTerminal (${network})`,
        imageUrl,
      });
    }

    logger.info({ source: "GeckoTerminal", found: results.length }, "GeckoTerminal fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "GeckoTerminal", status }, "GeckoTerminal fetch failed");
    return [];
  }
}
