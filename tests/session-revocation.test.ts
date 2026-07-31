import { describe, expect, it } from "bun:test";
import { createJwt } from "../src/core/auth/jwt";
import { generateOneTimeToken, hashToken } from "../src/core/auth/token";
import { authRepository } from "../src/features/auth/auth.repository";
import {
  addConnection,
  connectionCount,
} from "../src/features/notifications/notifications.gateway";
import { invalidateUserPermissions } from "../src/shared/rbac/rbac.cache";
import { revokeUserSessions } from "../src/shared/rbac/session-revocation";
import { app, login, me, postJson, reqAuth, get } from "./helpers";
import { SEED_PASSWORD } from "./config";
import type { WSContext } from "hono/ws";

const SUBJECT_EMAIL = "ayse.yilmaz@std.antalya.edu.tr";
const BAN_TARGET_EMAIL = "burak.demirci@std.antalya.edu.tr";
const ROLE_TARGET_EMAIL = "can.ozturk@std.antalya.edu.tr";

const mockWs = (): WSContext => ({ send: () => {}, close: () => {} }) as unknown as WSContext;

describe("session revocation — tokenVersion", () => {
  it("claim olmayan eski token kabul edilir (?? 0)", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);

    const legacyJwt = createJwt({
      secret: process.env.JWT_SECRET!,
      expiresInSeconds: 3600,
    });
    const legacyToken = await legacyJwt.sign({
      userId: profile.userId,
      universityId: profile.universityId,
    });

    const res = await get("/api/users/me", legacyToken);
    expect(res.status).toBe(200);
  });

  it("tokenVersion uyuşmazlığı 401 döner (403 değil)", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);

    const staleJwt = createJwt({
      secret: process.env.JWT_SECRET!,
      expiresInSeconds: 3600,
    });
    const staleToken = await staleJwt.sign({
      userId: profile.userId,
      universityId: profile.universityId,
      tokenVersion: 0,
    });

    await reqAuth(
      "PATCH",
      "/api/users/me/password",
      token,
      { currentPassword: SEED_PASSWORD, newPassword: "NewPassword123!" }
    );

    const res = await get("/api/users/me", staleToken);
    expect(res.status).toBe(401);

    const revertToken = await login(SUBJECT_EMAIL, "NewPassword123!");
    await reqAuth("PATCH", "/api/users/me/password", revertToken, {
      currentPassword: "NewPassword123!",
      newPassword: SEED_PASSWORD,
    });
  });

  it("şifre değişimi sonrası eski token 401, yeni giriş 200", async () => {
    const email = SUBJECT_EMAIL;
    const tokenA = await login(email);
    const tokenB = await login(email);
    const newPassword = "AnotherPass123!";

    const changeRes = await reqAuth("PATCH", "/api/users/me/password", tokenA, {
      currentPassword: SEED_PASSWORD,
      newPassword,
    });
    expect(changeRes.status).toBe(200);

    expect((await get("/api/users/me", tokenB)).status).toBe(401);
    expect((await get("/api/users/me", tokenA)).status).toBe(401);

    const freshToken = await login(email, newPassword);
    expect((await get("/api/users/me", freshToken)).status).toBe(200);

    // Sonraki testler için şifreyi geri al
    await reqAuth("PATCH", "/api/users/me/password", freshToken, {
      currentPassword: newPassword,
      newPassword: SEED_PASSWORD,
    });
  });

  it("GET /api/auth/me iptal edilmiş token ile 401", async () => {
    const token = await login(SUBJECT_EMAIL);
    await reqAuth("PATCH", "/api/users/me/password", token, {
      currentPassword: SEED_PASSWORD,
      newPassword: "RevertPass123!",
    });

    const res = await get("/api/auth/me", token);
    expect(res.status).toBe(401);

    const revertToken = await login(SUBJECT_EMAIL, "RevertPass123!");
    await reqAuth("PATCH", "/api/users/me/password", revertToken, {
      currentPassword: "RevertPass123!",
      newPassword: SEED_PASSWORD,
    });
  });
});

