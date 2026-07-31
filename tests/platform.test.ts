import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { data, get, login, me, reqAuth, app } from "./helpers";
import { SEED_PASSWORD } from "./config";
import { db } from "../src/db";
import { eq, isNull } from "drizzle-orm";
import { universities, tenantAdminInvitations } from "../src/db/schema";
import { emailQueue, type TenantAdminInvitationEmailJob } from "../src/features/auth/auth.queue";
import { generateOneTimeToken, hashToken } from "../src/core/auth/token";
import * as rbacCache from "../src/shared/rbac/rbac.cache";
import { resolveTenantStatus } from "../src/shared/rbac/tenant-status.cache";

async function getInvitationTokenForEmail(email: string): Promise<string> {
  const jobs = await emailQueue.getJobs(["waiting", "delayed", "active", "completed"]);
  const job = jobs.find(
    (j) =>
      j.name === "send-tenant-admin-invitation" &&
      (j.data as TenantAdminInvitationEmailJob).email === email
  );
  expect(job).toBeDefined();
  return (job!.data as TenantAdminInvitationEmailJob).token;
}

async function acceptTenantAdminInvitation(params: {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  return await app.request("/api/auth/accept-tenant-admin-invitation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
}

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

    const page = await data<{
      items: Array<{
        id: string;
        name: string;
        slug: string;
        status: string;
        domainCount: number;
        userCount: number;
        clubCount: number;
        pendingApplications: number;
      }>;
      nextCursor: string | null;
    }>(res);

    expect(page.items.length).toBeGreaterThanOrEqual(3);
    const antalya = page.items.find((t) => t.slug === "antalya-bilim");
    expect(antalya).toBeDefined();
    expect(antalya!.status).toBe("active");
    expect(antalya!.userCount).toBeGreaterThan(0);
    expect(antalya!.clubCount).toBeGreaterThan(0);
    expect(antalya!.domainCount).toBeGreaterThan(0);
  });

  it("tenant listesi keyset sayfalama eşit createdAt'te satır atlamaz", async () => {
    const seedSlugs = ["antalya-bilim", "ege-bilim", "karadeniz-teknoloji"];
    const allRows = await db
      .select({ id: universities.id, slug: universities.slug })
      .from(universities)
      .where(isNull(universities.deletedAt));
    const totalCount = allRows.length;

    const collectedIds: string[] = [];
    const collectedSlugs: string[] = [];
    let cursor: string | null = null;
    const limit = 2;

    do {
      const path =
        cursor === null
          ? `/api/platform/tenants?limit=${limit}`
          : `/api/platform/tenants?limit=${limit}&cursor=${encodeURIComponent(cursor)}`;
      const res = await get(path, superAdmin);
      expect(res.status).toBe(200);
      const page = await data<{
        items: Array<{ id: string; slug: string }>;
        nextCursor: string | null;
      }>(res);
      for (const item of page.items) {
        collectedIds.push(item.id);
        collectedSlugs.push(item.slug);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(collectedIds.length).toBe(totalCount);
    expect(new Set(collectedIds).size).toBe(totalCount);
    for (const slug of seedSlugs) {
      expect(collectedSlugs).toContain(slug);
    }
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

  it("askı sonrası yalnızca tenant-status cache güncellenir, kullanıcı invalidate yok", async () => {
    const egeUni = (
      await db.query.universities.findFirst({
        where: { slug: "ege-bilim" },
        columns: { id: true },
      })
    )!.id;
    const egeStudent = await login("cem.arslan@std.egebilim.edu.tr");
    const egeStudentId = (await me(egeStudent)).userId;
    await rbacCache.resolveAuthz(egeStudentId);

    const invalidateSpy = spyOn(rbacCache, "invalidateUsersPermissions");

    const suspendRes = await reqAuth(
      "PATCH",
      `/api/platform/tenants/${egeUni}/status`,
      superAdmin,
      { status: "suspended", reason: "Invalidate maliyeti testi" }
    );
    expect(suspendRes.status).toBe(200);
    expect(invalidateSpy.mock.calls.length).toBe(0);

    const snapshot = await resolveTenantStatus(egeUni);
    expect(snapshot?.status).toBe("suspended");

    expect((await get("/api/clubs", egeStudent)).status).toBe(403);

    invalidateSpy.mockRestore();

    await reqAuth(
      "PATCH",
      `/api/platform/tenants/${egeUni}/status`,
      superAdmin,
      { status: "active", reason: "Invalidate maliyeti testi temizliği" }
    );
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

  it("super_admin tenant onboard + davet kabul + ikinci davet akışını tamamlar", async () => {
    const slug = `onboard-test-${Date.now()}`;
    const staffDomain = `staff.${slug}.edu.tr`;
    const studentDomain = `std.${slug}.edu.tr`;
    const adminEmail = `yonetici@${staffDomain}`;
    const adminPassword = "OnboardAdmin123!";

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
      },
    });
    expect(onboardRes.status).toBe(201);

    const onboarded = await data<{
      university: { id: string; slug: string; status: string };
      domains: Array<{ domain: string }>;
      faculties: Array<{ name: string; departments: Array<{ name: string }> }>;
      initialAdminInvitation: { id: string; email: string; status: string; universityId: string };
    }>(onboardRes);

    expect(onboarded.university.slug).toBe(slug);
    expect(onboarded.university.status).toBe("trial");
    expect(onboarded.domains.length).toBe(2);
    expect(onboarded.faculties[0].departments[0].name).toBe("Bilgisayar Mühendisliği");
    expect(onboarded.initialAdminInvitation.email).toBe(adminEmail);
    expect(onboarded.initialAdminInvitation.status).toBe("pending");
    expect(onboarded.initialAdminInvitation.universityId).toBe(onboarded.university.id);

    const adminToken = await getInvitationTokenForEmail(adminEmail);
    const acceptRes = await acceptTenantAdminInvitation({
      token: adminToken,
      firstName: "Test",
      lastName: "Yönetici",
      password: adminPassword,
    });
    expect(acceptRes.status).toBe(201);

    const adminLoginToken = await login(adminEmail, adminPassword);
    const adminMe = await me(adminLoginToken);
    expect(adminMe.universityId).toBe(onboarded.university.id);

    const permsRes = await get("/api/users/me/permissions", adminLoginToken);
    const perms = await data<{ roles: string[] }>(permsRes);
    expect(perms.roles).toContain("university_admin");

    const inviteEmail = `ikinci.yonetici@${staffDomain}`;
    const invitePassword = "InviteAdmin123!";
    const inviteRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${onboarded.university.id}/invite-admin`,
      superAdmin,
      {
        firstName: "İkinci",
        lastName: "Yönetici",
        email: inviteEmail,
      }
    );
    expect(inviteRes.status).toBe(201);
    const invited = await data<{ email: string; status: string }>(inviteRes);
    expect(invited.email).toBe(inviteEmail);
    expect(invited.status).toBe("pending");

    const listRes = await get(`/api/platform/tenants/${onboarded.university.id}/invitations`, superAdmin);
    expect(listRes.status).toBe(200);
    const pending = await data<Array<{ email: string }>>(listRes);
    expect(pending.some((i) => i.email === inviteEmail)).toBe(true);

    const inviteAcceptToken = await getInvitationTokenForEmail(inviteEmail);
    const inviteAcceptRes = await acceptTenantAdminInvitation({
      token: inviteAcceptToken,
      firstName: "İkinci",
      lastName: "Yönetici",
      password: invitePassword,
    });
    expect(inviteAcceptRes.status).toBe(201);
    expect((await me(await login(inviteEmail, invitePassword))).universityId).toBe(
      onboarded.university.id
    );
  });

  it("onboard çakışan e-posta ile başarısız olursa rollback olur ve davet maili kuyruğa girmez", async () => {
    const slug = `rollback-onboard-${Date.now()}`;
    const staffDomain = `staff.${slug}.edu.tr`;
    const dupEmail = "superadmin@platform.local";

    const jobsBefore = await emailQueue.getJobs(["waiting", "delayed", "active"]);
    const inviteJobsBefore = jobsBefore.filter(
      (j) => j.name === "send-tenant-admin-invitation" && (j.data as TenantAdminInvitationEmailJob).email === dupEmail
    ).length;

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
      },
    });
    expect(res.status).toBe(400);

    const uni = await db.query.universities.findFirst({ where: { slug } });
    expect(uni).toBeUndefined();

    const domainRow = await db.query.universityDomains.findFirst({
      where: { domain: staffDomain },
    });
    expect(domainRow).toBeUndefined();

    const jobsAfter = await emailQueue.getJobs(["waiting", "delayed", "active"]);
    const inviteJobsAfter = jobsAfter.filter(
      (j) => j.name === "send-tenant-admin-invitation" && (j.data as TenantAdminInvitationEmailJob).email === dupEmail
    ).length;
    expect(inviteJobsAfter).toBe(inviteJobsBefore);
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

describe("tenant yönetici davet kabulü", () => {
  let superAdmin: string;
  let antalyaUni: string;

  beforeAll(async () => {
    superAdmin = await login("superadmin@platform.local");
    const tenantAdmin = await login("elif.demir@antalya.edu.tr");
    antalyaUni = (await me(tenantAdmin)).universityId as string;
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = generateOneTimeToken();
    const email = `expired.${Date.now()}@antalya.edu.tr`;
    await db.insert(tenantAdminInvitations).values({
      universityId: antalyaUni,
      email,
      firstName: "Expired",
      lastName: "Admin",
      roleName: "university_admin",
      tokenHash: await hashToken(token),
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await acceptTenantAdminInvitation({
      token,
      firstName: "Expired",
      lastName: "Admin",
      password: "ExpiredAdmin123!",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("süresi");
  });

  it("ikinci kez kullanılan token reddedilir", async () => {
    const email = `reuse.${Date.now()}@antalya.edu.tr`;
    const inviteRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${antalyaUni}/invite-admin`,
      superAdmin,
      { firstName: "Reuse", lastName: "Test", email }
    );
    expect(inviteRes.status).toBe(201);

    const token = await getInvitationTokenForEmail(email);
    const password = "ReuseAdmin123!";
    const first = await acceptTenantAdminInvitation({
      token,
      firstName: "Reuse",
      lastName: "Test",
      password,
    });
    expect(first.status).toBe(201);

    const second = await acceptTenantAdminInvitation({
      token,
      firstName: "Reuse",
      lastName: "Test",
      password,
    });
    expect(second.status).toBe(400);
    expect((await second.json()).message).toContain("kullanılmış");
  });

  it("iptal edilmiş token reddedilir", async () => {
    const email = `cancel.${Date.now()}@antalya.edu.tr`;
    const inviteRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${antalyaUni}/invite-admin`,
      superAdmin,
      { firstName: "Cancel", lastName: "Test", email }
    );
    const invitation = await data<{ id: string }>(inviteRes);

    const cancelRes = await reqAuth(
      "POST",
      `/api/platform/tenants/${antalyaUni}/invitations/${invitation.id}/cancel`,
      superAdmin
    );
    expect(cancelRes.status).toBe(200);

    const token = await getInvitationTokenForEmail(email);
    const res = await acceptTenantAdminInvitation({
      token,
      firstName: "Cancel",
      lastName: "Test",
      password: "CancelAdmin123!",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("iptal");
  });

  it("token hedef tenant'a bağlıdır — başka tenant bağlamında kabul tenant'ı token'dan okur", async () => {
    const slug = `invite-scope-${Date.now()}`;
    const staffDomain = `staff.${slug}.edu.tr`;
    const email = `scoped.admin@${staffDomain}`;

    const onboardRes = await reqAuth("POST", "/api/platform/tenants/onboard", superAdmin, {
      name: "Invite Scope Uni",
      slug,
      status: "trial",
      domains: [
        { domain: `std.${slug}.edu.tr`, domainType: "student" },
        { domain: staffDomain, domainType: "staff" },
      ],
      initialAdmin: { firstName: "Scoped", lastName: "Admin", email },
    });
    const onboarded = await data<{ university: { id: string }; initialAdminInvitation: { universityId: string } }>(
      onboardRes
    );
    expect(onboarded.university.id).not.toBe(antalyaUni);

    const token = await getInvitationTokenForEmail(email);
    const password = "ScopedAdmin123!";
    const acceptRes = await acceptTenantAdminInvitation({
      token,
      firstName: "Scoped",
      lastName: "Admin",
      password,
    });
    expect(acceptRes.status).toBe(201);

    const user = await data<{ universityId: string }>(acceptRes);
    expect(user.universityId).toBe(onboarded.university.id);
    expect(user.universityId).not.toBe(antalyaUni);
  });

  it("12 karakter altı şifre kabul sırasında reddedilir", async () => {
    const email = `shortpw.${Date.now()}@antalya.edu.tr`;
    await reqAuth("POST", `/api/platform/tenants/${antalyaUni}/invite-admin`, superAdmin, {
      firstName: "Short",
      lastName: "Password",
      email,
    });

    const token = await getInvitationTokenForEmail(email);
    const res = await acceptTenantAdminInvitation({
      token,
      firstName: "Short",
      lastName: "Password",
      password: "short1ab",
    });
    expect(res.status).toBe(400);
  });

  it("aynı token ile eşzamanlı iki kabul — biri 201 diğeri 400", async () => {
    const email = `concurrent.${Date.now()}@antalya.edu.tr`;
    await reqAuth("POST", `/api/platform/tenants/${antalyaUni}/invite-admin`, superAdmin, {
      firstName: "Concurrent",
      lastName: "Test",
      email,
    });
    const token = await getInvitationTokenForEmail(email);
    const body = JSON.stringify({
      token,
      firstName: "Concurrent",
      lastName: "Test",
      password: "ConcurrentAdm12!",
    });
    const opts = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    const [first, second] = await Promise.all([
      app.request("/api/auth/accept-tenant-admin-invitation", opts),
      app.request("/api/auth/accept-tenant-admin-invitation", opts),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);
    if (second.status === 400) {
      expect((await second.json()).message).toContain("kullanılmış");
    } else {
      expect((await first.json()).message).toContain("kullanılmış");
    }
  });

  it("askıya alınmış tenant için bekleyen davet kabul edilemez", async () => {
    const email = `suspended.invite.${Date.now()}@antalya.edu.tr`;
    await reqAuth("POST", `/api/platform/tenants/${antalyaUni}/invite-admin`, superAdmin, {
      firstName: "Suspended",
      lastName: "Invite",
      email,
    });
    const token = await getInvitationTokenForEmail(email);

    await reqAuth("PATCH", `/api/platform/tenants/${antalyaUni}/status`, superAdmin, {
      status: "suspended",
      reason: "Davet kabul testi askısı",
    });

    const res = await acceptTenantAdminInvitation({
      token,
      firstName: "Suspended",
      lastName: "Invite",
      password: "SuspendedAdm12!",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("kayıt");

    await reqAuth("PATCH", `/api/platform/tenants/${antalyaUni}/status`, superAdmin, {
      status: "active",
      reason: "Davet kabul testi temizliği",
    });
  });
});
