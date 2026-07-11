import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Taşınabilir HTTP hata sözleşmesi. core/ proje-bağımsız kalır: bu sınıflar dil
 * BİLMEZ, mesajı çağıran verir (Türkçe metinler feature katmanında kalır).
 *
 * Kritik fikir: iş kuralı hataları artık status'unu KENDİ taşır. Eskiden merkezi
 * katman status'u mesaj metninden ("bulunamadı" → 404) çıkarıyordu; bu çıkarım
 * dile yapışıktı ve başka bir projeye/dile taşınamıyordu. Açık `status` alanı bu
 * bağımlılığı ortadan kaldırır.
 *
 * `expose`: mesaj istemciye gösterilmeye güvenli mi? HttpError'lar bilinçli
 * fırlatıldığı için varsayılan `true`. Altyapı hataları (pg, drizzle, TypeError...)
 * bu sınıftan TÜREMEZ; merkezi handler onları jenerik 500'e düşürür, mesaj sızmaz.
 *
 * `code`: opsiyonel makine-okur kod — frontend'in mesajı string eşleştirmeden
 * ayırt edebilmesi için (örn. "EMAIL_NOT_VERIFIED").
 */
export interface HttpErrorOptions {
  code?: string;
  expose?: boolean;
  cause?: unknown;
}

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code?: string;
  readonly expose: boolean;

  constructor(status: ContentfulStatusCode, message: string, options?: HttpErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    // new.target: alt sınıftan çağrılınca "NotFoundError" vb. verir.
    this.name = new.target.name;
    this.status = status;
    this.code = options?.code;
    this.expose = options?.expose ?? true;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, options?: HttpErrorOptions) {
    super(400, message, options);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string, options?: HttpErrorOptions) {
    super(401, message, options);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, options?: HttpErrorOptions) {
    super(403, message, options);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, options?: HttpErrorOptions) {
    super(404, message, options);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, options?: HttpErrorOptions) {
    super(409, message, options);
  }
}

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;
