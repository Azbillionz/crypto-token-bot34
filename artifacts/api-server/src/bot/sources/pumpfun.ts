import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const PUMP_API = "https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false";

interface PumpCoin {
  mint?: string;
  symbol?: string;
  telegram?: string;
}

export async function fetchPumpFun(): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<PumpCoin[]>(PUMP_API, { timeout: 10000 });
    const coins: PumpCoin[] = Array.isArray(res.data) ? res.data : [];
    const results: TokenAlert[] = [];

    for (const coin of coins) {
      const ca = coin.mint;
      const symbol = coin.symbol ?? "UNKNOWN";
      const tg = coin.telegram;
      if (!ca || !tg) continue;

      const tgLink = tg.startsWith("http") ? tg : `https://t.me/${tg.replace(/^@/, "")}`;
      results.push({ ca, symbol, telegramLink: tgLink, source: "pump.fun" });
    }

    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "pump.fun", status }, "pump.fun fetch failed — may be behind Cloudflare protection");
    return [];
  }
}
