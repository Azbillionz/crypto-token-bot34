import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const PUMP_API = "https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false";

interface PumpCoin {
  mint?: string;
  symbol?: string;
  telegram?: string;
  created_timestamp?: number;
}

export async function fetchPumpFun(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<PumpCoin[]>(PUMP_API, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://pump.fun/",
      },
    });
    const coins: PumpCoin[] = Array.isArray(res.data) ? res.data : [];
    const results: TokenAlert[] = [];

    for (const coin of coins) {
      const ca = coin.mint;
      const symbol = coin.symbol ?? "UNKNOWN";
      const tg = coin.telegram;
      const createdAt = coin.created_timestamp ?? 0;

      if (!ca || !tg) continue;

      const tgLink = tg.startsWith("http") ? tg : `https://t.me/${tg.replace(/^@/, "")}`;
      results.push({ ca, symbol, telegramLink: tgLink, source: "pump.fun" });
    }

    logger.info({ source: "pump.fun", found: results.length }, "pump.fun fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "pump.fun", status }, "pump.fun fetch failed");
    return [];
  }
}
