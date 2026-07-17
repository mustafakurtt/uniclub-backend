import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { created, done } from "../../shared/utils/respond";
import { mediaService } from "./media.service";
import { env } from "../../config/env";

/**
 * Dosya YÜKLEME + silme — `/api/uploads` altına mount edilir (index.ts). Global
 * MAX_BODY_BYTES (JSON sınırı) burada DEĞİL; upload'a özel `MAX_UPLOAD_BYTES`
 * uygulanır (global bodyLimit index.ts'te bu path için atlanır).
 *
 * try/catch yok — servis HttpError fırlatır, `app.onError` tek noktadan çevirir.
 */
export const mediaRoutes = new Hono<{ Variables: Variables }>();

mediaRoutes.use("*", authMiddleware, requireActiveUser);

// 1. YÜKLE (multipart/form-data: file + opsiyonel purpose) → { id, url, ... }
mediaRoutes.post(
  "/",
  bodyLimit({
    maxSize: env.MAX_UPLOAD_BYTES,
    onError: (c) =>
      c.json(
        { success: false, message: "Dosya boyutu üst sınırı aştı.", code: "PAYLOAD_TOO_LARGE", requestId: c.get("requestId") },
        413
      ),
  }),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.parseBody();
    const file = body["file"];
    const purpose = typeof body["purpose"] === "string" ? body["purpose"] : "other";
    const result = await mediaService.upload(
      user.userId,
      user.universityId,
      file instanceof File ? file : undefined,
      purpose
    );
    return created(c, result, "media.uploaded");
  }
);

// 2. SİL (yalnızca yükleyen)
mediaRoutes.delete("/:mediaId", async (c) => {
  const user = c.get("user");
  const { mediaId } = c.req.param();
  await mediaService.remove(mediaId, user.userId);
  return done(c, "media.deleted");
});

/**
 * Dosya SERVİSİ — `/uploads/:key` altına mount edilir (index.ts). PUBLIC (auth yok):
 * key rastgele bir uuid'dir (tahmin edilemez capability-URL) ve görseller açık
 * sayfalarda (kulüp keşfi) gömülür. Uzun süreli cache'lenebilir (key değişmez).
 */
export const mediaServeRoutes = new Hono();

mediaServeRoutes.get("/:key", async (c) => {
  const { key } = c.req.param();
  const obj = await mediaService.getForServing(key);
  // View aralığını temiz bir ArrayBuffer'a kopyala (TS BodyInit Uint8Array view'ı
  // doğrudan kabul etmiyor; kopya tam olarak baytların kendisidir).
  const body = obj.bytes.buffer.slice(
    obj.bytes.byteOffset,
    obj.bytes.byteOffset + obj.bytes.byteLength
  ) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
