import { defineKeyspace, entry } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { AdminDashboard, ClubDashboard, StudentSummary } from "./dashboard.types";

/**
 * dashboard feature'ının cache sözleşmesi (`dashboard:` keyspace'i).
 *
 * TTL-TABANLI CACHE (EFEKT YOK — bilinçli): panel sayaçları düzinelerce farklı
 * yazımdan (kulüp/etkinlik/duyuru/üyelik/başvuru) etkilenir; her birine invalidasyon
 * kancası takmak invaziv olurdu. Sayaçlar STALENESS-TOLERANSLIDIR (30 sn eski bir
 * "üye sayısı" zararsız), o yüzden precise invalidasyon yerine KISA TTL kullanılır.
 * Bu, university.cache'in (durağan + efektli) yerine bilinçli olarak FARKLI bir
 * cache stratejisidir — veri karakteri farklı. TTL girdi tanımında yaşar, çağrı
 * yerlerinde tekrarlanmaz.
 *
 * FEED cache'lenmez: kişiye özel + cursor'lı (çok anahtar) ve "yeni içerik"
 * beklentisi taze olmalı.
 */
const STALE_TOLERANCE = { ttlSeconds: 30 };

export const dashboardCache = defineKeyspace(cache, "dashboard", {
  student: entry<StudentSummary>()((userId: string) => `student:${userId}`, STALE_TOLERANCE),
  club: entry<ClubDashboard>()((clubId: string) => `club:${clubId}`, STALE_TOLERANCE),
  admin: entry<AdminDashboard>()((universityId: string) => `admin:${universityId}`, STALE_TOLERANCE),
});
