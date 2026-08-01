import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { PosterQrResolveResult } from "./poster-qr.types";

export const posterQrCache = defineKeyspace(cache, "poster-qr", {
  resolve: entry<PosterQrResolveResult>()((code: string) => `resolve:${code}`, { ttlSeconds: 60 }),
});

export const posterQrEffects = {
  codeChanged: effect("poster-qr.codeChanged", (code: string) => [posterQrCache.resolve(code)]),
};
