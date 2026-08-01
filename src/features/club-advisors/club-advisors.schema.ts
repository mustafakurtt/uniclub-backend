import { z } from "zod";

export const inviteAdvisorSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().max(2000).optional(),
});

export const declineAdvisorInvitationSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export const withdrawAdvisorSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type InviteAdvisorDTO = z.infer<typeof inviteAdvisorSchema>;
export type DeclineAdvisorInvitationDTO = z.infer<typeof declineAdvisorInvitationSchema>;
export type WithdrawAdvisorDTO = z.infer<typeof withdrawAdvisorSchema>;
