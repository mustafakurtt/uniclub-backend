import { Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { sendMail } from "../../shared/mail/mailer";
import { buildVerificationEmail, buildVerifyLink } from "./auth.email";
import { logger } from "../../shared/logger/logger";

const log = logger.child({ module: "auth.queue" });

/**
 * E-posta doğrulama kuyruğu.
 *
 * Mail gönderimi kayıt isteğinin İÇİNDE yapılmaz: SMTP yavaş ya da erişilemez
 * olduğunda kullanıcı kaydı bekletilmemeli/başarısız olmamalıdır. Kayıt anında
 * kuyruğa bir iş atılır; gönderim arka planda, yeniden denemeli olarak yapılır.
 */

// Redis bağlantısı env'den türetilir (eskiden 127.0.0.1:6379 hardcode'du).
// BullMQ'ya IORedis örneği değil, seçenek objesi veriyoruz: worker'ın ihtiyacı
// olan bloklayan bağlantıyı kendisi açsın (paylaşılan client'ı bloklamasın).
const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  // BullMQ worker'ları bloklayan komut kullanır; ioredis'in istek başına yeniden
  // deneme limiti kapalı olmalıdır, aksi halde worker "max retries" ile düşer.
  maxRetriesPerRequest: null,
};

export interface VerificationEmailJob {
  email: string;
  firstName: string;
  token: string;
}

export const emailQueue = new Queue<VerificationEmailJob>("email-verification-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 }, // 3sn → 6sn → 12sn
    removeOnComplete: 100, // kuyruğu şişirmemek için son 100 başarılı işi tut
    removeOnFail: 500,
  },
});

const emailWorker = new Worker<VerificationEmailJob>(
  "email-verification-queue",
  async (job) => {
    const { email, firstName, token } = job.data;
    const { subject, html, text } = buildVerificationEmail({ firstName, token });

    const info = await sendMail({ to: email, subject, html, text });

    log.info({ email, firstName, messageId: info.messageId }, "✅ doğrulama maili gönderildi");
    // debug seviyesi zaten dev'de açık, prod'da kapalı — manuel NODE_ENV kontrolüne gerek yok.
    log.debug({ link: buildVerifyLink(token), inbox: "http://localhost:8025" }, "doğrulama linki (Mailpit)");
  },
  { connection }
);

emailWorker.on("failed", (job, err) => {
  const attempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;
  const willRetry = attemptsMade < attempts;
  log.error(
    { email: job?.data.email, attemptsMade, attempts, willRetry, err },
    "❌ doğrulama maili gönderilemedi"
  );
});

/**
 * Graceful shutdown için kuyruğu düzgün kapatır: worker önce (işlenen job'un
 * bitmesini bekler, yenisini almaz), sonra queue. Bkz. index.ts shutdown kaydı.
 */
export const closeEmailQueue = async (): Promise<void> => {
  await emailWorker.close();
  await emailQueue.close();
};
