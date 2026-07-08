// src/features/auth/auth.types.ts
import { InferSelectModel } from "drizzle-orm";
import { users, universityDomains, roles, permissions, rolePermissions } from "../../db/schema";

// Veritabanındaki tabloların TS tiplerini Drizzle'dan çekiyoruz
export type User = InferSelectModel<typeof users>;
export type UniversityDomain = InferSelectModel<typeof universityDomains>;
export type Role = InferSelectModel<typeof roles>;
export type Permission = InferSelectModel<typeof permissions>;
export type RolePermission = InferSelectModel<typeof rolePermissions>;

// Repository'nin, User'ı kaydederken beklediği veri yapısı
export interface CreateUserPayload {
  universityId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  studentNumber?: string | null;
  status: "pending" | "active" | "suspended";
}