// src/features/university/university.types.ts
import { InferSelectModel } from "drizzle-orm";
import { universities, universityDomains, faculties, departments } from "../../db/schema";

export type University = InferSelectModel<typeof universities>;
export type UniversityDomain = InferSelectModel<typeof universityDomains>;
export type Faculty = InferSelectModel<typeof faculties>;
export type Department = InferSelectModel<typeof departments>;

export type DomainType = "student" | "staff";

export type UniversityStatus = University["status"];

// ── Repository payload arayüzleri ──────────────────
export interface CreateUniversityPayload {
  name: string;
  slug: string;
  domains: { domain: string; domainType: DomainType }[];
}

export interface CreateTenantPackagePayload {
  name: string;
  slug: string;
  status: UniversityStatus;
  domains: { domain: string; domainType: DomainType }[];
  faculties?: { name: string; departments?: string[] }[];
}

export interface TenantPackageResult {
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
}

export interface UpdateTenantLifecyclePayload {
  status: UniversityStatus;
  statusReason: string;
  statusChangedBy: string;
}

export interface UpdateUniversityPayload {
  name?: string;
  slug?: string;
}

export interface UpdateDomainPayload {
  domain?: string;
  domainType?: DomainType;
}
