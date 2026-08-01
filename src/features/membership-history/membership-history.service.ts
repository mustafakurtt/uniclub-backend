import { membershipHistoryRepository, type MembershipEventInsert } from "./membership-history.repository";
import { academicTermsService } from "../academic-terms/academic-terms.service";
import { clubsRepository } from "../clubs/clubs.repository";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import type { ListMembershipHistoryQuery } from "./membership-history.schema";

async function resolveTermId(universityId: string, at: Date) {
  return await academicTermsService.resolveActiveTermId(universityId, at);
}

export const membershipHistoryService = {
  async record(params: Omit<MembershipEventInsert, "academicTermId"> & { academicTermId?: string | null }) {
    const termId =
      params.academicTermId !== undefined
        ? params.academicTermId
        : await resolveTermId(params.universityId, params.occurredAt ?? new Date());
    return membershipHistoryRepository.insertEvent({ ...params, academicTermId: termId });
  },

  async recordJoined(
    clubId: string,
    userId: string,
    universityId: string,
    role: "member" | "officer" | "president",
    actorId: string | null,
    occurredAt?: Date
  ) {
    return this.record({
      clubId,
      userId,
      universityId,
      eventType: "joined",
      role,
      actorId,
      occurredAt,
    });
  },

  async recordRoleChanged(
    clubId: string,
    userId: string,
    universityId: string,
    previousRole: "member" | "officer" | "president",
    role: "member" | "officer" | "president",
    actorId: string,
    academicTermId?: string | null
  ) {
    return this.record({
      clubId,
      userId,
      universityId,
      eventType: "role_changed",
      previousRole,
      role,
      actorId,
      academicTermId,
    });
  },

  async recordLeft(clubId: string, userId: string, universityId: string, role: "member" | "officer" | "president") {
    return this.record({
      clubId,
      userId,
      universityId,
      eventType: "left",
      role,
      actorId: userId,
    });
  },

  async recordRemoved(
    clubId: string,
    userId: string,
    universityId: string,
    role: "member" | "officer" | "president",
    actorId: string
  ) {
    return this.record({
      clubId,
      userId,
      universityId,
      eventType: "removed",
      role,
      actorId,
    });
  },

  async recordJoinRejected(
    clubId: string,
    userId: string,
    universityId: string,
    actorId: string
  ) {
    return this.record({
      clubId,
      userId,
      universityId,
      eventType: "join_rejected",
      actorId,
    });
  },

  async listForClub(universityId: string, clubId: string, query: ListMembershipHistoryQuery) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw badRequest("audit.invalidCursor");
    }

    const items = await membershipHistoryRepository.listByClub(
      clubId,
      query.limit,
      cursorDate,
      query.academicTermId
    );

    const nextCursor =
      items.length === query.limit ? items[items.length - 1].occurredAt.toISOString() : null;

    return {
      items: items.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        role: row.role,
        previousRole: row.previousRole,
        occurredAt: row.occurredAt,
        academicTermId: row.academicTermId,
        academicTerm: row.academicTerm
          ? { id: row.academicTerm.id, name: row.academicTerm.name }
          : null,
        user: row.user ? toSafeUser(row.user) : null,
        actor: row.actor ? toSafeUser(row.actor) : null,
      })),
      nextCursor,
    };
  },
};
