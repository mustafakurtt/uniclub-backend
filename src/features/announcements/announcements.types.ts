// src/features/announcements/announcements.types.ts
import { InferSelectModel } from "drizzle-orm";
import { announcements } from "../../db/schema";

export type Announcement = InferSelectModel<typeof announcements>;

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
}
