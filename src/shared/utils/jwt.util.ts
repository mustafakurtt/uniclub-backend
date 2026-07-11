import { createJwt } from "../../core/auth/jwt";
import type { JwtPayload } from "../../core/auth/auth.middleware";
import { env } from "../../config/env";

export type { JwtPayload };

/** Bu projenin JWT örneği: secret env'den, ömür 7 gün. Mekanizma core'da. */
const jwt = createJwt<Omit<JwtPayload, "exp">>({
  secret: env.JWT_SECRET,
  expiresInSeconds: 60 * 60 * 24 * 7,
});

export const generateToken = (payload: Omit<JwtPayload, "exp">): Promise<string> =>
  jwt.sign(payload);

export const verifyToken = (token: string): Promise<JwtPayload | null> => jwt.verify(token);
