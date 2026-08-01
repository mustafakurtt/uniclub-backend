import { randomBytes } from "node:crypto";
import { redis } from "../../shared/redis/redis.client";

const TOKEN_TTL_SEC = 30;
const ROTATE_BUFFER_MS = 5000;
const KEY_PREFIX = "checkin:qr:";

type StoredToken = { token: string; expiresAt: string };

/**
 * Etkinlik yoklama QR token'ları — kısa ömürlü, Redis'te döner.
 */
export const checkInQrCache = {
  key(activityId: string) {
    return `${KEY_PREFIX}${activityId}`;
  },

  async getOrRotate(activityId: string): Promise<{ token: string; expiresAt: Date }> {
    const key = this.key(activityId);
    const raw = await redis.get(key);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredToken;
      const expiresAt = new Date(parsed.expiresAt);
      if (expiresAt.getTime() - Date.now() > ROTATE_BUFFER_MS) {
        return { token: parsed.token, expiresAt };
      }
    }

    const token = randomBytes(16).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SEC * 1000);
    const payload: StoredToken = { token, expiresAt: expiresAt.toISOString() };
    await redis.setex(key, TOKEN_TTL_SEC, JSON.stringify(payload));
    return { token, expiresAt };
  },

  async validate(activityId: string, token: string): Promise<boolean> {
    const raw = await redis.get(this.key(activityId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredToken;
    if (parsed.token !== token) return false;
    return new Date(parsed.expiresAt) > new Date();
  },
};
