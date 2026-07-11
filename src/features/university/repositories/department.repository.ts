import { eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { departments, users } from "../../../db/schema";
import { BaseRepository } from "../../../core/db/base.repository";

/**
 * Bölüm veri erişimi. Silme YUMUŞAKTIR (deletedAt); okuma metodları silinmişi
 * hariç tutar. İlişkisel sorgular `this.query` (db.query.departments) ile.
 */
class DepartmentRepository extends BaseRepository<typeof departments, typeof db.query.departments> {
  constructor() {
    super(db, departments, { softDelete: true, query: db.query.departments });
  }

  listByFaculty(facultyId: string) {
    return this.query!.findMany({ where: { facultyId, deletedAt: { isNull: true } } });
  }

  findInFaculty(facultyId: string, departmentId: string) {
    return this.query!.findFirst({ where: { id: departmentId, facultyId, deletedAt: { isNull: true } } });
  }

  /** Bu fakültenin CANLI bölümü var mı? (fakülte silme guard'ı) */
  async existsByFaculty(facultyId: string): Promise<boolean> {
    const row = await this.query!.findFirst({
      where: { facultyId, deletedAt: { isNull: true } },
      columns: { id: true },
    });
    return !!row;
  }

  /** Bu bölüme atanmış kullanıcı var mı? (bölüm silme guard'ı — users soft-delete taşımaz) */
  async hasUsers(departmentId: string): Promise<boolean> {
    const rows = await db
      .select({ one: sql<number>`1` })
      .from(users)
      .where(eq(users.departmentId, departmentId))
      .limit(1);
    return rows.length > 0;
  }
}

export const departmentRepository = new DepartmentRepository();
