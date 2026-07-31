import { Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { logger } from "../logger/logger";
import { announcementsService } from "../../features/announcements/announcements.service";
import { activitiesService } from "../../features/activities/activities.service";

const log = logger.child({ module: "scheduled-publish.queue" });

const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

export type ScheduledPublishKind = "announcement" | "activity";

export interface ScheduledPublishJob {
  id: string;
}

export const scheduledPublishQueue = new Queue<ScheduledPublishJob>("scheduled-publish", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

function jobIdFor(kind: ScheduledPublishKind, id: string) {
  return `${kind}-${id}`;
}

/** Gecikmeli yayın job'u — aynı id ile yeniden ekleme eski job'ı değiştirir (tarih güncelleme). */
export async function enqueueScheduledPublish(
  kind: ScheduledPublishKind,
  id: string,
  at: Date
): Promise<void> {
  const delay = Math.max(0, at.getTime() - Date.now());
  const jobId = jobIdFor(kind, id);
  const existing = await scheduledPublishQueue.getJob(jobId);
  if (existing) {
    await existing.remove();
  }
  await scheduledPublishQueue.add(kind, { id }, { delay, jobId });
}

export async function cancelScheduledPublish(kind: ScheduledPublishKind, id: string): Promise<void> {
  const job = await scheduledPublishQueue.getJob(jobIdFor(kind, id));
  if (job) {
    await job.remove();
  }
}

const scheduledPublishWorker = new Worker<ScheduledPublishJob>(
  "scheduled-publish",
  async (job) => {
    if (job.name === "announcement") {
      await announcementsService.publishScheduled(job.data.id);
      return;
    }
    if (job.name === "activity") {
      await activitiesService.publishScheduled(job.data.id);
      return;
    }
    log.warn({ jobName: job.name }, "bilinmeyen zamanlanmış yayın işi atlandı");
  },
  { connection, concurrency: 2 }
);

scheduledPublishWorker.on("failed", (job, err) => {
  log.error({ err, jobId: job?.id, kind: job?.name, entityId: job?.data.id }, "zamanlanmış yayın başarısız");
});

export const closeScheduledPublishQueue = async (): Promise<void> => {
  await scheduledPublishWorker.close();
  await scheduledPublishQueue.close();
};
