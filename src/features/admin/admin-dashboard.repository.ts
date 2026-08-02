import { db } from "../../db";

export const adminDashboardRepository = {
  /** Tüm üniversiteler — yalnızca platform seviyesi aktörler için (bkz. listAccessibleUniversities). */
  async findAllUniversities() {
    return await db.query.universities.findMany();
  },

  async findUniversityById(universityId: string) {
    return await db.query.universities.findFirst({ where: { id: universityId } });
  },
};
