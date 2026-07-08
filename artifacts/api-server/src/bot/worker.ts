import { logger } from "../lib/logger";
import { hasSeen, markSeen } from "./cache";
import { sendTokenAlert } from "./telegram";
import { fetchDexScreener } from "./sources/dexscreener";
import { fetchSunPump } from "./sources/sunpump";
import { fetchTop100Token } from "./sources/top100token";
import { fetchGeckoTerminal } from "./sources/geckoterminal";
import { fetchRaydium } from "./sources/raydium";

const INTERVAL_MS = 60_000;

let lastPollTime = Date.now() - INTERVAL_MS * 2;

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  const sinceMs = lastPollTime;
  logger.info({ sinceMs: new Date(sinceMs).toISOString() }, "Worker cycle started — polling all sources");

  const [gecko, dex, boosted, raydium, sun] = await Promise.allSettled([
    fetchGeckoTerminal(sinceMs),
    fetchDexScreener(sinceMs),
    fetchTop100Token(sinceMs),
    fetchRaydium(sinceMs),
    fetchSunPump(sinceMs),
  ]);

  const all = [
    ...(gecko.status === "fulfilled" ? gecko.value : []),
    ...(dex.status === "fulfilled" ? dex.value : []),
    ...(boosted.status === "fulfilled" ? boosted.value : []),
    ...(raydium.status === "fulfilled" ? raydium.value : []),
    ...(sun.status === "fulfilled" ? sun.value : []),
  ];

  // Only keep tokens that have a Telegram link
  const withTg = all.filter((t) => t.telegramLink && t.telegramLink.trim().length > 0);

  logger.info({ total: all.length, withTelegram: withTg.length }, "Tokens found across all sources");

  let sent = 0;
  for (const token of withTg) {
    if (hasSeen(token.ca)) continue;
    try {
      await sendTokenAlert(token);
      // Only mark as seen AFTER a successful send
      markSeen(token.ca);
      sent++;
    } catch (err: any) {
      logger.error({ message: err?.message, ca: token.ca }, "Send failed — will retry next cycle");
    }
  }

  lastPollTime = cycleStart;
  logger.info({ sent }, "Worker cycle complete");
}

export function startWorker(): void {
  logger.info("Crypto token monitor worker starting");

  runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));

  setInterval(() => {
    runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));
  }, INTERVAL_MS);
}
