// src/features/university/university.types.ts
import { InferSelectModel } from "drizzle-orm";
import { universities, universityDomains, faculties, departments } from "../../db/schema";

export type University = InferSelectModel<typeof universities>;
export type UniversityDomain = InferSelectModel<typeof universityDomains>;
export type Faculty = InferSelectModel<typeof faculties>;
export type Department = InferSelectModel<typeof departments>;

export type DomainType = "student" | "staff";

// ── Repository payload arayüzleri ──────────────────
export interface CreateUniversityPayload {
  name: string;
  slug: string;
  domains: { domain: string; domainType: DomainType }[];
}

export interface UpdateUniversityPayload {
  name?: string;
  slug?: string;
}

export interface UpdateDomainPayload {
  domain?: string;
  domainType?: DomainType;
}
