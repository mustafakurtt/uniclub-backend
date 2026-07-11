import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../../core/http/errors";
import type { MessageKey } from "../i18n/messages";

/**
 * Core HttpError sınıflarının bu projeye özel, TİPLİ fabrikaları. `key` yalnızca
 * geçerli bir `MessageKey` olabilir → yazım hatalı/var olmayan anahtar DERLEME
 * hatasıdır (aynı `*.permissions.ts` typo-güvenliği). `params` şablon
 * interpolasyonu içindir (örn. { domain }). Servisler `new NotFoundError(...)`
 * yerine bunları kullanır.
 */
interface ErrorFactoryOptions {
  params?: Record<string, unknown>;
  cause?: unknown;
}

export const badRequest = (key: MessageKey, options?: ErrorFactoryOptions) =>
  new BadRequestError(key, options);
export const unauthorized = (key: MessageKey, options?: ErrorFactoryOptions) =>
  new UnauthorizedError(key, options);
export const forbidden = (key: MessageKey, options?: ErrorFactoryOptions) =>
  new ForbiddenError(key, options);
export const notFound = (key: MessageKey, options?: ErrorFactoryOptions) =>
  new NotFoundError(key, options);
export const conflict = (key: MessageKey, options?: ErrorFactoryOptions) =>
  new ConflictError(key, options);
