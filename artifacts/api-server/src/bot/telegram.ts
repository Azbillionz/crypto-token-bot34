import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";

const token = process.env["TELEGRAM_BOT_TOKEN"];
const channelId = process.env["TELEGRAM_CHANNEL_ID"];

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!channelId) throw new Error("TELEGRAM_CHANNEL_ID is not set");

const bot = new TelegramBot(token);

export interface TokenAlert {
  symbol: string;
  ca: string;
  telegramLink: string;
  source: string;
  imageUrl?: string;
  name?: string;
  chain?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDexUrl(ca: string, chain: string): string {
  const chainMap: Record<string, string> = {
    solana: "solana",
    bsc: "bsc",
    ethereum: "ethereum",
    eth: "ethereum",
    base: "base",
    arbitrum: "arbitrum",
    polygon: "polygon",
    avalanche: "avalanche",
    avax: "avalanche",
  };
  const normalized = chainMap[chain.toLowerCase()] ?? chain.toLowerCase();
  return `https://dexscreener.com/${normalized}/${ca}`;
}

function buildCaption(alert: TokenAlert): string {
  const name = alert.name ? escapeHtml(alert.name) : null;
  const symbol = escapeHtml(alert.symbol);
  const ca = escapeHtml(alert.ca);
  const source = escapeHtml(alert.source);
  const chain = alert.chain ? escapeHtml(alert.chain.toUpperCase()) : null;
  const dexUrl = alert.chain ? buildDexUrl(alert.ca, alert.chain) : null;

  const lines: string[] = [
    `🚀 <b>NEW TOKEN LAUNCH DETECTED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    name
      ? `🪙 <b>${symbol}</b>  —  ${name}`
      : `🪙 <b>$${symbol}</b>`,
    chain ? `⛓ <b>Chain:</b>  ${chain}` : "",
    ``,
    `📋 <b>Contract Address:</b>`,
    `<code>${ca}</code>`,
    ``,
    `🔗 <b>Links:</b>`,
    `  💬 <a href="${escapeHtml(alert.telegramLink)}">Telegram Community</a>`,
    dexUrl ? `  📊 <a href="${escapeHtml(dexUrl)}">View Chart on DexScreener</a>` : "",
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📡 <i>Detected via ${source}</i>`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");

  return lines;
}

export async function sendTokenAlert(alert: TokenAlert): Promise<void> {
  const caption = buildCaption(alert);

  try {
    if (alert.imageUrl) {
      await bot.sendPhoto(channelId!, alert.imageUrl, {
        caption,
        parse_mode: "HTML",
      });
    } else {
      await bot.sendMessage(channelId!, caption, { parse_mode: "HTML" });
    }
    logger.info({ ca: alert.ca, symbol: alert.symbol, source: alert.source }, "Alert sent");
  } catch (err) {
    // If sendPhoto fails (bad image URL), fall back to text-only
    if (alert.imageUrl) {
      try {
        await bot.sendMessage(channelId!, caption, { parse_mode: "HTML" });
        logger.info({ ca: alert.ca, symbol: alert.symbol, source: alert.source }, "Alert sent (text fallback)");
        return;
      } catch (_) {}
    }
    logger.error({ err, ca: alert.ca }, "Failed to send Telegram alert");
  }
}
