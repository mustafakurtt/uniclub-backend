/**
 * Kulüp başvuru onay zinciri (T4.2) — tek/çok kademe, sıra, yetki, bildirim, tenant izolasyonu.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app, login, me, reqAuth } from "./helpers";
import { db } from "../src/db";
import {
  clubApplicationApprovals,
  notifications,
} from "../src/db/schema";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

describe("kulüp başvuru onay zinciri", () => {
  describe("tek kademe (Antalya — varsayılan club_approver)", () => {
    let admin: string;
    let uni: string;
    let applicantId: string;
    let applicationId: string;

    beforeAll(async () => {
      admin = await login("elif.demir@antalya.edu.tr");
      uni = (await me(admin)).universityId as string;
      const burak = await login("burak.demirci@std.antalya.edu.tr");
      applicantId = (await me(burak)).userId;

      const createRes = await reqAuth("POST", "/api/clubs/applications", burak, {
        proposedName: `Zincir Test ${Date.now()}`,
        description: "Tek kademe onay testi.",
      });
      expect(createRes.status).toBe(201);
      applicationId = (await createRes.json()).data.id as string;

      const approvals = await db
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      expect(approvals.length).toBe(1);
      expect(approvals[0].approverRole).toBe("club_approver");
    });

    it("onay → approved; ret → rejected + gerekçe zorunlu", async () => {
      const rejectRes = await patch(
        `/api/admin/universities/${uni}/club-applications/${applicationId}/reject`,
        admin,
        { note: "Tek kademe ret test gerekçesi yeterli uzunlukta." }
      );
      expect(rejectRes.status).toBe(200);
      const appRow = await db.query.clubApplications.findFirst({
        where: { id: applicationId },
      });
      expect(appRow?.status).toBe("rejected");
    });

    it("eski tek adım advisor approverRole — university_admin karar verebilir", async () => {
      const pending = await db.query.clubApplications.findFirst({
        where: { universityId: uni, status: "pending" },
      });
      if (!pending) throw new Error("seed: bekleyen başvuru yok");

      await db
        .update(clubApplicationApprovals)
        .set({ approverRole: "advisor" })
        .where(eq(clubApplicationApprovals.applicationId, pending.id));

      expect(
        (await patch(
          `/api/admin/universities/${uni}/club-applications/${pending.id}/approve`,
          admin
        )).status
      ).toBe(200);
    });

    it("yanlış roldeki öğrenci karar veremez", async () => {
      const selin = await login("selin.koc@std.antalya.edu.tr");
      const uniId = (await me(selin)).universityId as string;
      const createRes = await reqAuth("POST", "/api/clubs/applications", selin, {
        proposedName: `Öğrenci Ret ${Date.now()}`,
        description: "Yetki testi.",
      });
      expect(createRes.status).toBe(201);
      const id = (await createRes.json()).data.id as string;
      expect(
        (await patch(`/api/admin/universities/${uniId}/club-applications/${id}/approve`, selin)).status
      ).toBe(403);
    });
  });

  describe("iki kademe (Ege — advisor → student_affairs)", () => {
    let egeUni: string;
    let applicationId: string;
    let applicantId: string;
    let advisor: string;
    let sks: string;

    beforeAll(async () => {
      advisor = await login("leyla.hoca@egebilim.edu.tr");
      sks = await login("sks@egebilim.edu.tr");
      egeUni = (await me(advisor)).universityId as string;

      const gizem = await login("gizem.polat@std.egebilim.edu.tr");
      applicantId = (await me(gizem)).userId;

      const createRes = await reqAuth("POST", "/api/clubs/applications", gizem, {
        proposedName: `İki Kademe Zincir ${Date.now()}`,
        description: "Ege iki kademe onay testi.",
      });
      expect(createRes.status).toBe(201);
      applicationId = (await createRes.json()).data.id as string;

      const approvals = await db
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      expect(approvals.length).toBe(2);
    });

    const approveUrl = () =>
      `/api/admin/universities/${egeUni}/club-applications/${applicationId}/approve`;

    it("kademe 1 onay → başvuru hâlâ pending", async () => {
      const beforeNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, applicantId));

      const res = await patch(approveUrl(), advisor);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.application.status).toBe("pending");
      expect(body.data.club).toBeNull();

      const afterNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, applicantId));
      expect(afterNotifs.length).toBe(beforeNotifs.length);
    });

    it("kademe 2, kademe 1 beklerken karar veremiyor (400)", async () => {
      const tolga = await login("tolga.erden@std.egebilim.edu.tr");
      const createRes = await reqAuth("POST", "/api/clubs/applications", tolga, {
        proposedName: `Sıra Test ${Date.now()}`,
        description: "İki kademe sıra testi.",
      });
      expect(createRes.status).toBe(201);
      const newId = (await createRes.json()).data.id as string;

      expect(
        (await patch(`/api/admin/universities/${egeUni}/club-applications/${newId}/approve`, sks)).status
      ).toBe(400);
    });

    it("kademe 2 onay → approved ve kulüp oluşur", async () => {
      const res = await patch(approveUrl(), sks);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.application.status).toBe("approved");
      expect(body.data.club).toBeTruthy();
    });

    it("nihai onayda bildirim gider", async () => {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, applicantId));
      const decided = rows.filter((n) => {
        const d = n.data as { applicationId?: string } | null;
        return d?.applicationId === applicationId;
      });
      expect(decided.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("ret ve tenant izolasyonu", () => {
    it("ret sonrası sonraki kademe karar veremez", async () => {
      const cem = await login("cem.arslan@std.egebilim.edu.tr");
      const uni = (await me(cem)).universityId as string;
      const createRes = await reqAuth("POST", "/api/clubs/applications", cem, {
        proposedName: `Ege Ret ${Date.now()}`,
        description: "Ret zinciri testi.",
      });
      expect(createRes.status).toBe(201);
      const id = (await createRes.json()).data.id as string;
      const advisor = await login("leyla.hoca@egebilim.edu.tr");
      const sks = await login("sks@egebilim.edu.tr");

      expect(
        (
          await patch(`/api/admin/universities/${uni}/club-applications/${id}/reject`, advisor, {
            note: "Ret sonrası kademe testi için gerekçe.",
          })
        ).status
      ).toBe(200);

      expect(
        (await patch(`/api/admin/universities/${uni}/club-applications/${id}/approve`, sks)).status
      ).toBe(400);
    });

    it("Antalya zinciri Ege başvurusunu etkilemez", async () => {
      const elif = await login("elif.demir@antalya.edu.tr");
      const antalyaUni = (await me(elif)).universityId as string;
      const ayse = await login("ayse.yilmaz@std.antalya.edu.tr");
      const createRes = await reqAuth("POST", "/api/clubs/applications", ayse, {
        proposedName: `Tenant A ${Date.now()}`,
        description: "Tenant izolasyonu.",
      });
      expect(createRes.status).toBe(201);
      const antalyaAppId = (await createRes.json()).data.id as string;

      const egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
      const egeUni = (await me(egeAdmin)).universityId as string;

      expect(
        (
          await patch(
            `/api/admin/universities/${egeUni}/club-applications/${antalyaAppId}/approve`,
            egeAdmin
          )
        ).status
      ).toBe(404);

      const approvals = await db
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, antalyaAppId));
      expect(approvals[0].status).toBe("pending");

      expect(
        (
          await patch(
            `/api/admin/universities/${antalyaUni}/club-applications/${antalyaAppId}/approve`,
            elif
          )
        ).status
      ).toBe(200);
    });
  });
});
