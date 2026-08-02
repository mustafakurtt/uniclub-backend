import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { clubApplicationDocuments } from "../../db/schema";

class ClubApplicationDocumentsRepository {
  listByApplication(applicationId: string) {
    return db.query.clubApplicationDocuments.findMany({
      where: { applicationId },
      with: { media: true, uploader: true },
      orderBy: { documentTypeKey: "asc" },
    });
  }

  findByApplicationAndType(applicationId: string, documentTypeKey: string) {
    return db.query.clubApplicationDocuments.findFirst({
      where: { applicationId, documentTypeKey },
      with: { media: true, uploader: true },
    });
  }

  async upsertDocument(
    universityId: string,
    applicationId: string,
    documentTypeKey: string,
    mediaId: string,
    uploadedBy: string
  ) {
    const now = new Date();
    const [row] = await db
      .insert(clubApplicationDocuments)
      .values({
        applicationId,
        universityId,
        documentTypeKey,
        mediaId,
        uploadedBy,
      })
      .onConflictDoUpdate({
        target: [clubApplicationDocuments.applicationId, clubApplicationDocuments.documentTypeKey],
        set: {
          mediaId,
          uploadedBy,
          updatedAt: now,
        },
      })
      .returning();

    return db.query.clubApplicationDocuments.findFirst({
      where: { id: row.id },
      with: { media: true, uploader: true },
    });
  }

  async deleteDocument(applicationId: string, documentTypeKey: string) {
    const [row] = await db
      .delete(clubApplicationDocuments)
      .where(
        and(
          eq(clubApplicationDocuments.applicationId, applicationId),
          eq(clubApplicationDocuments.documentTypeKey, documentTypeKey)
        )
      )
      .returning();
    return row ?? null;
  }
}

export const clubApplicationDocumentsRepository = new ClubApplicationDocumentsRepository();
