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
  priceUsd?: number;
  fdv?: number;
  volume24h?: number;
  liquidity?: number;
  buys24h?: number;
  sells24h?: number;
  websiteUrl?: string;
  twitterUrl?: string;
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
    tron: "tron",
  };
  const normalized = chainMap[chain.toLowerCase()] ?? chain.toLowerCase();
  return `https://dexscreener.com/${normalized}/${ca}`;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(8).replace(/\.?0+$/, "")}`;
}

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  const exp = n.toExponential(3);
  return `$${exp}`;
}

function buildCaption(alert: TokenAlert): string {
  const name = alert.name ? escapeHtml(alert.name) : null;
  const symbol = escapeHtml(alert.symbol);
  const ca = escapeHtml(alert.ca);
  const source = escapeHtml(alert.source);
  const chain = alert.chain ? escapeHtml(alert.chain.toUpperCase()) : null;
  const dexUrl = alert.chain ? buildDexUrl(alert.ca, alert.chain) : null;

  const hasMarketData = alert.priceUsd !== undefined || alert.fdv !== undefined ||
    alert.volume24h !== undefined || alert.liquidity !== undefined;

  const hasTxData = alert.buys24h !== undefined || alert.sells24h !== undefined;

  const lines: string[] = [
    `🚀 <b>NEW TOKEN LAUNCH DETECTED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    name ? `🪙 <b>$${symbol}</b>  —  ${name}` : `🪙 <b>$${symbol}</b>`,
    chain ? `⛓ <b>Chain:</b>  ${chain}` : ``,
    ``,
    `📋 <b>Contract Address:</b>`,
    `<code>${ca}</code>`,
  ];

  if (hasMarketData) {
    lines.push(``);
    lines.push(`📊 <b>Market Data:</b>`);

    const row1Parts: string[] = [];
    if (alert.priceUsd !== undefined) row1Parts.push(`💰 Price: <b>${formatPrice(alert.priceUsd)}</b>`);
    if (alert.fdv !== undefined) row1Parts.push(`📈 FDV: <b>${formatUsd(alert.fdv)}</b>`);
    if (row1Parts.length) lines.push(`  ${row1Parts.join("   ")}`);

    const row2Parts: string[] = [];
    if (alert.volume24h !== undefined) row2Parts.push(`📦 Vol 24h: <b>${formatUsd(alert.volume24h)}</b>`);
    if (alert.liquidity !== undefined) row2Parts.push(`💧 Liq: <b>${formatUsd(alert.liquidity)}</b>`);
    if (row2Parts.length) lines.push(`  ${row2Parts.join("   ")}`);

    if (hasTxData) {
      const buys = alert.buys24h ?? 0;
      const sells = alert.sells24h ?? 0;
      const total = buys + sells;
      const bullRatio = total > 0 ? Math.round((buys / total) * 10) : 0;
      const bar = "🟢".repeat(bullRatio) + "🔴".repeat(10 - bullRatio);
      lines.push(`  🔄 Txns: <b>${buys}↑ / ${sells}↓</b>  ${bar}`);
    }
  }

  lines.push(``);
  lines.push(`🔗 <b>Links:</b>`);
  lines.push(`  💬 <a href="${escapeHtml(alert.telegramLink)}">Telegram Community</a>`);
  if (dexUrl) lines.push(`  📊 <a href="${escapeHtml(dexUrl)}">DexScreener Chart</a>`);
  if (alert.websiteUrl) lines.push(`  🌐 <a href="${escapeHtml(alert.websiteUrl)}">Website</a>`);
  if (alert.twitterUrl) lines.push(`  🐦 <a href="${escapeHtml(alert.twitterUrl)}">Twitter / X</a>`);

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📡 <i>Detected via ${source}</i>`);

  return lines.filter((l) => l !== undefined && l !== null).join("\n");
}

export async function sendTokenAlert(alert: TokenAlert): Promise<void> {
  const caption = buildCaption(alert);

  if (alert.imageUrl) {
    try {
      await bot.sendPhoto(channelId!, alert.imageUrl, {
        caption,
        parse_mode: "HTML",
      });
      logger.info({ ca: alert.ca, symbol: alert.symbol, source: alert.source }, "Alert sent (with photo)");
      return;
    } catch (err: any) {
      logger.warn({ message: err?.message, ca: alert.ca }, "Photo send failed — falling back to text");
    }
  }

  // Send as plain text (or as fallback when photo fails)
  await bot.sendMessage(channelId!, caption, { parse_mode: "HTML" });
  logger.info({ ca: alert.ca, symbol: alert.symbol, source: alert.source }, "Alert sent");
}
