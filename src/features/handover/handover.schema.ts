import { z } from "zod";

export const createHandoverRecordSchema = z.object({
  generalMeetingId: z.string().uuid(),
  handoverAt: z.string().datetime({ offset: true }).optional(),
});

export type CreateHandoverRecordDTO = z.infer<typeof createHandoverRecordSchema>;
