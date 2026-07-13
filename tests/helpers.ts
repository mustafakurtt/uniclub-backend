/**
 * Test yardımcıları. Hono'nun `app.request()` test arayüzünü kullanır —
 * gerçek bir port açmadan tüm middleware zincirini (requestId, cors, auth,
 * RBAC guard, hata yakalayıcı) gerçek Postgres/Redis'e karşı koştururuz.
 */
import { app } from "../src/index";
import { SEED_PASSWORD } from "./config";

export { app };

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const bearer = (token?: string) =>
  token ? { headers: { authorization: `Bearer ${token}` } } : {};

/** Seed hesabıyla giriş yapıp JWT döner. */
export async function login(email: string, password = SEED_PASSWORD): Promise<string> {
  const res = await app.request("/api/auth/login", json({ email, password }));
  const data = await res.json();
  if (!res.ok || typeof data.token !== "string") {
    throw new Error(`login başarısız (${email}): ${res.status} ${JSON.stringify(data)}`);
  }
  return data.token;
}

/** Token'ın sahibinin { userId, universityId } bilgisini döner. */
export async function me(token: string): Promise<{ userId: string; universityId: string | null }> {
  const res = await app.request("/api/auth/me", bearer(token));
  return (await res.json()).data;
}

/** İsteğe bağlı Bearer token ile GET. */
export function get(path: string, token?: string) {
  return app.request(path, bearer(token));
}

export const postJson = (path: string, body: unknown) => app.request(path, json(body));
