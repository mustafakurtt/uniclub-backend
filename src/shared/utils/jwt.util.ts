import { sign, verify } from "hono/jwt";
import { env } from "../../config/env";

export interface JwtPayload {
  userId: string;
  /** NULL = platform hesabı (hiçbir üniversiteye bağlı değil). Bkz. schema.users. */
  universityId: string | null;
  exp: number;
}

// Endüstri standardı olan HMAC SHA-256 algoritmasını sabitliyoruz
const ALGORITHM = "HS256";

export const generateToken = async (payload: Omit<JwtPayload, "exp">): Promise<string> => {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  
  // 3. parametre olarak algoritmayı (HS256) ekledik
  return await sign({ ...payload, exp }, env.JWT_SECRET, ALGORITHM);
};

export const verifyToken = async (token: string): Promise<JwtPayload | null> => {
  try {
    // Hono'nun güvenlik kuralı gereği algoritmayı açıkça belirtiyoruz
    const payload = await verify(token, env.JWT_SECRET, ALGORITHM);
    return payload as unknown as JwtPayload;
  } catch (error) {
    return null; 
  }
};