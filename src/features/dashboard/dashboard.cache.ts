import { cache } from "../../shared/cache/cache.client";

/**
 * dashboard feature'ının izole cache keyspace'i (`dashboard:` öneki).
 *
 * TTL-TABANLI CACHE (invalidasyon YOK — bilinçli): panel sayaçları düzinelerce
 * farklı yazımdan (kulüp/etkinlik/duyuru/üyelik/başvuru) etkilenir; her birine
 * invalidasyon kancası takmak invaziv olurdu. Sayaçlar STALENESS-TOLERANSLIDIR
 * (30 sn eski bir "üye sayısı" zararsız), o yüzden precise invalidasyon yerine
 * KISA TTL kullanılır. Bu, university.cache'in (durağan + invalidasyonlu) yerine
 * bilinçli farklı bir cache stratejisidir — veri karakteri farklı.
 *
 * FEED cache'lenmez: kişiye özel + cursor'lı (çok anahtar) ve "yeni içerik"
 * beklentisi taze olmalı.
 */
const c = cache.namespace("dashboard");

// Kısa TTL: sayaçlar birkaç saniye eski olabilir, doğruluk kaybı yok.
const TTL = { ttlSeconds: 30 };

export const dashboardCache = {
  student: <T>(userId: string, loader: () => Promise<T>) => c.getOrSet(`student:${userId}`, loader, TTL),
  club: <T>(clubId: string, loader: () => Promise<T>) => c.getOrSet(`club:${clubId}`, loader, TTL),
  admin: <T>(universityId: string, loader: () => Promise<T>) => c.getOrSet(`admin:${universityId}`, loader, TTL),
};
