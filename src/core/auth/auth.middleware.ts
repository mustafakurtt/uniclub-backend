import { Context, Next } from "hono";
import { verifyToken, JwtPayload } from "../../shared/utils/jwt.util";

export type Variables = {
  user: JwtPayload;
};

export const authMiddleware = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({
      success: false,
      message: "Bu işlem için giriş yapmalısınız (Token eksik)."
    }, 401);
  }

  const token = authHeader.split(" ")[1];
  const payload = await verifyToken(token);

  if (!payload) {
    return c.json({
      success: false,
      message: "Oturum süreniz dolmuş veya geçersiz token. Lütfen tekrar giriş yapın."
    }, 401);
  }

  c.set("user", payload);
  await next();
};
