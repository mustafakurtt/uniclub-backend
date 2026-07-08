// src/features/admin/admin.types.ts
import { InferSelectModel } from "drizzle-orm";
import { users, clubs, clubApplications, clubApplicationApprovals, clubMembers, clubAdvisors } from "../../db/schema";

export type User = InferSelectModel<typeof users>;
export type Club = InferSelectModel<typeof clubs>;
export type ClubApplication = InferSelectModel<typeof clubApplications>;
export type ClubApplicationApproval = InferSelectModel<typeof clubApplicationApprovals>;
export type ClubMember = InferSelectModel<typeof clubMembers>;
export type ClubAdvisor = InferSelectModel<typeof clubAdvisors>;

export interface UpdateUserStatusPayload {
  status: "pending" | "active" | "suspended";
}

export interface UpdateClubStatusPayload {
  status: "pending" | "approved" | "rejected" | "archived";
}

export interface DecideClubApplicationResult {
  application: ClubApplication;
  club: Club | null;
}

export interface UpdateClubPayload {
  name?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  joinPolicy?: "open" | "approval_required";
}
