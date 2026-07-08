// src/features/users/users.types.ts
import { InferSelectModel } from "drizzle-orm";
import { users, clubMembers, clubApplications } from "../../db/schema";

export type User = InferSelectModel<typeof users>;
export type ClubMember = InferSelectModel<typeof clubMembers>;
export type ClubApplication = InferSelectModel<typeof clubApplications>;

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  preferredLanguage?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}
