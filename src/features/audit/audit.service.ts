import { auditRepository, ListAuditLogsFilter } from "./audit.repository";
import { AuditLog, CreateAuditLogPayload } from "./audit.types";

export const auditService = {
  /**
   * Denetim kaydı yazar. Hata FIRLATIR — çağıranın yutması beklenir:
   * guard zincirindeki auditTrail zaten try/catch ile sarar (asıl işlem
   * denetim kaydı yüzünden asla başarısız olmaz, bkz. core/rbac/audit-hook.ts).
   */
  async record(payload: CreateAuditLogPayload): Promise<AuditLog> {
    return await auditRepository.create(payload);
  },

  async list(universityId: string, limit: number, cursor?: string, filter?: ListAuditLogsFilter) {
    const cursorDate = cursor ? new Date(cursor) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw new Error("Geçersiz cursor değeri.");
    }
    const items = await auditRepository.listByUniversity(universityId, limit, cursorDate, filter);
    // Bir sonraki sayfanın cursor'ı: son satırın createdAt'i. Sayfa dolmadıysa son sayfadayız.
    const nextCursor = items.length === limit ? items[items.length - 1].createdAt.toISOString() : null;
    return { items, nextCursor };
  },
};
