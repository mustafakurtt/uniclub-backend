// src/features/clubs/clubs.types.ts
import { InferSelectModel } from "drizzle-orm";
import {
  clubs,
  clubMembers,
  clubAdvisors,
  clubContactLinks,
  clubApplications,
  clubApplicationApprovals,
} from "../../db/schema";

export type Club = InferSelectModel<typeof clubs>;
export type ClubMember = InferSelectModel<typeof clubMembers>;
export type ClubAdvisor = InferSelectModel<typeof clubAdvisors>;
export type ClubContactLink = InferSelectModel<typeof clubContactLinks>;
export type ClubApplication = InferSelectModel<typeof clubApplications>;
export type ClubApplicationApproval = InferSelectModel<typeof clubApplicationApprovals>;

export type ContactPlatform = ClubContactLink["platform"];

export interface CreateClubApplicationPayload {
  proposedName: string;
  description?: string;
}

export interface CreateContactLinkPayload {
  platform: ContactPlatform;
  url: string;
}

export interface UpdateOwnClubPayload {
  name?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  joinPolicy?: "open" | "approval_required";
}
