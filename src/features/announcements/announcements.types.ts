import { InferSelectModel } from "drizzle-orm";
import { announcements } from "../../db/schema";

export type Announcement = InferSelectModel<typeof announcements>;
export type AnnouncementStatus = Announcement["status"];
export type AnnouncementVisibility = Announcement["visibility"];

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
  visibility: AnnouncementVisibility;
  pinned: boolean;
  publish: boolean;
  scheduledPublishAt?: Date | null;
}

export interface UpdateAnnouncementPayload {
  pinned?: boolean;
  visibility?: AnnouncementVisibility;
  scheduledPublishAt?: Date | null;
}
