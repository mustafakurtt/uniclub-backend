import { z } from "zod";

const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.coerce.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

export const clubsExportParamsSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]).optional(),
  createdFrom: optionalDate.optional(),
  createdTo: optionalDate.optional(),
});

export const clubMembersExportParamsSchema = z.object({
  clubId: z.string().uuid(),
  role: z.enum(["member", "officer", "president"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const activitiesExportParamsSchema = z.object({
  from: optionalDate.optional(),
  to: optionalDate.optional(),
  clubId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "cancelled"]).optional(),
});

export type ClubsExportParams = z.infer<typeof clubsExportParamsSchema>;
export type ClubMembersExportParams = z.infer<typeof clubMembersExportParamsSchema>;
export type ActivitiesExportParams = z.infer<typeof activitiesExportParamsSchema>;

export type ExportParams =
  | ClubsExportParams
  | ClubMembersExportParams
  | ActivitiesExportParams;
