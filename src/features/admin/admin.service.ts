import { adminRepository } from "./admin.repository";
import { UpdateClubStatusDTO, UpdateClubDTO, UpdateUserDepartmentDTO } from "./admin.schema";
import { DecideClubApplicationResult, User } from "./admin.types";
import { toSafeUser } from "../../shared/utils/user.util";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { notFound, badRequest } from "../../shared/utils/errors";
// Çapraz-feature: admin, kulüp/duyuru/galeri kaynaklarını da yazar. Hangi cache
// anahtarlarının düştüğü bilgisi ilgili feature'ın kendi keyspace'inde durur;
// admin yalnızca olayı emit eder.
import { clubEffects } from "../clubs/clubs.cache";
import { announcementEffects } from "../announcements/announcements.cache";
import { galleryEffects } from "../gallery/gallery.cache";

/**
 * Başvuru sahibine kararı bildirir. `notifySafe` kullanılır: bildirim
 * gönderilemedi diye onay/red işlemi geri alınmaz — karar zaten DB'ye yazılmıştır.
 */
async function notifyApplicationDecision(
  result: DecideClubApplicationResult,
  decision: "approved" | "rejected"
) {
  const { application, club } = result;
  const approved = decision === "approved";

  await notificationsService.notifySafe(application.applicantId, {
    type: NotificationType.CLUB_APPLICATION_DECIDED,
    title: approved ? "Kulüp başvurunuz onaylandı" : "Kulüp başvurunuz reddedildi",
    body: approved
      ? `'${application.proposedName}' kulübü kuruldu ve başkanı oldunuz.`
      : `'${application.proposedName}' başvurunuz olumsuz sonuçlandı.`,
    data: { applicationId: application.id, status: decision, clubId: club?.id ?? null },
  });
}

