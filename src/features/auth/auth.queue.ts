import { Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { sendMail } from "../../shared/mail/mailer";
import {
  buildVerificationEmail,
  buildVerifyLink,
  buildTenantAdminInvitationEmail,
  buildTenantAdminInvitationAcceptLink,
  buildPasswordResetEmail,
  buildPasswordResetLink,
} from "./auth.email";
import { logger } from "../../shared/logger/logger";

const log = logger.child({ module: "auth.queue" });

const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

export interface VerificationEmailJob {
  email: string;
  firstName: string;
  token: string;
  locale?: string;
}

export interface TenantAdminInvitationEmailJob {
  email: string;
  firstName: string;
  token: string;
  locale?: string;
}

export interface PasswordResetEmailJob {
  email: string;
  firstName: string;
  token: string;
  locale?: string;
}

export const emailQueue = new Queue<
  VerificationEmailJob | TenantAdminInvitationEmailJob | PasswordResetEmailJob
>(
  "email-verification-queue",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

const emailWorker = new Worker<
  VerificationEmailJob | TenantAdminInvitationEmailJob | PasswordResetEmailJob
>(
  "email-verification-queue",
  async (job) => {
    if (job.name === "send-verify-email") {
      const { email, firstName, token, locale } = job.data as VerificationEmailJob;
      const { subject, html, text } = buildVerificationEmail({ firstName, token, locale });
      const info = await sendMail({ to: email, subject, html, text });
      log.info({ email, firstName, messageId: info.messageId }, "✅ doğrulama maili gönderildi");
      log.debug({ link: buildVerifyLink(token), inbox: "http://localhost:8025" }, "doğrulama linki (Mailpit)");
      return;
    }

    if (job.name === "send-tenant-admin-invitation") {
      const { email, firstName, token, locale } = job.data as TenantAdminInvitationEmailJob;
      const { subject, html, text } = buildTenantAdminInvitationEmail({ firstName, token, locale });
      const info = await sendMail({ to: email, subject, html, text });
      log.info({ email, firstName, messageId: info.messageId }, "✅ tenant admin davet maili gönderildi");
      log.debug(
        { link: buildTenantAdminInvitationAcceptLink(token), inbox: "http://localhost:8025" },
        "davet kabul linki (Mailpit)"
      );
      return;
    }

    if (job.name === "send-password-reset") {
      const { email, firstName, token, locale } = job.data as PasswordResetEmailJob;
      const { subject, html, text } = buildPasswordResetEmail({ firstName, token, locale });
      const info = await sendMail({ to: email, subject, html, text });
      log.info({ email, firstName, messageId: info.messageId }, "✅ şifre sıfırlama maili gönderildi");
      log.debug({ link: buildPasswordResetLink(token), inbox: "http://localhost:8025" }, "sıfırlama linki (Mailpit)");
      return;
    }

    log.warn({ jobName: job.name }, "bilinmeyen mail işi atlandı");
  },
  { connection }
);

emailWorker.on("failed", (job, err) => {
  const attempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;
  const willRetry = attemptsMade < attempts;
  log.error(
    { email: job?.data.email, jobName: job?.name, attemptsMade, attempts, willRetry, err },
    "❌ mail gönderilemedi"
  );
});

export const closeEmailQueue = async (): Promise<void> => {
  await emailWorker.close();
  await emailQueue.close();
};

/** Davet maili işlerini sayar (test ve rollback doğrulaması). */
export async function countTenantAdminInvitationQueueJobs(): Promise<number> {
  const jobs = await emailQueue.getJobs(["waiting", "delayed", "active"]);
  return jobs.filter((job) => job.name === "send-tenant-admin-invitation").length;
}
