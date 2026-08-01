import { describe, it, expect } from "bun:test";
import {
  findExpiredReleaseFlags,
  findReleaseFlagsMissingSunset,
  isReleaseSunsetExpired,
} from "../../src/features/tenant-settings/tenant-settings.release-check";

describe("özellik bayrağı release sunset kontrolü", () => {
  it("geçmiş sunsetAfter → süresi dolmuş", () => {
    expect(isReleaseSunsetExpired("2020-01-01", new Date("2026-07-31"))).toBe(true);
  });

  it("gelecek sunsetAfter → geçerli", () => {
    expect(isReleaseSunsetExpired("2099-12-31", new Date("2026-07-31"))).toBe(false);
  });

  it("katalogda süresi dolmuş release bayrağı yok", () => {
    expect(findExpiredReleaseFlags(new Date("2026-07-31"))).toEqual([]);
    expect(findReleaseFlagsMissingSunset()).toEqual([]);
  });
});
