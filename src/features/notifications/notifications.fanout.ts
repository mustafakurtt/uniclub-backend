import { Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { logger } from "../../shared/logger/logger";
import { notificationsService } from "./notifications.service";
import type { CreateNotificationPayload } from "./notifications.types";

const log = logger.child({ module: "notifications.fanout" });

/** Bu eşikten büyük fan-out istek içinde senkron çalışmaz — kuyruğa alınır. */
export const NOTIFICATION_FANOUT_ASYNC_THRESHOLD = 500;

const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

export interface NotificationFanoutJob {
  userIds: string[];
  payload: CreateNotificationPayload;
}

export const notificationFanoutQueue = new Queue<NotificationFanoutJob>("notification-fanout", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const fanoutWorker = new Worker<NotificationFanoutJob>(
  "notification-fanout",
  async (job) => {
    await notificationsService.notifyManySafe(job.data.userIds, job.data.payload);
  },
  { connection, concurrency: 2 }
);

fanoutWorker.on("failed", (job, err) => {
  log.error({ err, jobId: job?.id, recipientCount: job?.data.userIds.length }, "fan-out job başarısız");
});

export async function dispatchNotificationFanout(
  userIds: string[],
  payload: CreateNotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;
  if (userIds.length > NOTIFICATION_FANOUT_ASYNC_THRESHOLD) {
    await notificationFanoutQueue.add("fanout", { userIds, payload });
    return;
  }
  await notificationsService.notifyManySafe(userIds, payload);
}

export const closeNotificationFanoutQueue = async (): Promise<void> => {
  await fanoutWorker.close();
  await notificationFanoutQueue.close();
};
