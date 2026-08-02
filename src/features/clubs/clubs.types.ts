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

/**
 * İletişim platformu katalogu. DB'de `varchar` tutulur (pgEnum DEĞİL) çünkü bu
 * liste sık büyür — yeni bir sosyal ağ eklemek migration gerektirmemeli. Typo
 * güvenliğini bu `as const` katalog sağlar; DB asıl kaynak olmaya devam eder.
 * (Aynı kalıp: notifications.types.ts → NotificationType.)
 */
export const CONTACT_PLATFORMS = [
  "whatsapp",
  "instagram",
  "discord",
  "telegram",
  "twitter",
  "linkedin",
  "youtube",
  "tiktok",
  "website",
  "email",
  "other",
] as const;

export type ContactPlatform = (typeof CONTACT_PLATFORMS)[number];

export interface CreateClubApplicationPayload {
  proposedName: string;
  description?: string;
  documents?: { documentTypeKey: string; mediaId: string }[];
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

export interface UpdateClubPayload {
  name?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  joinPolicy?: "open" | "approval_required";
}
