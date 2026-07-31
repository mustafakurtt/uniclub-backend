import type { InferSelectModel } from "drizzle-orm";
import type { users } from "../../../db/schema";

export type PlatformUserListItem = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: InferSelectModel<typeof users>["status"];
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: string[];
};

export type PlatformUserDetail = Omit<InferSelectModel<typeof users>, "passwordHash"> & {
  roles: string[];
};

/** Seed'deki platform rolleri — tenant rolleri platform hesabına atanamaz. */
export const PLATFORM_ACCOUNT_ROLE_NAMES = ["super_admin", "platform_support"] as const;

export type PlatformAccountRoleName = (typeof PLATFORM_ACCOUNT_ROLE_NAMES)[number];
