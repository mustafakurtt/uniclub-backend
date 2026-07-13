import { cache } from "../../shared/cache/cache.client";

/**
 * clubs feature'ının izole cache keyspace'i (`clubs:` öneki) + tipli read-through/
 * invalidasyon yardımcıları. Public browse (onaylı kulüp listesi) + kulüp profili +
 * üye listesi okuma-yoğundur; bunlar cache'lenir.
 *
 * ÇAPRAZ-FEATURE: kulüp durumu/danışman/üye yazarlarının bir kısmı admin
 * feature'ındadır (approve/status/update/delete/advisor/removeMember). O yollar da
 * buradaki invalidasyon yardımcılarını çağırır — invalidasyon mantığı TEK yerde.
 *
 * DİKKAT: `getClubDetail` yanıtı üyeleri VE danışmanları gömer; bu yüzden üyelik/
 * danışman değişimi hem `detail`i hem `members`ı geçersiz kılar (invalidateMembership
 * / invalidateDetail). Liste yalnızca isim/logo/durum değişince etkilenir.
 */
const c = cache.namespace("clubs");

const keys = {
  /** Bir üniversitenin onaylı (aramasız) kulüp listesi. */
  list: (universityId: string) => `list:${universityId}`,
  /** Danışman + üyelerle birlikte kulüp profili. */
  detail: (clubId: string) => `detail:${clubId}`,
  /** Kulübün onaylı üye listesi. */
  members: (clubId: string) => `members:${clubId}`,
};

export const clubsCache = {
  // ── Okuma (read-through) ────────────────────────────────────────────────
  list: <T>(universityId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.list(universityId), loader),
  detail: <T>(clubId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.detail(clubId), loader),
  members: <T>(clubId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.members(clubId), loader),

  // ── Invalidasyon ────────────────────────────────────────────────────────
  /** Yeni onaylı kulüp (application approve) → yalnızca liste. */
  invalidateList: (universityId: string) => c.delete(keys.list(universityId)),
  /** Danışman/iletişim linki değişti → yalnızca profil (üyeler değişmedi). */
  invalidateDetail: (clubId: string) => c.delete(keys.detail(clubId)),
  /** Üyelik değişti (katıl/ayrıl/rol/karar/çıkarma/devir) → profil + üye listesi. */
  invalidateMembership: (clubId: string) => c.delete([keys.detail(clubId), keys.members(clubId)]),
  /** İsim/logo/joinPolicy güncellendi → liste + profil. */
  invalidateProfile: (universityId: string, clubId: string) =>
    c.delete([keys.list(universityId), keys.detail(clubId)]),
  /** Durum değişti / silindi → liste + profil + üye listesi (tümü). */
  invalidateClubFull: (universityId: string, clubId: string) =>
    c.delete([keys.list(universityId), keys.detail(clubId), keys.members(clubId)]),
};
