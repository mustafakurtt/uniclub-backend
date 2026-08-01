import { describe, it, expect, mock, afterEach } from "bun:test";

describe("exports satır sınırı", () => {
  afterEach(() => {
    mock.restore();
  });

  it("EXPORT_MAX_ROWS aşımı → exports.rowLimitExceeded", async () => {
    const bigRows = Array.from({ length: 50001 }, (_, i) => ({
      name: `Kulüp ${i}`,
      slug: `kulup-${i}`,
      status: "approved",
      joinPolicy: "open",
      createdAt: "2020-01-01T00:00:00.000Z",
    }));

    mock.module("../../src/features/exports/exports.repository", () => ({
      exportsRepository: {
        findUniversity: async () => ({
          id: "uni-1",
          name: "Test Üniversitesi",
          slug: "test-uni",
          primaryColor: "#112233",
        }),
        fetchClubsRows: async () => bigRows,
        findClubInUniversity: async () => null,
        fetchClubMembersRows: async () => [],
        fetchActivitiesRows: async () => [],
      },
    }));

    const { exportsService } = await import("../../src/features/exports/exports.service");

    await expect(exportsService.generateReport("uni-1", "clubs", {})).rejects.toMatchObject({
      message: "exports.rowLimitExceeded",
    });
  });
});
