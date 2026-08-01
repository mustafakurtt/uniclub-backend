import { clubsRepository } from "../clubs/clubs.repository";
import { membershipHistoryService } from "../membership-history/membership-history.service";
import { clubEffects } from "../clubs/clubs.cache";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import { generalMeetingsRepository } from "./general-meetings.repository";
import type { CreateGeneralMeetingDTO } from "./general-meetings.schema";

const OFFICER_BOARD_TITLES = new Set(["vice_president", "secretary", "treasurer"]);

function mapMeetingSummary(
  meeting: Awaited<ReturnType<typeof generalMeetingsRepository.findMeetingInClub>>,
  quorumPercent: number,
  attendeeCount: number,
  memberCount: number
) {
  if (!meeting) return null;
  const quorumRequired =
    memberCount > 0 ? Math.ceil((memberCount * quorumPercent) / 100) : 0;
  return {
    id: meeting.id,
    clubId: meeting.clubId,
    meetingType: meeting.meetingType,
    heldAt: meeting.heldAt,
    location: meeting.location,
    decisions: meeting.decisions,
    recordedBy: meeting.recorder ? toSafeUser(meeting.recorder) : null,
    createdAt: meeting.createdAt,
    academicTerm: meeting.academicTerm
      ? { id: meeting.academicTerm.id, name: meeting.academicTerm.name }
      : null,
    attendeeCount,
    memberCount,
    quorumPercent,
    quorumRequired,
    quorumMet: attendeeCount >= quorumRequired,
    attendees: meeting.attendees.map((a) => (a.user ? toSafeUser(a.user) : null)).filter(Boolean),
    boardMembers: meeting.boardMemberships.map((b) => ({
      id: b.id,
      userId: b.userId,
      user: b.user ? toSafeUser(b.user) : null,
      boardType: b.boardType,
      seatType: b.seatType,
      title: b.title,
      endedAt: b.endedAt,
    })),
  };
}

function mapBoardMember(
  row: Awaited<ReturnType<typeof generalMeetingsRepository.findActiveBoardMemberships>>[number]
) {
  return {
    id: row.id,
    userId: row.userId,
    boardType: row.boardType,
    seatType: row.seatType,
    title: row.title,
    user: row.user ? toSafeUser(row.user) : null,
  };
}

