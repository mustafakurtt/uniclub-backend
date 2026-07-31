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

/** Bearer token'lı yazma isteği (POST/PATCH/DELETE), opsiyonel JSON gövde ile. */
export function reqAuth(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  token: string,
  body?: unknown
) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** JSON `data` gövdesini çıkarır (başarı zarfı). */
export async function data<T = any>(res: Response): Promise<T> {
  return (await res.json()).data as T;
}
