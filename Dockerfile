# ─── Stage 1: production bağımlılıkları ────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Lockfile'ı ayrı kopyala: bağımlılıklar değişmedikçe bu katman cache'ten gelir.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ─── Stage 2: tüm bağımlılıklar (drizzle-kit dahil) ────────────
FROM oven/bun:1-alpine AS deps-full
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 3: migration çalıştırıcı ────────────────────────────
# Ayrı bir imaj: prod imajında drizzle-kit (devDependency) YOKTUR ve olmamalıdır.
# Migration'lar uygulamadan önce, tek seferlik bir container'da koşar.
FROM oven/bun:1-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps-full --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock drizzle.config.ts ./
COPY --chown=bun:bun src ./src
USER bun
CMD ["bun", "run", "db:migrate"]

# ─── Stage 4: uygulama (varsayılan hedef) ──────────────────────
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

# /health rotası bağımlılıkları da yoklar: DB veya Redis düşükse 503 döner,
# yani container "unhealthy" işaretlenir.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
