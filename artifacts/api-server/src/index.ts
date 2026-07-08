import app from "./app";
import { logger } from "./lib/logger";
import { startWorker } from "./bot/worker";

// ─── Crash Recovery ──────────────────────────────────────────────────────────
// Log errors but DO NOT exit — keep the bot running 24/7
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — continuing");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "Unhandled rejection — continuing");
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  process.exit(0);
});

// ─── Server ──────────────────────────────────────────────────────────────────
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startWorker();
});
