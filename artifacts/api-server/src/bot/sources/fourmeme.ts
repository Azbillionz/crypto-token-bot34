import axios from "axios";
import { logger } from "../../lib/logger";
import type { TokenAlert } from "../telegram";

const FOUR_MEME_URL = "https://four.meme/meme-api/v1/private/token/query";

interface FourMemeToken {
  address?: string;
  symbol?: string;
  tgUrl?: string;
  tgLink?: string;
  telegram?: string;
  telegramUrl?: string;
  telegramLink?: string;
  label?: string;
}

interface FourMemeResponse {
  code?: number;
  data?: FourMemeToken[] | { list?: FourMemeToken[]; tokenList?: FourMemeToken[] };
}

export async function fetchFourMeme(): Promise<TokenAlert[]> {
  try {
    const res = await axios.get<FourMemeResponse>(FOUR_MEME_URL, {
      timeout: 10000,
      params: { pageNo: 1, pageSize: 50, status: 1, sortby: 0 },
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Referer: "https://four.meme/",
      },
    });

    let tokens: FourMemeToken[] = [];
    const raw = res.data;

    if (Array.isArray(raw?.data)) {
      tokens = raw.data as FourMemeToken[];
    } else if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
      const d = raw.data as { list?: FourMemeToken[]; tokenList?: FourMemeToken[] };
      tokens = d.tokenList ?? d.list ?? [];
    }

    const results: TokenAlert[] = [];

    for (const token of tokens) {
      const ca = token.address;
      const symbol = token.symbol ?? "UNKNOWN";
      if (!ca) continue;

      const tgLink =
        token.tgUrl ??
        token.tgLink ??
        token.telegram ??
        token.telegramUrl ??
        token.telegramLink;

      if (!tgLink) continue;

      const finalLink = tgLink.startsWith("http")
        ? tgLink
        : `https://t.me/${tgLink.replace(/^@/, "")}`;

      results.push({ ca, symbol, telegramLink: finalLink, source: "four.meme" });
    }

    logger.info({ source: "four.meme", found: results.length }, "four.meme fetch complete");
    return results;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    logger.warn({ source: "four.meme", status }, "four.meme fetch failed");
    return [];
  }
}
