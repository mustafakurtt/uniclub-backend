import { describe, it, expect, beforeAll } from "bun:test";
import { data, get, login, me, reqAuth, app } from "./helpers";
import { SEED_PASSWORD } from "./config";
import { db } from "../src/db";
import { eq } from "drizzle-orm";
import { universities } from "../src/db/schema";
import { emailQueue } from "../src/features/auth/auth.queue";

describe("platform operasyonları (/api/platform)", () => {
  let superAdmin: string;
  let platformSupport: string;
  let tenantAdmin: string;
  let student: string;
  let antalyaUni: string;
  let joinableClubId: string;

  beforeAll(async () => {
    superAdmin = await login("superadmin@platform.local");
    platformSupport = await login("destek@platform.local");
    tenantAdmin = await login("elif.demir@antalya.edu.tr");
    student = await login("mustafa.kurt@std.antalya.edu.tr");
    antalyaUni = (await me(tenantAdmin)).universityId as string;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", student));
    const music = clubs.find((c) => c.slug === "muzik");
    expect(music).toBeDefined();
    joinableClubId = music!.id;
  });

  it("super_admin tenant listesini stats ile alır", async () => {
    const res = await get("/api/platform/tenants", superAdmin);
    expect(res.status).toBe(200);

    const tenants = await data<Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      domainCount: number;
      userCount: number;
      clubCount: number;
      pendingApplications: number;
    }>>(res);

    expect(tenants.length).toBeGreaterThanOrEqual(3);
    const antalya = tenants.find((t) => t.slug === "antalya-bilim");
    expect(antalya).toBeDefined();
    expect(antalya!.status).toBe("active");
    expect(antalya!.userCount).toBeGreaterThan(0);
    expect(antalya!.clubCount).toBeGreaterThan(0);
    expect(antalya!.domainCount).toBeGreaterThan(0);
  });

  it("platform_support listeyi görür ama durum değiştiremez", async () => {
    const listRes = await get("/api/platform/tenants", platformSupport);
    expect(listRes.status).toBe(200);

    const patchRes = await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      platformSupport,
      { status: "suspended", reason: "Destek yazamaz testi" }
    );
    expect(patchRes.status).toBe(403);
  });

  it("tenant personeli platform API'sine erişemez", async () => {
    const res = await get("/api/platform/tenants", tenantAdmin);
    expect(res.status).toBe(403);
  });

  it("tenant askıya alındığında öğrenci self-service rotaları 403 döner", async () => {
    const suspendRes = await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      superAdmin,
      { status: "suspended", reason: "Platform test askısı" }
    );
    expect(suspendRes.status).toBe(200);
    expect((await suspendRes.json()).data.status).toBe("suspended");

    const listBlocked = await get("/api/clubs", student);
    expect(listBlocked.status).toBe(403);

    const joinBlocked = await reqAuth("POST", `/api/clubs/${joinableClubId}/join`, student);
    expect(joinBlocked.status).toBe(403);

    const reactivateRes = await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      superAdmin,
      { status: "active", reason: "Platform test askısı kaldırıldı" }
    );
    expect(reactivateRes.status).toBe(200);
    expect((await reactivateRes.json()).data.status).toBe("active");

    expect((await get("/api/clubs", student)).status).toBe(200);
  });

  it("suspended tenant doğrudan trial'a geçemez", async () => {
    await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      superAdmin,
      { status: "suspended", reason: "Geçiş kuralı testi" }
    );

    const invalid = await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      superAdmin,
      { status: "trial", reason: "Geçersiz geçiş" }
    );
    expect(invalid.status).toBe(400);

    await reqAuth(
      "PATCH",
      `/api/platform/tenants/${antalyaUni}/status`,
      superAdmin,
      { status: "active", reason: "Geçiş kuralı testi temizliği" }
    );
  });

  it("soft-delete edilmiş tenant için login ve kayıt reddedilir", async () => {
    const ege = await db.query.universities.findFirst({ where: { slug: "ege-bilim" } });
    expect(ege).toBeDefined();

    const deletedAt = new Date();
    await db.update(universities).set({ deletedAt }).where(eq(universities.id, ege!.id));

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "cem.yildiz@std.ege.edu.tr",
        password: SEED_PASSWORD,
      }),
    });
    expect(loginRes.status).toBe(401);

    const registerRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Silinen",
        lastName: "Tenant",
        email: `silinen.${Date.now()}@std.ege.edu.tr`,
        password: SEED_PASSWORD,
      }),
    });
    expect(registerRes.status).toBe(400);

    await db.update(universities).set({ deletedAt: null }).where(eq(universities.id, ege!.id));
  });

  it("super_admin tenant onboard + invite-admin akışını tamamlar", async () => {
    const slug = `onboard-test-${Date.now()}`;
    const staffDomain = `staff.${slug}.edu.tr`;
    const studentDomain = `std.${slug}.edu.tr`;
    const adminEmail = `yonetici@${staffDomain}`;

    const onboardRes = await reqAuth("POST", "/api/platform/tenants/onboard", superAdmin, {
      name: "Onboard Test Üniversitesi",
      slug,
      status: "trial",
      domains: [
        { domain: studentDomain, domainType: "student" },
        { domain: staffDomain, domainType: "staff" },
      ],
      faculties: [
        {
          name: "Mühendislik Fakültesi",
          departments: ["Bilgisayar Mühendisliği"],
        },
      ],
      initialAdmin: {
        firstName: "Test",
        lastName: "Yönetici",
        email: adminEmail,
        password: "OnboardAdmin123!",
      },
    });
    expect(onboardRes.status).toBe(201);

    const onboarded = await data<{
      university: { id: string; slug: string; status: string };
      domains: Array<{ domain: string }>;
      faculties: Array<{ name: string; departments: Array<{ name: string }> }>;
      initialAdmin: { id: string; email: string; status: string };
    }>(onboardRes);

    expect(onboarded.university.slug).toBe(slug);
    expect(onboarded.university.status).toBe("trial");
    expect(onboarded.domains.length).toBe(2);
    expect(onboarded.faculties[0].departments[0].name).toBe("Bilgisayar Mühendisliği");
    expect(onboarded.initialAdmin.email).toBe(adminEmail);
    expect(onboarded.initialAdmin.status).toBe("active");

    const adminToken = await login(adminEmail, "OnboardAdmin123!");
    const adminMe = await me(adminToken);
    expect(adminMe.universityId).toBe(onboarded.university.id);

    const permsRes = await get("/api/users/me/permissions", adminToken);
    const perms = await data<{ roles: string[] }>(permsRes);
    expect(perms.roles).toContain("university_admin");

    const inviteEmail = `ikinci.yonetici@${staffDomain}`;
    const inviteRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${onboarded.university.id}/invite-admin`,
      superAdmin,
      {
        firstName: "İkinci",
        lastName: "Yönetici",
        email: inviteEmail,
        password: "InviteAdmin123!",
      }
    );
    expect(inviteRes.status).toBe(201);
    expect((await inviteRes.json()).data.email).toBe(inviteEmail);

    const invitedToken = await login(inviteEmail, "InviteAdmin123!");
    expect((await me(invitedToken)).universityId).toBe(onboarded.university.id);
  });

  it("onboard çakışan e-posta ile başarısız olursa rollback olur ve doğrulama maili kuyruğa girmez", async () => {
    const countsBefore = await emailQueue.getJobCounts();
    const slug = `rollback-onboard-${Date.now()}`;
    const staffDomain = `staff.${slug}.edu.tr`;

    const res = await reqAuth("POST", "/api/platform/tenants/onboard", superAdmin, {
      name: "Rollback Tenant",
      slug,
      status: "trial",
      domains: [
        { domain: `std.${slug}.edu.tr`, domainType: "student" },
        { domain: staffDomain, domainType: "staff" },
      ],
      faculties: [
        {
          name: "Test Fakülte",
          departments: ["Test Bölüm"],
        },
      ],
      initialAdmin: {
        firstName: "Dup",
        lastName: "Admin",
        email: "superadmin@platform.local",
        password: "OnboardAdmin123!",
      },
    });
    expect(res.status).toBe(400);

    const uni = await db.query.universities.findFirst({ where: { slug } });
    expect(uni).toBeUndefined();

    const domainRow = await db.query.universityDomains.findFirst({
      where: { domain: staffDomain },
    });
    expect(domainRow).toBeUndefined();

    const countsAfter = await emailQueue.getJobCounts();
    expect(countsAfter.waiting).toBe(countsBefore.waiting);
    expect(countsAfter.active).toBe(countsBefore.active);
    expect(countsAfter.delayed).toBe(countsBefore.delayed);
  });

  it("platform_support onboard ve invite-admin yapamaz", async () => {
    const onboardRes = await reqAuth("POST", "/api/platform/tenants/onboard", platformSupport, {
      name: "Destek Denemesi",
      slug: `support-deny-${Date.now()}`,
      domains: [{ domain: `x.${Date.now()}.edu.tr`, domainType: "staff" }],
    });
    expect(onboardRes.status).toBe(403);

    const inviteRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${antalyaUni}/invite-admin`,
      platformSupport,
      {
        firstName: "X",
        lastName: "Y",
        email: `x.${Date.now()}@antalya.edu.tr`,
        password: "Password123!",
      }
    );
    expect(inviteRes.status).toBe(403);
  });

  it("invite-admin staff domain dışı e-postayı reddeder", async () => {
    const res = await reqAuth(
      "POST",
      `/api/platform/tenants/${antalyaUni}/invite-admin`,
      superAdmin,
      {
        firstName: "Yanlış",
        lastName: "Domain",
        email: `yanlis@${Date.now()}.com`,
        password: "Password123!",
      }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("staff");
  });

  it("super_admin platform hesaplarını listeler ve yeni destek hesabı oluşturur", async () => {
    const listRes = await get("/api/platform/users", superAdmin);
    expect(listRes.status).toBe(200);

    const users = await data<Array<{ email: string; roles: string[] }>>(listRes);
    expect(users.some((u) => u.email === "superadmin@platform.local")).toBe(true);
    expect(users.some((u) => u.email === "destek@platform.local")).toBe(true);

    const email = `ops.${Date.now()}@platform.local`;
    const createRes = await reqAuth("POST", "/api/platform/users", superAdmin, {
      firstName: "Ops",
      lastName: "Görevlisi",
      email,
      password: "OpsAccount123!",
      role: "platform_support",
    });
    expect(createRes.status).toBe(201);
    const created = await data<{ email: string; roles: string[] }>(createRes);
    expect(created.email).toBe(email);
    expect(created.roles).toContain("platform_support");

    const token = await login(email, "OpsAccount123!");
    expect((await me(token)).universityId).toBeNull();
  });

  it("platform_support platform hesaplarını yönetemez", async () => {
    const listRes = await get("/api/platform/users", platformSupport);
    expect(listRes.status).toBe(403);

    const createRes = await reqAuth("POST", "/api/platform/users", platformSupport, {
      firstName: "X",
      lastName: "Y",
      email: `deny.${Date.now()}@platform.local`,
      password: "DenyAccount123!",
      role: "platform_support",
    });
    expect(createRes.status).toBe(403);
  });
});
