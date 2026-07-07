import { Context, Next } from "hono";
import { db } from "../db";
import { Variables } from "../core/auth/auth.middleware";

export type ClubMembershipRole = "member" | "officer" | "president";

/**
 * Bir kullanıcının bir kulüpteki yetkisinin KAYNAĞI:
 *  - "member": clubMembers üzerinden onaylı üyelik (role: officer/president)
 *  - "advisor": clubAdvisors üzerinden atanmış danışman (kulüp içi rolü yok)
 * Handler'lar gerekirse `c.get("clubAccess")` ile bu bilgiye ulaşır.
 */
export type ClubAccess =
  | { via: "member"; role: ClubMembershipRole; status: string }
  | { via: "advisor" };

export type ClubVariables = Variables & {
  clubMembership: { role: ClubMembershipRole; status: string };
  clubAccess: ClubAccess;
};

const OFFICER_ROLES: ClubMembershipRole[] = ["officer", "president"];

/**
 * Üniversite-geneli rol/izin sisteminden (rbac.middleware) TAMAMEN bağımsızdır:
 * burada yetki, kullanıcının O KULÜPTEKİ clubMembers.role'üne (ya da
 * danışmanlığına) göre belirlenir.
 */
const loadApprovedMembership = async (clubId: string, userId: string) => {
  const membership = await db.query.clubMembers.findFirst({
    where: { clubId, userId },
  });
  if (!membership || membership.status !== "approved") {
    return null;
  }
  return membership;
};

const isClubAdvisor = async (clubId: string, userId: string) => {
  const advisor = await db.query.clubAdvisors.findFirst({
    where: { clubId, userId },
  });
  return !!advisor;
};

/**
 * Kulüp "personeli": danışman VEYA officer/president. İçerik/gözetim işleri
 * (duyuru, galeri, üyelik isteklerini/üyeleri görüntüleme) için kullanılır.
 * Danışmanın kulüp içi bir rolü olmadığından `clubMembership` yerine
 * `clubAccess` set edilir; her ikisi de gerektiğinde okunabilir.
 */
export const requireClubStaff = async (c: Context<{ Variables: ClubVariables }>, next: Next) => {
  const { clubId } = c.req.param();
  const user = c.get("user");

  const membership = await loadApprovedMembership(clubId, user.userId);
  if (membership && OFFICER_ROLES.includes(membership.role)) {
    c.set("clubMembership", membership);
    c.set("clubAccess", { via: "member", role: membership.role, status: membership.status });
    return next();
  }

  if (await isClubAdvisor(clubId, user.userId)) {
    c.set("clubAccess", { via: "advisor" });
    return next();
  }

  return c.json({
    success: false,
    message: "Bu işlem için kulüp yöneticisi (başkan/officer) veya danışmanı olmalısınız.",
  }, 403);
};

/**
 * Yapısal karar mercii: officer VEYA president (danışman DAHİL DEĞİL — üyelik
 * isteğini onaylamak, üye çıkarmak, iletişim linki yönetmek yürütme işidir).
 */
export const requireClubOfficer = async (c: Context<{ Variables: ClubVariables }>, next: Next) => {
  const { clubId } = c.req.param();
  const user = c.get("user");

  const membership = await loadApprovedMembership(clubId, user.userId);
  if (!membership || !OFFICER_ROLES.includes(membership.role)) {
    return c.json({
      success: false,
      message: "Bu işlem için kulüp yöneticisi (başkan/officer) olmalısınız.",
    }, 403);
  }

  c.set("clubMembership", membership);
  c.set("clubAccess", { via: "member", role: membership.role, status: membership.status });
  await next();
};

/**
 * Yalnızca başkan: rol değişimi, başkanlık devri, kulüp profilini düzenleme.
 */
export const requireClubPresident = async (c: Context<{ Variables: ClubVariables }>, next: Next) => {
  const { clubId } = c.req.param();
  const user = c.get("user");

  const membership = await loadApprovedMembership(clubId, user.userId);
  if (!membership || membership.role !== "president") {
    return c.json({
      success: false,
      message: "Bu işlem için kulüp başkanı olmalısınız.",
    }, 403);
  }

  c.set("clubMembership", membership);
  c.set("clubAccess", { via: "member", role: membership.role, status: membership.status });
  await next();
};
