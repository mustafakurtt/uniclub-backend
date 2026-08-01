import { z } from "zod";

export const boardMemberInputSchema = z.object({
  userId: z.string().uuid(),
  boardType: z.enum(["management", "audit"]),
  seatType: z.enum(["principal", "alternate"]),
  title: z.enum(["president", "vice_president", "secretary", "treasurer", "member"]),
});

export const createGeneralMeetingSchema = z.object({
  academicTermId: z.string().uuid(),
  meetingType: z.enum(["ordinary", "extraordinary"]),
  heldAt: z.string().datetime({ offset: true }),
  location: z.string().trim().min(1).max(256),
  decisions: z.string().trim().min(1).max(10000),
  attendeeUserIds: z.array(z.string().uuid()).min(1),
  boardMembers: z.array(boardMemberInputSchema).default([]),
});

export type CreateGeneralMeetingDTO = z.infer<typeof createGeneralMeetingSchema>;