export const adminService = {
  /**
   * Aktörün YÖNETİM bağlamında görebileceği üniversiteler.
   *   - Platform seviyesi rol (super_admin / platform_support) → hepsi.
   *   - Tenant kullanıcısı → yalnızca kendi üniversitesi.
   *   - Platform hesabı ama bypass rolü yok → hiçbiri.
   *
   * Yönetim paneli, public `GET /api/universities` (kayıt formu için global) yerine
   * bunu kullanmalıdır; aksi halde bir university_admin akademik yapı ekranında
   * başka üniversiteleri de görür.
   */
  async listAccessibleUniversities(actor: { universityId: string | null; isPlatformScoped: boolean }) {
    if (actor.isPlatformScoped) {
      return await adminRepository.findAllUniversities();
    }
    if (!actor.universityId) {
      return [];
    }
    const university = await adminRepository.findUniversityById(actor.universityId);
    return university ? [university] : [];
  },

  async listUsers(universityId: string, status?: "pending" | "active" | "suspended", roleName?: string) {
    const users = await adminRepository.findUsersByUniversity(universityId, status, roleName);
    return users.map(toSafeUser);
  },

  /**
   * Kullanıcıyı; rolleri, kulüp üyelikleri ve effective (etkin) yetkileriyle
   * birlikte döner. Kişisel yetki override'ları `permissionOverrides` altında.
   */
  async getUser(universityId: string, userId: string) {
    const user = await adminRepository.findUserInUniversityDetailed(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    const { roles, clubMemberships, userPermissions, ...rest } = user;
    const effective = await resolveAuthz(userId);
    return {
      ...toSafeUser(rest as unknown as User),
      roles,
      clubMemberships,
      permissionOverrides: userPermissions,
      effectivePermissions: effective.permissions,
    };
  },

  /** Kullanıcının effective (roller + kişisel override uygulanmış) yetkileri. */
  async getUserEffectivePermissions(universityId: string, userId: string) {
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    return await resolveAuthz(userId);
  },

  /**
   * Hedef bölümün gerçekten bu üniversiteye ait olduğunu doğrular
   * (departments.universityId denormalize edilmediği için faculty zincirinden kontrol edilir).
   */
  async updateUserDepartment(universityId: string, userId: string, data: UpdateUserDepartmentDTO) {
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }

    if (data.departmentId !== null) {
      const department = await adminRepository.findDepartmentWithUniversity(data.departmentId);
      if (!department || !department.faculty || department.faculty.universityId !== universityId) {
        throw badRequest("admin.departmentNotInUniversity");
      }
    }

    const updated = await adminRepository.updateUserDepartment(universityId, userId, data.departmentId);
    return toSafeUser(updated as User);
  },

  async listClubApplications(universityId: string, status?: "pending" | "approved" | "rejected") {
    const applications = await adminRepository.findClubApplicationsByUniversity(universityId, status);
    return applications.map((application) => ({
      ...application,
      applicant: application.applicant ? toSafeUser(application.applicant) : null,
    }));
  },

  /**
   * Onaylama akışında repository, başvuruyu gerçek bir kulübe dönüştürür
   * (bkz. admin.repository.decideClubApplication).
   */
  async approveClubApplication(universityId: string, applicationId: string, actorUserId: string, note?: string) {
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "approved", note ?? null);
    await notifyApplicationDecision(result, "approved");
    // Yeni onaylı kulüp public listeye girer.
    await clubEffects.clubApproved.emit(universityId);
    return result;
  },

  /**
   * Ret GEREKÇESİZ yapılamaz: öğrenci neyi düzelteceğini bilmeden yeniden
   * başvuramaz ve gerekçesiz bir ret denetlenebilir bir karar değildir.
   * Zorunluluk zod şemasında (rejectApplicationSchema) da var; burası servis
   * katmanının kendi sözleşmesi — repository'den doğrudan çağıran bir yol
   * açılırsa kural yine tutar.
   */
  async rejectClubApplication(universityId: string, applicationId: string, actorUserId: string, note: string) {
    if (!note?.trim()) {
      throw badRequest("admin.rejectionNoteRequired");
    }
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "rejected", note.trim());
    await notifyApplicationDecision(result, "rejected");
    return result;
  },

  async listClubs(universityId: string, status?: "pending" | "approved" | "rejected" | "archived") {
    return await adminRepository.findClubsByUniversity(universityId, status);
  },

  async updateClubStatus(universityId: string, clubId: string, data: UpdateClubStatusDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await adminRepository.updateClubStatus(universityId, clubId, data.status);
    // Durum onaylı<->diğer geçişi public listeye giriş/çıkışı belirler.
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await adminRepository.updateClub(universityId, clubId, data);
    await clubEffects.profileChanged.emit(universityId, clubId); // isim/logo listede + profilde
    return updated;
  },

  /**
   * Kulübü kalıcı olarak siler.
   * 1. Kulüp bu üniversiteye ait olmalı.
   * 2. Yalnızca "archived" veya "rejected" durumdaki kulüpler silinebilir —
   *    aktif (approved/pending) bir kulübü doğrudan silmek yerine önce arşivle.
   * 3. Bağlı içerik repository'de tek transaction'da temizlenir.
   */
  async deleteClub(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    if (club.status !== "archived" && club.status !== "rejected") {
      throw badRequest("admin.clubNotArchivedOrRejected");
    }
    await adminRepository.deleteClub(universityId, clubId);
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    // Silinen kulübün duyuru/galeri listeleri de düşsün (repo bunları da temizler).
    await announcementEffects.changed.emit(clubId);
    await galleryEffects.changed.emit(clubId);
    return { id: clubId };
  },

  async listAdvisors(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const advisors = await adminRepository.findAdvisorsByClub(clubId);
    return advisors
      .filter((a) => a.user)
      .map((a) => ({ ...a, user: toSafeUser(a.user!) }));
  },

  /**
   * Danışman ataması, sadece hedef kullanıcı AYNI üniversiteye aitse yapılabilir
   * (kendi öğretim üyesi olmayan biri bir kulübe danışman atanamaz).
   */
  async addAdvisor(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    // Danışman, öğrenci değil personel olmalı: sistemdeki "advisor" rolüne sahip
    // olması şartı (staff maili ile kaydolanlara bu rol otomatik atanır).
    const isAdvisorEligible = await adminRepository.userHasRole(userId, "advisor");
    if (!isAdvisorEligible) {
      throw badRequest("admin.advisorNotEligible");
    }
    const existing = await adminRepository.findAdvisor(clubId, userId);
    if (existing) {
      throw badRequest("admin.advisorAlreadyAssigned");
    }
    // universityId KULÜP kaydından okunur — bileşik FK (club_advisors) danışmanın
    // kulüple aynı tenant'ta olmasını DB seviyesinde zorunlu kılar.
    const result = await adminRepository.addAdvisor(clubId, userId, club.universityId);
    await clubEffects.detailChanged.emit(clubId); // danışmanlar profile gömülü
    return result;
  },

  async removeAdvisor(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const existing = await adminRepository.findAdvisor(clubId, userId);
    if (!existing) {
      throw badRequest("admin.advisorNotAssigned");
    }
    await adminRepository.removeAdvisor(clubId, userId);
    await clubEffects.detailChanged.emit(clubId);
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/design/06 §A6)
  // Her işlem önce kulübün bu üniversiteye ait olduğunu doğrular; içerik de
  // gerçekten o kulübe ait olmalı (çapraz-kulüp silme engellenir).
  // ═══════════════════════════════════════════════
  async listClubMembers(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const members = await adminRepository.findMembersByClub(clubId);
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  async removeClubMember(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const membership = await adminRepository.findClubMember(clubId, userId);
    if (!membership) {
      throw badRequest("admin.memberNotFound");
    }
    await adminRepository.removeClubMember(clubId, userId);
    await clubEffects.membershipChanged.emit(clubId); // üye listesi + profil (üye gömülü)
  },

  async moderateRemoveAnnouncement(universityId: string, clubId: string, announcementId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const announcement = await adminRepository.findAnnouncementInClub(clubId, announcementId);
    if (!announcement) {
      throw notFound("admin.announcementNotFound");
    }
    await adminRepository.deleteAnnouncement(announcementId);
    await announcementEffects.changed.emit(clubId);
  },

  async moderateRemoveGalleryImage(universityId: string, clubId: string, imageId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const image = await adminRepository.findGalleryImageInClub(clubId, imageId);
    if (!image) {
      throw notFound("admin.galleryImageNotFound");
    }
    await adminRepository.deleteGalleryImage(imageId);
    await galleryEffects.changed.emit(clubId);
  },
};
