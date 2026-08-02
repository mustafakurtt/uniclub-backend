import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

function addPeriodIssues(
  q: { from?: string; to?: string; academicTermId?: string },
  ctx: z.RefinementCtx
) {
  if (!q.academicTermId && !(q.from && q.to)) {
    ctx.addIssue({
      code: "custom",
      message: "from/to veya academicTermId gerekli",
      path: ["from"],
    });
  }
  if (q.from && q.to && new Date(q.from) > new Date(q.to)) {
    ctx.addIssue({
      code: "custom",
      message: "from, to'dan sonra olamaz",
      path: ["to"],
    });
  }
}

export const auditPeriodQuerySchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    academicTermId: z.string().uuid().optional(),
  })
  .superRefine(addPeriodIssues);

export const auditDecisionListQuerySchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    academicTermId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).optional(),
    actorId: z.string().uuid().optional(),
    targetId: z.string().max(128).optional(),
  })
  .superRefine(addPeriodIssues);

export type AuditPeriodQuery = z.infer<typeof auditPeriodQuerySchema>;
export type AuditDecisionListQuery = z.infer<typeof auditDecisionListQuerySchema>;
