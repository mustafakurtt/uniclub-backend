import type { InferSelectModel } from "drizzle-orm";
import type { universities } from "../../../db/schema";
import type { TenantAdminInvitationPublic } from "../../auth/tenant-admin-invitations.types";

export type UniversityStatus = InferSelectModel<typeof universities>["status"];

export type TenantListItem = {
  id: string;
  name: string;
  slug: string;
  status: UniversityStatus;
  statusReason: string | null;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  domainCount: number;
  userCount: number;
  clubCount: number;
  pendingApplications: number;
};

export type OnboardTenantResult = {
  university: {
    id: string;
    name: string;
    slug: string;
    status: UniversityStatus;
    createdAt: Date;
    updatedAt: Date;
  };
  domains: Array<{
    id: string;
    universityId: string;
    domain: string;
    domainType: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  faculties: Array<{
    id: string;
    name: string;
    universityId: string;
    createdAt: Date;
    updatedAt: Date;
    departments: Array<{
      id: string;
      facultyId: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }>;
  initialAdminInvitation: TenantAdminInvitationPublic | null;
};
