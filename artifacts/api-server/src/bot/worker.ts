import { logger } from "../lib/logger";
import { hasSeen, markSeen } from "./cache";
import { sendTokenAlert } from "./telegram";
import { fetchDexScreener } from "./sources/dexscreener";
import { fetchPumpFun } from "./sources/pumpfun";
import { fetchFourMeme } from "./sources/fourmeme";
import { fetchTop100Token } from "./sources/top100token";

const INTERVAL_MS = 60_000;

async function runCycle(): Promise<void> {
  logger.info("Worker cycle started — polling all sources");

  const [dex, pump, four, top100] = await Promise.allSettled([
    fetchDexScreener(),
    fetchPumpFun(),
    fetchFourMeme(),
    fetchTop100Token(),
  ]);

  const all = [
    ...(dex.status === "fulfilled" ? dex.value : []),
    ...(pump.status === "fulfilled" ? pump.value : []),
    ...(four.status === "fulfilled" ? four.value : []),
    ...(top100.status === "fulfilled" ? top100.value : []),
  ];

  logger.info({ total: all.length }, "Tokens found across all sources");

  let sent = 0;
  for (const token of all) {
    if (hasSeen(token.ca)) continue;
    markSeen(token.ca);
    await sendTokenAlert(token);
    sent++;
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
