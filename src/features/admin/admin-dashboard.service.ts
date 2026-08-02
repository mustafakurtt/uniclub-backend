import { adminDashboardRepository } from "./admin-dashboard.repository";

export const adminDashboardService = {
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
      return await adminDashboardRepository.findAllUniversities();
    }
    if (!actor.universityId) {
      return [];
    }
    const university = await adminDashboardRepository.findUniversityById(actor.universityId);
    return university ? [university] : [];
  },
};
