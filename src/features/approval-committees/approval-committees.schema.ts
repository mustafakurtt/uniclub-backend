import { z } from "zod";

export const createApprovalCommitteeSchema = z.object({
  name: z.string().trim().min(2).max(128),
  memberUserIds: z.array(z.string().uuid()).min(1).max(20),
  isActive: z.boolean().optional(),
});

export const updateApprovalCommitteeSchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  memberUserIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

export type CreateApprovalCommitteeDTO = z.infer<typeof createApprovalCommitteeSchema>;
export type UpdateApprovalCommitteeDTO = z.infer<typeof updateApprovalCommitteeSchema>;
