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
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTokenAlert(alert: TokenAlert): Promise<void> {
  const message = [
    `🚀 <b>New Token Detected!</b>`,
    ``,
    `💬 <b>Socials:</b> <a href="${escapeHtml(alert.telegramLink)}">Telegram</a>`,
    `📝 <b>CA:</b> <code>${escapeHtml(alert.ca)}</code>`,
    `🪙 <b>Symbol:</b> $${escapeHtml(alert.symbol)}`,
    `🌐 <b>Source:</b> ${escapeHtml(alert.source)}`,
  ].join("\n");

  try {
    await bot.sendMessage(channelId!, message, { parse_mode: "HTML" });
    logger.info({ ca: alert.ca, symbol: alert.symbol, source: alert.source }, "Alert sent");
  } catch (err) {
    logger.error({ err, ca: alert.ca }, "Failed to send Telegram alert");
  }
}
