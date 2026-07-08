import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { TWENTY_FOUR_HOURS_MS } from "./utils";

const SUNPUMP_URL = "https://api.sunpump.meme/pump-api/token/list";

interface SunPumpToken {
  contractAddress?: string;
  name?: string;
  symbol?: string;
  telegramUrl?: string;
  tokenCreatedInstant?: string | number;
  logoUrl?: string;
}

interface SunPumpResponse {
  code?: number;
  msg?: string;
  data?: SunPumpToken | SunPumpToken[] | { list?: SunPumpToken[]; tokenList?: SunPumpToken[] };
}

export async function fetchSunPump(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<SunPumpResponse>(SUNPUMP_URL, {
      timeout: 10000,
      params: { orderBy: "createdAt", direction: "desc", pageSize: 50, pageNo: 1 },
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Referer: "https://sunpump.meme/",
      },
    });

    const raw = res.data?.data;
    let tokens: SunPumpToken[] = [];
    if (Array.isArray(raw)) {
      tokens = raw;
    } else if (raw && typeof raw === "object") {
      const container = raw as { list?: SunPumpToken[]; tokenList?: SunPumpToken[] };
      if (Array.isArray(container.list)) {
        tokens = container.list;
      } else if (Array.isArray(container.tokenList)) {
        tokens = container.tokenList;
      } else {
        tokens = [raw as SunPumpToken];
      }
    }

    const results: TokenAlert[] = [];
    for (const token of tokens) {
      const ca = token.contractAddress;
      const symbol = token.symbol ?? "UNKNOWN";
      const tg = token.telegramUrl;
      if (!ca || !tg) continue;

      const rawTs = token.tokenCreatedInstant
        ? typeof token.tokenCreatedInstant === "string"
          ? new Date(token.tokenCreatedInstant).getTime()
          : Number(token.tokenCreatedInstant)
        : 0;
      if (rawTs === 0 || Date.now() - rawTs > TWENTY_FOUR_HOURS_MS) continue;

      const tgLink = tg.startsWith("http") ? tg : `https://t.me/${tg.replace(/^@/, "")}`;
      const imageUrl = token.logoUrl && token.logoUrl.startsWith("http") ? token.logoUrl : undefined;

      results.push({
        ca,
        symbol,
        name: token.name,
        chain: "tron",
        telegramLink: tgLink,
        source: "SunPump",
        imageUrl,
      });
    }

    logger.info({ source: "SunPump", found: results.length }, "SunPump fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "SunPump", status }, "SunPump fetch failed");
    return [];
  }
}
