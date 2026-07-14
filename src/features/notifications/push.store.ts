import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { pushSubscriptions } from "../../db/schema";
import type { PushSubscriptionStore, WebPushSubscription } from "../../core/notifications";

/**
 * `PushSubscriptionStore` port'unun bu projeye özel (Drizzle) implementasyonu.
 * core taşınabilir kalsın diye depolama BURADA; core yalnızca sözleşmeyi bilir.
 */
class DrizzlePushSubscriptionStore implements PushSubscriptionStore {
  async list(userId: string): Promise<WebPushSubscription[]> {
    const rows = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
  }

  /**
   * endpoint UNIQUE → UPSERT: aynı cihaz (tarayıcı) yeniden abone olursa çift
   * kayıt oluşmaz; anahtarlar dönebileceği için güncellenir. Farklı kullanıcı aynı
   * endpoint'i getirirse (cihaz devri) userId de güncellenir.
   */
  async save(userId: string, subscription: WebPushSubscription): Promise<void> {
    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updatedAt: new Date(),
        },
      });
  }

  async removeByEndpoints(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
  }
}

export const pushSubscriptionStore = new DrizzlePushSubscriptionStore();
