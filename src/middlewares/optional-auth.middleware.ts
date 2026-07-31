import { createMiddleware } from "hono/factory";
import type { Variables } from "../core/auth/auth.middleware";
import { verifyToken } from "../shared/utils/jwt.util";

/**
 * Bearer token varsa ve geçerliyse `user` bağlamını kurar; yoksa veya geçersizse
 * sessizce devam eder (public rotalar + locale önceliği için).
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (payload) {
      c.set("user", payload);
    }
  }
  await next();
});
