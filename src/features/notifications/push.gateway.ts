import { createWebPushSender, type WebPushSender } from "../../core/notifications";
import { env } from "../../config/env";
import { logger } from "../../shared/logger/logger";
import { pushSubscriptionStore } from "./push.store";

/**
 * Taşınabilir `createWebPushSender`'ın bu projeye özel kurulumu (VAPID env'den,
 * store Drizzle'dan, hata bu projenin logger'ına). Aynı desen: shared/mail/mailer.
 *
 * GRACEFUL DEVRE DIŞI: VAPID anahtarları verilmezse `webPushSender` null olur;
 * çağıranlar bunu kontrol eder. Böylece dev'de VAPID kurmadan da sistem çalışır,
 * yalnızca web push kanalı sessizce kapalı kalır (WebSocket etkilenmez).
 */
const log = logger.child({ module: "notifications.push" });

export const isPushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export const webPushSender: WebPushSender | null = isPushEnabled
  ? createWebPushSender({
      vapid: {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY!,
        privateKey: env.VAPID_PRIVATE_KEY!,
      },
      store: pushSubscriptionStore,
      logger: log,
    })
  : null;

if (!isPushEnabled) {
  log.info("web push devre dışı — VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY verilmedi");
}
