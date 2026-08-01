import { z } from "zod";

const termDate = z.string().datetime({ offset: true });

export const createAcademicTermSchema = z.object({
  name: z.string().trim().min(2).max(128),
  startsAt: termDate,
  endsAt: termDate,
  status: z.enum(["open", "closed"]).optional(),
});
export type CreateAcademicTermDTO = z.infer<typeof createAcademicTermSchema>;

export const updateAcademicTermSchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  startsAt: termDate.optional(),
  endsAt: termDate.optional(),
  status: z.enum(["open", "closed"]).optional(),
});
export type UpdateAcademicTermDTO = z.infer<typeof updateAcademicTermSchema>;
