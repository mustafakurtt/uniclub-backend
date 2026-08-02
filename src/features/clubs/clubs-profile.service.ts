import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { notFound, badRequest } from "../../shared/utils/errors";
import { clubsCache, clubEffects } from "./clubs.cache";
import { CreateContactLinkDTO, UpdateOwnClubDTO } from "./clubs.schema";

/** Kulüp keşif, detay, profil güncelleme ve iletişim linkleri. */
export const clubsProfileService = {
  async listClubs(universityId: string, search?: string) {
    // Arama sonuçları cache'lenmez (çok anahtar); yalnızca aramasız public liste.
    if (search) {
      return await clubsRepository.findApprovedClubsByUniversity(universityId, search);
    }
    return await clubsCache.list(universityId).read(() =>
      clubsRepository.findApprovedClubsByUniversity(universityId)
    );
  },

  async getClubDetail(universityId: string, clubId: string) {
    // clubId global benzersiz → cache clubId ile anahtarlanır; loader tenant-filtresiz
    // yükler, tenant doğrulaması cache DIŞINDA yapılır (yanlış tenant cache hit'te sızmasın).
    const club = await clubsCache.detail(clubId).read(() => clubsRepository.findClubDetailById(clubId));
    if (!club || club.universityId !== universityId) {
      throw notFound("club.notFound");
    }
    const { clubAdvisors, ...rest } = club;
    return {
      ...rest,
      advisors: clubAdvisors
        .filter((a) => a.user)
        .map((a) => toSafeUser(a.user!)),
      advisorVacant: clubAdvisors.length === 0,
      clubMembers: club.clubMembers
        .filter((m) => m.user)
        .map((m) => ({ ...m, user: toSafeUser(m.user!) })),
    };
  },

  /**
   * Başkanın kendi kulübünün profilini güncellemesi (ad/açıklama/logo/kapak/joinPolicy).
   * Durum (status) buradan değiştirilemez — o okul yöneticisinin işidir.
   */
  async updateOwnClub(universityId: string, clubId: string, data: UpdateOwnClubDTO) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    const updated = await clubsRepository.updateOwnClub(clubId, data);
    await clubEffects.profileChanged.emit(universityId, clubId); // isim/logo listede de görünür
    return updated;
  },

  async addContactLink(clubId: string, data: CreateContactLinkDTO) {
    const existing = await clubsRepository.findContactLinkByPlatform(clubId, data.platform);
    if (existing) {
      throw badRequest("club.contactLinkPlatformExists");
    }
    const result = await clubsRepository.createContactLink(clubId, data);
    await clubEffects.detailChanged.emit(clubId); // iletişim linkleri profile gömülü
    return result;
  },

  async updateContactLink(clubId: string, linkId: string, url: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    const result = await clubsRepository.updateContactLink(clubId, linkId, url);
    await clubEffects.detailChanged.emit(clubId);
    return result;
  },

  async removeContactLink(clubId: string, linkId: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    await clubsRepository.deleteContactLink(clubId, linkId);
    await clubEffects.detailChanged.emit(clubId);
  },
};
