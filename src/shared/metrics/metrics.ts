import { createMetrics } from "../../core/metrics/metrics";

/**
 * Uygulamanın metrics örneği — taşınabilir core/metrics seam'inin bu projeye özel
 * kurulumu (prefix "uniclub_"). index.ts middleware'i mount eder + `/metrics`'i
 * expose eder. Aynı desen: shared/logger, shared/cache.
 *
 * NOT (prod güvenliği): `/metrics` iç bilgileri sızdırır — Caddy/proxy bunu DIŞARIYA
 * açmamalı; yalnızca Prometheus'un iç ağdan scrape'ine bırakılmalı.
 */
export const metrics = createMetrics({ prefix: "uniclub_" });
