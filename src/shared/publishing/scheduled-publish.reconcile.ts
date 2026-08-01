import { logger } from "../logger/logger";
import { announcementsRepository } from "../../features/announcements/announcements.repository";
import { activitiesRepository } from "../../features/activities/activities.repository";
import { announcementsService } from "../../features/announcements/announcements.service";
import { activitiesService } from "../../features/activities/activities.service";
import {
  enqueueScheduledPublish,
  hasScheduledPublishJob,
  type ScheduledPublishKind,
} from "./scheduled-publish.queue";

const log = logger.child({ module: "scheduled-publish.reconcile" });

/** Uzun süre ayakta süreçte Redis iş kaybını telafi — 3 dk (açılış taraması restart'ı kapsar). */
export const SCHEDULED_PUBLISH_RECONCILE_INTERVAL_MS = 3 * 60 * 1000;

type ScheduledRow = { id: string; scheduledPublishAt: Date };

async function reconcileKind(
  kind: ScheduledPublishKind,
  rows: ScheduledRow[],
  publish: (id: string) => Promise<void>
): Promise<{ published: number; requeued: number }> {
  let published = 0;
  let requeued = 0;
  const now = Date.now();

  for (const row of rows) {
    const at = row.scheduledPublishAt;
    if (!at) continue;

    if (at.getTime() <= now) {
      await publish(row.id);
      published++;
      continue;
    }

    if (!(await hasScheduledPublishJob(kind, row.id))) {
      await enqueueScheduledPublish(kind, row.id, at);
      requeued++;
    }
  }

  return { published, requeued };
}

/**
 * Postgres'teki zamanlanmış taslakları BullMQ ile mutabakat eder.
 * Fail-open: hata fırlatmaz, açılış/periyodik tetikleyici loglar ve devam eder.
 */
export async function reconcileScheduledPublishes(): Promise<void> {
  try {
    const [announcementRows, activityRows] = await Promise.all([
      announcementsRepository.findScheduledDrafts(),
      activitiesRepository.findScheduledDrafts(),
    ]);

    const annRows = announcementRows.filter((r) => r.scheduledPublishAt != null) as ScheduledRow[];
    const actRows = activityRows.filter((r) => r.scheduledPublishAt != null) as ScheduledRow[];

    const ann = await reconcileKind("announcement", annRows, announcementsService.publishScheduled);
    const act = await reconcileKind("activity", actRows, activitiesService.publishScheduled);

    const totalPublished = ann.published + act.published;
    const totalRequeued = ann.requeued + act.requeued;

    if (totalPublished > 0 || totalRequeued > 0) {
      log.info(
        {
          announcementsPublished: ann.published,
          announcementsRequeued: ann.requeued,
          activitiesPublished: act.published,
          activitiesRequeued: act.requeued,
        },
        "zamanlanmış yayın mutabakatı tamamlandı"
      );
    }
  } catch (err) {
    log.warn({ err }, "zamanlanmış yayın mutabakatı atlandı (fail-open)");
  }
}
