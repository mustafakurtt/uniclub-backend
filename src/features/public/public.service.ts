import { publicRepository } from "./public.repository";
import { publicCache } from "./public.cache";
import { toPublicActivityDetail, toPublicClubPage } from "./public.dto";
import { notFound } from "../../shared/utils/errors";

function isPublicActivityInUniversity(
  detail: NonNullable<Awaited<ReturnType<typeof publicRepository.findActivityDetail>>>,
  universityId: string
): boolean {
  if (detail.status !== "published" || detail.visibility !== "university") {
    return false;
  }
  return detail.activityClubs.some(
    (ac) => ac.status === "accepted" && ac.club?.universityId === universityId
  );
}

export const publicService = {
  async getClubPage(universitySlug: string, clubSlug: string) {
    const university = await publicRepository.findActiveUniversityBySlug(universitySlug);
    if (!university) {
      throw notFound("club.notFound");
    }

    return publicCache.club(university.id, clubSlug).read(async () => {
      const club = await publicRepository.findApprovedClubBySlug(university.id, clubSlug);
      if (!club) {
        throw notFound("club.notFound");
      }

      const contactLinks = await publicRepository.findClubContactLinks(club.id);
      const upcoming = await publicRepository.findUpcomingPublicActivitiesForClub(club.id);

      return toPublicClubPage(university, club, contactLinks, upcoming);
    });
  },

  async getActivity(universitySlug: string, activityId: string) {
    const university = await publicRepository.findActiveUniversityBySlug(universitySlug);
    if (!university) {
      throw notFound("activity.notFound");
    }

    return publicCache.activity(university.id, activityId).read(async () => {
      const detail = await publicRepository.findActivityDetail(activityId);
      if (!detail || !isPublicActivityInUniversity(detail, university.id)) {
        throw notFound("activity.notFound");
      }
      return toPublicActivityDetail(detail);
    });
  },
};
