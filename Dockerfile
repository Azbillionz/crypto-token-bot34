# ─── Builder Stage ───────────────────────────────────────────────────────────
# Full monorepo needed here so esbuild can resolve workspace packages
FROM node:20-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@9 --quiet

# Copy workspace config first — better Docker layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all internal workspace lib packages (bundled into final dist)
COPY lib/ ./lib/

# Copy only the bot package manifest first (layer cache for deps)
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install all dependencies (frozen = exact versions from lockfile, no resolution)
RUN pnpm install --frozen-lockfile

# Copy bot source code
COPY artifacts/api-server/ ./artifacts/api-server/

# Build — esbuild bundles every dependency into dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# ─── Production Stage ────────────────────────────────────────────────────────
# Final image only needs Node + the bundled output (~4mb total)
FROM node:20-slim AS production

WORKDIR /app

# Copy only the compiled bundle — no node_modules, no source code
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 botuser \
 && chown -R botuser:nodejs /app

USER botuser

ENV NODE_ENV=production

# PORT is injected at runtime by the hosting platform (Railway/Render)
EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
