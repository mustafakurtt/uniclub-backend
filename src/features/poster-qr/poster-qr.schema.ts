import { z } from "zod";

const targetTypeEnum = z.enum(["club", "activity"]);

export const createPosterQrSchema = z
  .object({
    sourceLabel: z.string().min(1).max(128),
    targetType: targetTypeEnum,
    targetClubId: z.string().uuid().optional(),
    targetActivityId: z.string().uuid().optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validUntil: z.coerce.date().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.targetType === "club" && !data.targetClubId) {
      ctx.addIssue({ code: "custom", message: "Kulüp hedefi için targetClubId gerekli.", path: ["targetClubId"] });
    }
    if (data.targetType === "activity" && !data.targetActivityId) {
      ctx.addIssue({
        code: "custom",
        message: "Etkinlik hedefi için targetActivityId gerekli.",
        path: ["targetActivityId"],
      });
    }
  });

export const updatePosterQrSchema = z
  .object({
    sourceLabel: z.string().min(1).max(128).optional(),
    targetType: targetTypeEnum.optional(),
    targetClubId: z.string().uuid().nullable().optional(),
    targetActivityId: z.string().uuid().nullable().optional(),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Güncellenecek en az bir alan girilmelidir." });

export type CreatePosterQrDTO = z.infer<typeof createPosterQrSchema>;
export type UpdatePosterQrDTO = z.infer<typeof updatePosterQrSchema>;