describe("session revocation — WebSocket", () => {
  it("invalidateUserPermissions WS koparmaz; revokeUserSessions koparır", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);
    addConnection(profile.userId, mockWs());
    expect(connectionCount(profile.userId)).toBe(1);

    await invalidateUserPermissions(profile.userId);
    expect(connectionCount(profile.userId)).toBe(1);

    await revokeUserSessions(profile.userId);
    expect(connectionCount(profile.userId)).toBe(0);
  });

  it("rol ataması invalidate sonrası WS kopmaz", async () => {
    const adminToken = await login("superadmin@platform.local");
    const studentToken = await login(ROLE_TARGET_EMAIL);
    const student = await me(studentToken);
    addConnection(student.userId, mockWs());

    const rolesRes = await get("/api/auth/roles", adminToken);
    const rolesBody = await rolesRes.json();
    const clubPresidentRole = rolesBody.data.find(
      (r: { name: string }) => r.name === "advisor"
    );
    expect(clubPresidentRole).toBeDefined();

    const assignRes = await reqAuth(
      "POST",
      `/api/auth/users/${student.userId}/roles`,
      adminToken,
      { roleId: clubPresidentRole.id }
    );
    expect(assignRes.status).toBe(201);
    expect(connectionCount(student.userId)).toBe(1);

    await reqAuth(
      "DELETE",
      `/api/auth/users/${student.userId}/roles/${clubPresidentRole.id}`,
      adminToken
    );
  });

  it("askı sonrası WS kopar", async () => {
    const adminToken = await login("elif.demir@antalya.edu.tr");
    const admin = await me(adminToken);
    const studentToken = await login(ROLE_TARGET_EMAIL);
    const student = await me(studentToken);
    addConnection(student.userId, mockWs());

    const banRes = await app.request(
      `/api/moderation/universities/${admin.universityId}/users/${student.userId}/ban`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "test askı" }),
      }
    );
    expect(banRes.status).toBe(200);
    expect(connectionCount(student.userId)).toBe(0);

    // Test sonrası askıyı kaldır
    await app.request(
      `/api/moderation/universities/${admin.universityId}/users/${student.userId}/unban`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${adminToken}` },
      }
    );
  });
});

describe("self-servis şifre sıfırlama", () => {
  it("forgot-password: var olmayan ve var olan e-posta aynı yanıt", async () => {
    const existing = await postJson("/api/auth/forgot-password", {
      email: SUBJECT_EMAIL,
    });
    const missing = await postJson("/api/auth/forgot-password", {
      email: "olmayan@std.antalya.edu.tr",
    });
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    const existingBody = await existing.json();
    const missingBody = await missing.json();
    expect(existingBody.message).toBe(missingBody.message);
    expect(existingBody.success).toBe(true);
  });

  it("sıfırlama token'ı tek kullanımlık", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);
    const resetToken = generateOneTimeToken();
    await authRepository.createPasswordReset(
      profile.userId,
      await hashToken(resetToken),
      new Date(Date.now() + 60 * 60 * 1000)
    );

    const first = await postJson("/api/auth/reset-password", {
      token: resetToken,
      password: "ResetOnce123!",
    });
    expect(first.status).toBe(200);

    const second = await postJson("/api/auth/reset-password", {
      token: resetToken,
      password: "ResetTwice123!",
    });
    expect(second.status).toBe(400);

    const revertToken = await login(SUBJECT_EMAIL, "ResetOnce123!");
    await reqAuth("PATCH", "/api/users/me/password", revertToken, {
      currentPassword: "ResetOnce123!",
      newPassword: SEED_PASSWORD,
    });
  });

  it("sıfırlama token'ı süre dolumu", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);
    const resetToken = generateOneTimeToken();
    await authRepository.createPasswordReset(
      profile.userId,
      await hashToken(resetToken),
      new Date(Date.now() - 1000)
    );

    const res = await postJson("/api/auth/reset-password", {
      token: resetToken,
      password: "ExpiredReset123!",
    });
    expect(res.status).toBe(400);
  });

  it("yeni forgot isteği önceki açık token'ı iptal eder", async () => {
    const token = await login(SUBJECT_EMAIL);
    const profile = await me(token);
    const oldToken = generateOneTimeToken();
    await authRepository.createPasswordReset(
      profile.userId,
      await hashToken(oldToken),
      new Date(Date.now() + 60 * 60 * 1000)
    );

    await postJson("/api/auth/forgot-password", { email: SUBJECT_EMAIL });

    const res = await postJson("/api/auth/reset-password", {
      token: oldToken,
      password: "ShouldFail123!",
    });
    expect(res.status).toBe(400);
  });
});
