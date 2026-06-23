import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo, TEN_MIN_MS, isRecent } from "./utils";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Raydium CPMM AMM Config account — only referenced during pool Initialize,
 * not during swaps. Using this as a source gives us only new pool creation txs.
 */
const CPMM_CONFIG = "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2";

const KNOWN_QUOTES = new Set([
  "So11111111111111111111111111111111111111112",    // WSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
]);

async function rpcPost(method: string, params: unknown[]): Promise<unknown> {
  const res = await axios.post(
    SOLANA_RPC,
    { jsonrpc: "2.0", id: 1, method, params },
    { timeout: 12000, headers: { "Content-Type": "application/json" } },
  );
  return res.data;
}

export async function fetchRaydium(sinceMs: number): Promise<TokenAlert[]> {
  try {
    // 1. Get recent signatures from Raydium CPMM config account
    const sigData = (await rpcPost("getSignaturesForAddress", [
      CPMM_CONFIG,
      { limit: 100 },
    ])) as { result?: Array<{ signature: string; blockTime: number; err: unknown }> };

    const signatures = sigData.result ?? [];

    // Filter to signatures within our poll window (since last run)
    const recentSigs = signatures.filter(
      (s) => !s.err && s.blockTime && Date.now() - s.blockTime * 1000 <= TEN_MIN_MS,
    );

    if (recentSigs.length === 0) {
      logger.info({ source: "Raydium/Jupiter" }, "No recent CPMM events");
      return [];
    }

    logger.info(
      { source: "Raydium/Jupiter", sigs: recentSigs.length },
      "Fetching CPMM transactions",
    );

    // 2. Fetch transactions in parallel batches (avoid overwhelming public RPC)
    const BATCH = 15;
    const candidateMints = new Set<string>();

    for (let i = 0; i < Math.min(recentSigs.length, 60); i += BATCH) {
      const batch = recentSigs.slice(i, i + BATCH);
      const txResults = await Promise.allSettled(
        batch.map((s) =>
          rpcPost("getTransaction", [
            s.signature,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
          ]),
        ),
      );

      for (const result of txResults) {
        if (result.status !== "fulfilled") continue;
        const data = result.value as {
          result?: {
            meta?: {
              postTokenBalances?: Array<{ mint: string }>;
            };
          };
        };
        const tx = data.result;
        if (!tx) continue;

        const postBals = tx.meta?.postTokenBalances ?? [];
        const uniqueMints = [...new Set(postBals.map((b) => b.mint))];

        /**
         * Pool creation has 3+ unique mints (newToken + WSOL/stablecoin + LP token).
         * A plain swap on CPMM has exactly 2 unique mints (input + output).
         * Deposits/withdrawals on existing pools have 3 mints but those pools are
         * old, so DexScreener pairCreatedAt check below will filter them out.
         */
        if (uniqueMints.length < 3) continue;

        for (const mint of uniqueMints) {
          if (!KNOWN_QUOTES.has(mint)) {
            candidateMints.add(mint);
          }
        }
      }
    }

    if (candidateMints.size === 0) {
      logger.info({ source: "Raydium/Jupiter" }, "No new token candidates found");
      return [];
    }

    // 3. Look up candidates on DexScreener — this validates recency AND provides Telegram links
    const pairInfoMap = await getPairInfo([...candidateMints]);

    const results: TokenAlert[] = [];
    for (const ca of candidateMints) {
      const info = pairInfoMap.get(ca.toLowerCase());
      if (!info) continue;
      if (!isRecent(info.createdAt)) continue; // pair must be < 10 min old
      if (!info.telegramLink) continue;         // must have Telegram link

      results.push({
        ca,
        symbol: info.symbol ?? "UNKNOWN",
        name: info.name,
        chain: "solana",
        telegramLink: info.telegramLink,
        source: "Raydium / Jupiter (Solana)",
        imageUrl: info.imageUrl,
        websiteUrl: info.websiteUrl,
        twitterUrl: info.twitterUrl,
        priceUsd: info.priceUsd,
        fdv: info.fdv,
        volume24h: info.volume24h,
        liquidity: info.liquidity,
        buys24h: info.buys24h,
        sells24h: info.sells24h,
      });
    }

    logger.info(
      { source: "Raydium/Jupiter", candidates: candidateMints.size, found: results.length },
      "Raydium/Jupiter fetch complete",
    );
    return results;
  } catch (err) {
    logger.warn(
      { source: "Raydium/Jupiter", err: (err as Error).message?.slice(0, 80) },
      "Raydium/Jupiter fetch failed",
    );
    return [];
  }
}
