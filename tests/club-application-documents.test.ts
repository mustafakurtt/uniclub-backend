/**
 * Kulüp başvurusu belge akışı (T1.1 / M3.5).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { login, me, reqAuth, data, get } from "./helpers";
import { app } from "./helpers";
import { db } from "../src/db";
import { clubApplications, tenantSettings } from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { invalidateTenantSettingsCache } from "../src/features/tenant-settings/tenant-settings.cache";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
  useClubApproverChainForTests,
} from "./tenant-test-helpers";

const PNG_BYTES = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0)
);

function uploadForm(bytes: Uint8Array, purpose = "application_document") {
  const fd = new FormData();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  fd.append("file", new Blob([buf], { type: "image/png" }), "scan.png");
  fd.append("purpose", purpose);
  return fd;
}

const post = (path: string, token: string, body?: unknown) => reqAuth("POST", path, token, body);
const patch = (path: string, token: string, body?: unknown) => reqAuth("PATCH", path, token, body);
const put = (path: string, token: string, body?: unknown) => reqAuth("PUT", path, token, body);

async function setTenantDocumentsCatalog(
  universityId: string,
  actorUserId: string,
  catalog: { key: string; label: string; required: boolean }[]
) {
  await db
    .insert(tenantSettings)
    .values({
      universityId,
      key: TenantSettingKey.CLUB_APPLICATION_REQUIRED_DOCUMENTS,
      value: catalog,
      updatedBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: [tenantSettings.universityId, tenantSettings.key],
      set: { value: catalog, updatedBy: actorUserId, updatedAt: new Date() },
    });
  invalidateTenantSettingsCache(universityId);
}

async function setDocumentSubmissionLock(
  universityId: string,
  actorUserId: string,
  enabled: boolean
) {
  await db
    .insert(tenantSettings)
    .values({
      universityId,
      key: TenantSettingKey.CLUB_APPLICATION_REQUIRE_DOCUMENTS_FOR_SUBMISSION,
      value: enabled,
      updatedBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: [tenantSettings.universityId, tenantSettings.key],
      set: { value: enabled, updatedBy: actorUserId, updatedAt: new Date() },
    });
  invalidateTenantSettingsCache(universityId);
}

async function uploadApplicationDocument(token: string) {
  const res = await app.request("/api/uploads", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: uploadForm(PNG_BYTES),
  });
  expect(res.status).toBe(201);
  const json = await res.json();
  return json.data.id as string;
}

describe("kulüp başvuru belgeleri", () => {
  let antalyaUni: string;
  let adminToken: string;
  let adminUserId: string;
  let sksToken: string;

  const antalyaCatalog = [
    { key: "bylaws", label: "Tüzük", required: true },
    { key: "member_list", label: "Üye listesi", required: true },
    { key: "advisor_consent", label: "Danışman muvafakatnamesi", required: false },
  ];

  beforeAll(async () => {
    sksToken = await login("sks@antalya.edu.tr");
    adminToken = await login("elif.demir@antalya.edu.tr");
    antalyaUni = (await me(sksToken)).universityId as string;
    adminUserId = (await me(adminToken)).userId as string;
    await setTenantFormationThreshold(antalyaUni, 0, adminUserId);
    await useClubApproverChainForTests(antalyaUni, adminUserId);
    await setTenantDocumentsCatalog(antalyaUni, adminUserId, antalyaCatalog);
    await setDocumentSubmissionLock(antalyaUni, adminUserId, false);
  });

  afterAll(async () => {
    await db
      .delete(tenantSettings)
      .where(
        and(
          eq(tenantSettings.universityId, antalyaUni),
          eq(tenantSettings.key, TenantSettingKey.CLUB_APPLICATION_REQUIRED_DOCUMENTS)
        )
      );
    await db
      .delete(tenantSettings)
      .where(
        and(
          eq(tenantSettings.universityId, antalyaUni),
          eq(tenantSettings.key, TenantSettingKey.CLUB_APPLICATION_REQUIRE_DOCUMENTS_FOR_SUBMISSION)
        )
      );
    invalidateTenantSettingsCache(antalyaUni);
    await restoreAntalyaSeedFormationThreshold(antalyaUni, adminUserId);
    await restoreAntalyaSeedApprovalChain(antalyaUni, adminUserId);
  });

  async function clearActiveApplications(applicantToken: string, applicantId: string) {
    const active = await db.query.clubApplications.findMany({
      where: {
        applicantId,
        status: { in: ["pending", "revision_requested"] },
      },
    });
    for (const app of active) {
      if (app.status === "revision_requested") {
        await patch(`/api/clubs/applications/${app.id}/resubmit`, applicantToken, {
          proposedName: `Temizlik ${Date.now()}`,
          description: "Test.",
        });
      }
      await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, applicantToken);
    }
  }

  it("belge yükleme → başvuru detayında görünüyor", async () => {
    const applicantToken = await login("demo.yk1@std.antalya.edu.tr");
    const applicantId = (await me(applicantToken)).userId as string;
    await clearActiveApplications(applicantToken, applicantId);

    const mediaId = await uploadApplicationDocument(applicantToken);
    const createRes = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Belge Test ${Date.now()}`,
      description: "Belge akışı.",
      documents: [{ documentTypeKey: "bylaws", mediaId }],
    });
    expect(createRes.status).toBe(201);
    const applicationId = (await createRes.json()).data.id as string;

    const detail = await data(
      await get(`/api/clubs/applications/${applicationId}`, applicantToken)
    );
    const bylaws = detail.documents.items.find((i: { documentTypeKey: string }) => i.documentTypeKey === "bylaws");
    expect(bylaws?.downloadUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(bylaws?.fileName).toBe("Tüzük.png");
    expect(bylaws?.uploadedAt).toBeTruthy();
    expect(JSON.stringify(detail)).not.toContain("storage_key");

    const adminDetail = await data(
      await get(`/api/admin/universities/${antalyaUni}/club-applications/${applicationId}`, sksToken)
    );
    expect(adminDetail.documents.items.some((i: { documentTypeKey: string }) => i.documentTypeKey === "bylaws")).toBe(
      true
    );

    await clearActiveApplications(applicantToken, applicantId);
  });

  it("başkasının başvurusuna belge eklenemiyor (403)", async () => {
    const ownerToken = await login("demo.yk1@std.antalya.edu.tr");
    const otherToken = await login("emre.aksoy@std.antalya.edu.tr");
    const ownerId = (await me(ownerToken)).userId as string;
    await clearActiveApplications(ownerToken, ownerId);

    const createRes = await post("/api/clubs/applications", ownerToken, {
      proposedName: `Gizlilik ${Date.now()}`,
      description: "403 testi.",
    });
    const applicationId = (await createRes.json()).data.id as string;
    const mediaId = await uploadApplicationDocument(otherToken);

    const res = await put(
      `/api/clubs/applications/${applicationId}/documents/bylaws`,
      otherToken,
      { mediaId }
    );
    expect(res.status).toBe(403);

    await clearActiveApplications(ownerToken, ownerId);
  });

  it("kilit kapalı → eksik belgeyle gönderim geçer", async () => {
    const applicantToken = await login("mustafa.kurt@std.antalya.edu.tr");
    const applicantId = (await me(applicantToken)).userId as string;
    await clearActiveApplications(applicantToken, applicantId);
    await setDocumentSubmissionLock(antalyaUni, adminUserId, false);

    const res = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Gevşek ${Date.now()}`,
      description: "Kilit kapalı.",
    });
    expect(res.status).toBe(201);

    await clearActiveApplications(applicantToken, applicantId);
  });

  it("kilit açık → eksik belgeyle gönderim 400", async () => {
    const applicantToken = await login("emre.aksoy@std.antalya.edu.tr");
    const applicantId = (await me(applicantToken)).userId as string;
    await clearActiveApplications(applicantToken, applicantId);
    await setDocumentSubmissionLock(antalyaUni, adminUserId, true);

    const res = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Katı ${Date.now()}`,
      description: "Kilit açık.",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("Zorunlu belgeler");

    await setDocumentSubmissionLock(antalyaUni, adminUserId, false);
    await clearActiveApplications(applicantToken, applicantId);
  });

  it("revizyon sonrası belge değiştirme çalışıyor", async () => {
    const applicantToken = await login("demo.yk1@std.antalya.edu.tr");
    const applicantId = (await me(applicantToken)).userId as string;
    await clearActiveApplications(applicantToken, applicantId);

    const createRes = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Revizyon Belge ${Date.now()}`,
      description: "Revizyon belge testi.",
    });
    const applicationId = (await createRes.json()).data.id as string;

    const revisionRes = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/request-revision`,
      sksToken,
      { note: "Tüzük taranmış hâli net değil, yeniden yükleyin." }
    );
    expect(revisionRes.status).toBe(200);

    const newMediaId = await uploadApplicationDocument(applicantToken);
    const upsertRes = await put(
      `/api/clubs/applications/${applicationId}/documents/bylaws`,
      applicantToken,
      { mediaId: newMediaId }
    );
    expect(upsertRes.status).toBe(200);

    const resubmitRes = await patch(`/api/clubs/applications/${applicationId}/resubmit`, applicantToken, {
      proposedName: `Revizyon Belge Güncel ${Date.now()}`,
      description: "Belge güncellendi.",
    });
    expect(resubmitRes.status).toBe(200);

    const detail = await data(await get(`/api/clubs/applications/${applicationId}`, applicantToken));
    expect(detail.documents.items.find((i: { documentTypeKey: string }) => i.documentTypeKey === "bylaws")?.downloadUrl).toBeTruthy();

    await clearActiveApplications(applicantToken, applicantId);
  });

  it("çapraz tenant → 404", async () => {
    const antalyaToken = await login("demo.yk1@std.antalya.edu.tr");
    const egeToken = await login("gizem.polat@std.egebilim.edu.tr");
    const antalyaId = (await me(antalyaToken)).userId as string;
    await clearActiveApplications(antalyaToken, antalyaId);

    const createRes = await post("/api/clubs/applications", antalyaToken, {
      proposedName: `Tenant ${Date.now()}`,
      description: "Tenant test.",
    });
    const applicationId = (await createRes.json()).data.id as string;
    const mediaId = await uploadApplicationDocument(egeToken);

    const res = await put(
      `/api/clubs/applications/${applicationId}/documents/bylaws`,
      egeToken,
      { mediaId }
    );
    expect(res.status).toBe(404);

    await clearActiveApplications(antalyaToken, antalyaId);
  });

  it("zorunlu belge listesi tenant'a göre farklı", async () => {
    const egeCatalog = [{ key: "founder_form", label: "Kurucu formu", required: true }];
    const egeToken = await login("okan.yildiz@egebilim.edu.tr");
    const egeUni = (await me(egeToken)).universityId as string;
    await setTenantDocumentsCatalog(egeUni, adminUserId, egeCatalog);

    const settings = await data(await get(`/api/universities/${egeUni}/settings`, egeToken));
    expect(settings[TenantSettingKey.CLUB_APPLICATION_REQUIRED_DOCUMENTS].value).toEqual(egeCatalog);

    await setTenantDocumentsCatalog(antalyaUni, adminUserId, antalyaCatalog);
    const antalyaSettings = await data(await get(`/api/universities/${antalyaUni}/settings`, adminToken));
    expect(antalyaSettings[TenantSettingKey.CLUB_APPLICATION_REQUIRED_DOCUMENTS].value).toEqual(antalyaCatalog);
  });
});
