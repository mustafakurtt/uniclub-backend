import { z } from "zod";

/** Tenant yerel duvar saati — offset/Z yok; sunucu tenant IANA dilimiyle UTC'ye çevirir. */
export const scheduledPublishAtLocalField = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
    "Yayın zamanı YYYY-MM-DDTHH:mm biçiminde olmalıdır."
  );

export const optionalScheduledPublishAtLocalField = scheduledPublishAtLocalField.optional();

export const nullableScheduledPublishAtLocalField = z.union([
  scheduledPublishAtLocalField,
  z.null(),
]).optional();
