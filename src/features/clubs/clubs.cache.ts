import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { clubsRepository } from "./clubs.repository";

/**
 * clubs feature'ının cache sözleşmesi (`clubs:` keyspace'i). Public browse (onaylı
 * kulüp listesi) + kulüp profili + üye listesi okuma-yoğundur; bunlar cache'lenir.
 *
 * ÇAPRAZ-FEATURE: kulüp durumu/danışman/üye yazarlarının bir kısmı admin
 * feature'ındadır (approve/status/update/delete/advisor/removeMember). O yollar da
 * BURADAKİ efektleri emit eder — hangi anahtarların düştüğü tek yerde tanımlıdır.
 *
 * TETİK NEDEN SERVİSTE (university'den farklı olarak): bu efektler ya KOŞULLU
 * (`joinClub` yalnızca üyelik "approved" olduğunda invalide eder — açık kulüp
 * politikası), ya da parametresi istekte yok (`universityId` kulüp satırından
 * gelir). İkisi de rota middleware'inden görülemez.
 *
 * DİKKAT: `getClubDetail` yanıtı üyeleri VE danışmanları gömer; bu yüzden üyelik/
 * danışman değişimi hem `detail`i hem `members`ı düşürür. Liste yalnızca
 * isim/logo/durum değişince etkilenir.
 */
type ClubList = Awaited<ReturnType<typeof clubsRepository.findApprovedClubsByUniversity>>;
type ClubDetail = Awaited<ReturnType<typeof clubsRepository.findClubDetailById>>;
type ClubMembers = Awaited<ReturnType<typeof clubsRepository.findApprovedMembers>>;

export const clubsCache = defineKeyspace(cache, "clubs", {
  /** Bir üniversitenin onaylı (aramasız) kulüp listesi. */
  list: entry<ClubList>()((universityId: string) => `list:${universityId}`),
  /** Danışman + üyelerle birlikte kulüp profili. */
  detail: entry<ClubDetail>()((clubId: string) => `detail:${clubId}`),
  /** Kulübün onaylı üye listesi. */
  members: entry<ClubMembers>()((clubId: string) => `members:${clubId}`),
});

export const clubEffects = {
  /** Yeni onaylı kulüp (application approve) → yalnızca liste. */
  clubApproved: effect("clubs.approved", (universityId: string) => [clubsCache.list(universityId)]),

  /** Danışman/iletişim linki değişti → yalnızca profil (üyeler değişmedi). */
  detailChanged: effect("clubs.detailChanged", (clubId: string) => [clubsCache.detail(clubId)]),

  /** Üyelik değişti (katıl/ayrıl/rol/karar/çıkarma/devir) → profil + üye listesi. */
  membershipChanged: effect("clubs.membershipChanged", (clubId: string) => [
    clubsCache.detail(clubId),
    clubsCache.members(clubId),
  ]),

  /** İsim/logo/joinPolicy güncellendi → liste + profil. */
  profileChanged: effect("clubs.profileChanged", (universityId: string, clubId: string) => [
    clubsCache.list(universityId),
    clubsCache.detail(clubId),
  ]),

  /** Durum değişti / silindi → liste + profil + üye listesi (tümü). */
  clubChangedDeeply: effect("clubs.changedDeeply", (universityId: string, clubId: string) => [
    clubsCache.list(universityId),
    clubsCache.detail(clubId),
    clubsCache.members(clubId),
  ]),
};
