import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";
import { getPairInfo, TEN_MIN_MS } from "./utils";

const WSOL = "So11111111111111111111111111111111111111112";

const KNOWN_QUOTE_TOKENS = new Set([
  WSOL,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
]);

interface RaydiumMint {
  address: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

interface RaydiumPool {
  id: string;
  mintA: RaydiumMint;
  mintB: RaydiumMint;
  openTime: number;
  tvl?: number;
}

interface RaydiumResponse {
  success: boolean;
  data: {
    data: RaydiumPool[];
  };
}

export async function fetchRaydium(_sinceMs: number): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<RaydiumResponse>(
      "https://api-v3.raydium.io/pools/info/list",
      {
        params: {
          poolType: "all",
          poolSortField: "default",
          sortType: "desc",
          pageSize: 100,
          page: 1,
        },
        timeout: 15000,
        headers: { Accept: "application/json" },
      },
    );

    if (!res.data?.success) return [];

    const now = Date.now();
    const pools: RaydiumPool[] = res.data.data?.data ?? [];

    type Candidate = {
      ca: string;
      symbol: string;
      name?: string;
      imageUrl?: string;
    };

    const candidates: Candidate[] = [];

    for (const pool of pools) {
      const openMs = pool.openTime > 1e12 ? pool.openTime : pool.openTime * 1000;
      if (now - openMs > TEN_MIN_MS) continue;

      const { mintA, mintB } = pool;

      let newToken: RaydiumMint;
      if (KNOWN_QUOTE_TOKENS.has(mintA.address)) {
        newToken = mintB;
      } else if (KNOWN_QUOTE_TOKENS.has(mintB.address)) {
        newToken = mintA;
      } else {
        newToken = mintB;
      }

      if (!newToken?.address) continue;

      candidates.push({
        ca: newToken.address,
        symbol: newToken.symbol ?? "UNKNOWN",
        name: newToken.name,
        imageUrl: newToken.logoURI?.startsWith("http") ? newToken.logoURI : undefined,
      });
    }

    if (candidates.length === 0) {
      logger.info({ source: "Raydium" }, "No new Raydium pools in the last 10 min");
      return [];
    }

    logger.info({ source: "Raydium", candidates: candidates.length }, "Enriching via DexScreener");

    const pairInfoMap = await getPairInfo(candidates.map((c) => c.ca));

    const results: TokenAlert[] = [];
    for (const { ca, symbol, name, imageUrl } of candidates) {
      const info = pairInfoMap.get(ca.toLowerCase());
      if (!info?.telegramLink) continue;

      results.push({
        ca,
        symbol: info.symbol ?? symbol,
        name: info.name ?? name,
        chain: "solana",
        telegramLink: info.telegramLink,
        source: "Raydium / Jupiter (Solana)",
        imageUrl: info.imageUrl ?? imageUrl,
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

    logger.info({ source: "Raydium", found: results.length }, "Raydium fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "Raydium", status }, "Raydium fetch failed");
    return [];
  }
}
