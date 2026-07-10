# ─── Stage 1: dependencies ─────────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Lockfile'ı ayrı kopyala: bağımlılıklar değişmedikçe bu katman cache'ten gelir.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Root olarak çalıştırma — imaj zaten `bun` kullanıcısıyla geliyor.
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun drizzle.config.ts ./

USER bun

EXPOSE 3000

# /health rotası uygulamada tanımlı (src/index.ts).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
