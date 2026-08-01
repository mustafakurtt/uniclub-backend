import { notFound, badRequest } from "../utils/errors";
import { wallClockToUtc } from "../utils/timezone-local";
import { universityRepository } from "../../features/university/repositories/university.repository";

/**
 * Tenant yerel duvar saatini UTC anına çevirir; geçmiş reddedilir.
 */
export async function resolveScheduledPublishAt(
  universityId: string,
  localIso: string
): Promise<Date> {
  const university = await universityRepository.findById(universityId);
  if (!university) {
    throw badRequest("university.notFound");
  }

  let at: Date;
  try {
    at = wallClockToUtc(localIso, university.timezone);
  } catch {
    throw badRequest("schedule.invalidLocalTime");
  }

  if (at.getTime() <= Date.now()) {
    throw badRequest("schedule.inPast");
  }

  return at;
}
