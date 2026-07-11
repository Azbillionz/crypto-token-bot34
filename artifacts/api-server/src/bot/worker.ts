import { logger } from "../lib/logger";
import { hasSeen, markSeen } from "./cache";
import { sendTokenAlert } from "./telegram";
import { fetchSunPump } from "./sources/sunpump";
import { fetchTop100Token } from "./sources/top100token";
import { fetchGeckoTerminal } from "./sources/geckoterminal";
import { fetchRaydium } from "./sources/raydium";
import { fetchPumpFun } from "./sources/pumpfun";

const INTERVAL_MS = 60_000;

let isFirstRun = true;

async function fetchAll(sinceMs: number) {
  const [gecko, boosted, raydium, sun, pump] = await Promise.allSettled([
    fetchGeckoTerminal(sinceMs),
    fetchTop100Token(sinceMs),
    fetchRaydium(sinceMs),
    fetchSunPump(sinceMs),
    fetchPumpFun(sinceMs),
  ]);

  return [
    ...(gecko.status === "fulfilled" ? gecko.value : []),
    ...(boosted.status === "fulfilled" ? boosted.value : []),
    ...(raydium.status === "fulfilled" ? raydium.value : []),
    ...(sun.status === "fulfilled" ? sun.value : []),
    ...(pump.status === "fulfilled" ? pump.value : []),
  ];
}

async function runCycle(): Promise<void> {
  const sinceMs = Date.now() - INTERVAL_MS * 2;

  if (isFirstRun) {
    logger.info("Startup dry-run — seeding seen cache, no alerts sent");
    const all = await fetchAll(sinceMs);
    for (const token of all) markSeen(token.ca);
    logger.info({ seeded: all.length }, "Dry-run complete — bot will now send only NEW tokens");
    isFirstRun = false;
    return;
  }

  logger.info("Worker cycle started — polling all sources");
  const all = await fetchAll(sinceMs);
  const withTg = all.filter((t) => t.telegramLink?.trim());
  logger.info({ total: all.length, withTelegram: withTg.length }, "Tokens found");

  let sent = 0;
  for (const token of withTg) {
    if (hasSeen(token.ca)) continue;
    try {
      await sendTokenAlert(token);
      markSeen(token.ca);
      sent++;
    } catch (err: any) {
      logger.error({ message: err?.message, ca: token.ca }, "Send failed — will retry next cycle");
    }
  }

  logger.info({ sent }, "Worker cycle complete");
}

export function startWorker(): void {
  logger.info("Crypto token monitor worker starting");

  runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));

  setInterval(() => {
    runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));
  }, INTERVAL_MS);
}
