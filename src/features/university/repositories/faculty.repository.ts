import { db } from "../../../db";
import { faculties } from "../../../db/schema";
import { BaseRepository } from "../../../core/db/base.repository";

/**
 * Fakülte veri erişimi. Silme YUMUŞAKTIR (deletedAt); okuma metodları silinmişi
 * hariç tutar. İlişkisel sorgular `this.query` (db.query.faculties) ile.
 */
class FacultyRepository extends BaseRepository<typeof faculties, typeof db.query.faculties> {
  constructor() {
    super(db, faculties, { softDelete: true, query: db.query.faculties });
  }

  listByUniversity(universityId: string) {
    return this.query!.findMany({ where: { universityId, deletedAt: { isNull: true } } });
  }

  findInUniversity(universityId: string, facultyId: string) {
    return this.query!.findFirst({ where: { id: facultyId, universityId, deletedAt: { isNull: true } } });
  }

  /** Bu üniversitenin CANLI fakültesi var mı? (üniversite silme guard'ı) */
  async existsByUniversity(universityId: string): Promise<boolean> {
    const row = await this.query!.findFirst({
      where: { universityId, deletedAt: { isNull: true } },
      columns: { id: true },
    });
    return !!row;
  }
}

export const facultyRepository = new FacultyRepository();
