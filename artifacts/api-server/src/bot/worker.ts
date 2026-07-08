import { logger } from "../lib/logger";
import { hasSeen, markSeen } from "./cache";
import { sendTokenAlert } from "./telegram";
import { fetchDexScreener } from "./sources/dexscreener";
import { fetchPumpFun } from "./sources/pumpfun";
import { fetchSunPump } from "./sources/sunpump";
import { fetchTop100Token } from "./sources/top100token";
import { fetchGeckoTerminal } from "./sources/geckoterminal";
import { fetchRaydium } from "./sources/raydium";

const INTERVAL_MS = 60_000;

// ── pump.fun daily cap ────────────────────────────────────────────────────────
const PUMPFUN_DAILY_LIMIT = 50;
let pumpFunSentToday = 0;
let pumpFunDayStart = Date.now();

function pumpFunAllowed(): boolean {
  const now = Date.now();
  if (now - pumpFunDayStart >= 24 * 60 * 60 * 1000) {
    pumpFunSentToday = 0;
    pumpFunDayStart = now;
    logger.info("pump.fun daily counter reset");
  }
  return pumpFunSentToday < PUMPFUN_DAILY_LIMIT;
}
// ─────────────────────────────────────────────────────────────────────────────

let lastPollTime = Date.now() - INTERVAL_MS * 2;

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  const sinceMs = lastPollTime;
  logger.info({ sinceMs: new Date(sinceMs).toISOString() }, "Worker cycle started — polling all sources");

  const [gecko, dex, boosted, raydium, sun, pump] = await Promise.allSettled([
    fetchGeckoTerminal(sinceMs),
    fetchDexScreener(sinceMs),
    fetchTop100Token(sinceMs),
    fetchRaydium(sinceMs),
    fetchSunPump(sinceMs),
    fetchPumpFun(sinceMs),
  ]);

  // GeckoTerminal first — highest priority, most variety
  // pump.fun last — capped at PUMPFUN_DAILY_LIMIT per day
  const nonPump = [
    ...(gecko.status === "fulfilled" ? gecko.value : []),
    ...(dex.status === "fulfilled" ? dex.value : []),
    ...(boosted.status === "fulfilled" ? boosted.value : []),
    ...(raydium.status === "fulfilled" ? raydium.value : []),
    ...(sun.status === "fulfilled" ? sun.value : []),
  ];

  const pumpTokens = pump.status === "fulfilled" ? pump.value : [];

  logger.info(
    { nonPump: nonPump.length, pump: pumpTokens.length, pumpSentToday: pumpFunSentToday },
    "Tokens found across all sources",
  );

  let sent = 0;

  // Send non-pump.fun tokens first (no daily cap)
  for (const token of nonPump) {
    if (hasSeen(token.ca)) continue;
    markSeen(token.ca);
    await sendTokenAlert(token);
    sent++;
  }

  // Send pump.fun tokens up to daily limit
  for (const token of pumpTokens) {
    if (!pumpFunAllowed()) {
      logger.info(
        { limit: PUMPFUN_DAILY_LIMIT },
        "pump.fun daily limit reached — skipping remaining pump tokens",
      );
      break;
    }
    if (hasSeen(token.ca)) continue;
    markSeen(token.ca);
    await sendTokenAlert(token);
    pumpFunSentToday++;
    sent++;
  }

  lastPollTime = cycleStart;
  logger.info({ sent, pumpFunSentToday }, "Worker cycle complete");
}

export function startWorker(): void {
  logger.info("Crypto token monitor worker starting");

  runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));

  setInterval(() => {
    runCycle().catch((err) => logger.error({ err }, "Worker cycle error"));
  }, INTERVAL_MS);
}
