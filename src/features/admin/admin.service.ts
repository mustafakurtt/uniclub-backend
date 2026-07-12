import { adminRepository } from "./admin.repository";
import { UpdateClubStatusDTO, UpdateClubDTO, UpdateUserDepartmentDTO } from "./admin.schema";
import { DecideClubApplicationResult, User } from "./admin.types";
import { toSafeUser } from "../../shared/utils/user.util";
import { getEffectivePermissions } from "../../shared/rbac/rbac.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";

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
      throw new Error("Kullanıcı bulunamadı.");
    }
    const { roles, clubMemberships, userPermissions, ...rest } = user;
    const effective = await getEffectivePermissions(userId);
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
      throw new Error("Kullanıcı bulunamadı.");
    }
    return await getEffectivePermissions(userId);
  },

  /**
   * Hedef bölümün gerçekten bu üniversiteye ait olduğunu doğrular
   * (departments.universityId denormalize edilmediği için faculty zincirinden kontrol edilir).
   */
  async updateUserDepartment(universityId: string, userId: string, data: UpdateUserDepartmentDTO) {
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw new Error("Kullanıcı bulunamadı.");
    }

    if (data.departmentId !== null) {
      const department = await adminRepository.findDepartmentWithUniversity(data.departmentId);
      if (!department || !department.faculty || department.faculty.universityId !== universityId) {
        throw new Error("Bölüm bu üniversiteye ait değil.");
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
  async approveClubApplication(universityId: string, applicationId: string, actorUserId: string) {
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "approved");
    await notifyApplicationDecision(result, "approved");
    return result;
  },

  async rejectClubApplication(universityId: string, applicationId: string, actorUserId: string) {
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "rejected");
    await notifyApplicationDecision(result, "rejected");
    return result;
  },

  async listClubs(universityId: string, status?: "pending" | "approved" | "rejected" | "archived") {
    return await adminRepository.findClubsByUniversity(universityId, status);
  },

  async updateClubStatus(universityId: string, clubId: string, data: UpdateClubStatusDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const updated = await adminRepository.updateClubStatus(universityId, clubId, data.status);
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    return await adminRepository.updateClub(universityId, clubId, data);
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
      throw new Error("Kulüp bulunamadı.");
    }
    if (club.status !== "archived" && club.status !== "rejected") {
      throw new Error("Yalnızca arşivlenmiş veya reddedilmiş kulüpler silinebilir. Önce kulübü arşivleyin.");
    }
    await adminRepository.deleteClub(universityId, clubId);
    return { id: clubId };
  },

  async listAdvisors(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
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
      throw new Error("Kulüp bulunamadı.");
    }
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw new Error("Kullanıcı bulunamadı.");
    }
    // Danışman, öğrenci değil personel olmalı: sistemdeki "advisor" rolüne sahip
    // olması şartı (staff maili ile kaydolanlara bu rol otomatik atanır).
    const isAdvisorEligible = await adminRepository.userHasRole(userId, "advisor");
    if (!isAdvisorEligible) {
      throw new Error("Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir.");
    }
    const existing = await adminRepository.findAdvisor(clubId, userId);
    if (existing) {
      throw new Error("Bu kullanıcı zaten kulübün danışmanı.");
    }
    return await adminRepository.addAdvisor(clubId, userId);
  },

  async removeAdvisor(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const existing = await adminRepository.findAdvisor(clubId, userId);
    if (!existing) {
      throw new Error("Bu kullanıcı kulübün danışmanı değil.");
    }
    await adminRepository.removeAdvisor(clubId, userId);
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/yonetim/06 §A6)
  // Her işlem önce kulübün bu üniversiteye ait olduğunu doğrular; içerik de
  // gerçekten o kulübe ait olmalı (çapraz-kulüp silme engellenir).
  // ═══════════════════════════════════════════════
  async listClubMembers(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const members = await adminRepository.findMembersByClub(clubId);
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  async removeClubMember(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const membership = await adminRepository.findClubMember(clubId, userId);
    if (!membership) {
      throw new Error("Bu kullanıcı kulübün üyesi değil.");
    }
    await adminRepository.removeClubMember(clubId, userId);
  },

  async moderateRemoveAnnouncement(universityId: string, clubId: string, announcementId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const announcement = await adminRepository.findAnnouncementInClub(clubId, announcementId);
    if (!announcement) {
      throw new Error("Duyuru bulunamadı.");
    }
    await adminRepository.deleteAnnouncement(announcementId);
  },

  async moderateRemoveGalleryImage(universityId: string, clubId: string, imageId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw new Error("Kulüp bulunamadı.");
    }
    const image = await adminRepository.findGalleryImageInClub(clubId, imageId);
    if (!image) {
      throw new Error("Görsel bulunamadı.");
    }
    await adminRepository.deleteGalleryImage(imageId);
  },
};