export const generalMeetingsService = {
  async create(universityId: string, clubId: string, actorId: string, data: CreateGeneralMeetingDTO) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const term = await generalMeetingsRepository.findTermInUniversity(universityId, data.academicTermId);
    if (!term) {
      throw notFound("generalMeeting.termNotFound");
    }

    const approvedMembers = await generalMeetingsRepository.countApprovedMembers(clubId);
    const approvedIds = new Set(approvedMembers.map((m) => m.userId));

    for (const userId of data.attendeeUserIds) {
      if (!approvedIds.has(userId)) {
        throw badRequest("generalMeeting.invalidAttendees");
      }
    }

    for (const member of data.boardMembers) {
      if (!approvedIds.has(member.userId)) {
        throw badRequest("generalMeeting.invalidBoardMembers");
      }
    }

    const principalPresidents = data.boardMembers.filter(
      (m) =>
        m.boardType === "management" && m.seatType === "principal" && m.title === "president"
    );
    if (principalPresidents.length > 1) {
      throw badRequest("generalMeeting.duplicateBoardPresident");
    }

    const settings = await getTenantSettings(universityId);
    const memberCount = approvedMembers.length;
    const quorumRequired =
      memberCount > 0
        ? Math.ceil((memberCount * settings.clubGeneralMeetingQuorumPercent) / 100)
        : 0;
    if (data.attendeeUserIds.length < quorumRequired) {
      throw badRequest("generalMeeting.quorumNotMet");
    }

    const boardTypesToReplace = [...new Set(data.boardMembers.map((m) => m.boardType))];

    const { meeting, boardRows } = await generalMeetingsRepository.createMeeting(
      clubId,
      universityId,
      actorId,
      data,
      boardTypesToReplace
    );

    await this.syncRolesFromBoardElection(
      clubId,
      universityId,
      actorId,
      data.boardMembers,
      data.academicTermId
    );

    const full = await generalMeetingsRepository.findMeetingInClub(clubId, meeting.id);
    await clubEffects.membershipChanged.emit(clubId);

    return mapMeetingSummary(
      full,
      settings.clubGeneralMeetingQuorumPercent,
      data.attendeeUserIds.length,
      memberCount
    );
  },

  async list(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const settings = await getTenantSettings(universityId);
    const meetings = await generalMeetingsRepository.listMeetingsForClub(clubId);
    const attendeeCounts = await generalMeetingsRepository.countAttendeesByMeetingIds(
      meetings.map((m) => m.id)
    );
    const memberCount = (await generalMeetingsRepository.countApprovedMembers(clubId)).length;

    return meetings.map((m) => ({
      id: m.id,
      meetingType: m.meetingType,
      heldAt: m.heldAt,
      location: m.location,
      academicTerm: m.academicTerm ? { id: m.academicTerm.id, name: m.academicTerm.name } : null,
      quorumPercent: settings.clubGeneralMeetingQuorumPercent,
      memberCount,
      attendeeCount: attendeeCounts.get(m.id) ?? 0,
    }));
  },

  async getCurrentBoard(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const rows = await generalMeetingsRepository.findActiveBoardMemberships(clubId);
    const managementPrincipal = rows
      .filter((r) => r.boardType === "management" && r.seatType === "principal")
      .map(mapBoardMember);
    const managementAlternate = rows
      .filter((r) => r.boardType === "management" && r.seatType === "alternate")
      .map(mapBoardMember);
    const auditPrincipal = rows
      .filter((r) => r.boardType === "audit" && r.seatType === "principal")
      .map(mapBoardMember);
    const auditAlternate = rows
      .filter((r) => r.boardType === "audit" && r.seatType === "alternate")
      .map(mapBoardMember);

    return {
      management: { principal: managementPrincipal, alternate: managementAlternate },
      audit: { principal: auditPrincipal, alternate: auditAlternate },
    };
  },

  async getById(universityId: string, clubId: string, meetingId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const meeting = await generalMeetingsRepository.findMeetingInClub(clubId, meetingId);
    if (!meeting) {
      throw notFound("generalMeeting.notFound");
    }

    const settings = await getTenantSettings(universityId);
    const memberCount = (await generalMeetingsRepository.countApprovedMembers(clubId)).length;

    return mapMeetingSummary(
      meeting,
      settings.clubGeneralMeetingQuorumPercent,
      meeting.attendees.length,
      memberCount
    );
  },

  /**
   * Yönetim kurulu seçimi → kulüp üye rolü senkronu (president/officer).
   * Mevcut `transfer-presidency` akışı ayrı kalır; burada genel kurul seçimi.
   */
  async syncRolesFromBoardElection(
    clubId: string,
    universityId: string,
    actorId: string,
    boardMembers: CreateGeneralMeetingDTO["boardMembers"],
    academicTermId: string
  ) {
    const managementPrincipal = boardMembers.filter(
      (m) => m.boardType === "management" && m.seatType === "principal"
    );

    const electedPresident = managementPrincipal.find((m) => m.title === "president");
    if (electedPresident) {
      const currentPresident = await generalMeetingsRepository.findPresidentMember(clubId);
      if (currentPresident && currentPresident.userId !== electedPresident.userId) {
        await generalMeetingsRepository.updateMemberRole(clubId, currentPresident.userId, "officer");
        await membershipHistoryService.recordRoleChanged(
          clubId,
          currentPresident.userId,
          universityId,
          "president",
          "officer",
          actorId,
          academicTermId
        );
      }

      const target = await generalMeetingsRepository.findMembership(clubId, electedPresident.userId);
      if (target && target.status === "approved" && target.role !== "president") {
        await generalMeetingsRepository.updateMemberRole(clubId, electedPresident.userId, "president");
        await membershipHistoryService.recordRoleChanged(
          clubId,
          electedPresident.userId,
          universityId,
          target.role,
          "president",
          actorId,
          academicTermId
        );
      }
    }

    for (const member of managementPrincipal) {
      if (!OFFICER_BOARD_TITLES.has(member.title)) continue;
      const membership = await generalMeetingsRepository.findMembership(clubId, member.userId);
      if (membership && membership.status === "approved" && membership.role === "member") {
        await generalMeetingsRepository.updateMemberRole(clubId, member.userId, "officer");
        await membershipHistoryService.recordRoleChanged(
          clubId,
          member.userId,
          universityId,
          "member",
          "officer",
          actorId,
          academicTermId
        );
      }
    }
  },
};
