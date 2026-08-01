import { clubsRepository } from "../clubs/clubs.repository";
import { clubEffects } from "../clubs/clubs.cache";
import { generalMeetingsService } from "../general-meetings/general-meetings.service";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import { handoverRepository } from "./handover.repository";
import type { CreateHandoverRecordDTO } from "./handover.schema";

function mapRecord(
  record: NonNullable<Awaited<ReturnType<typeof handoverRepository.findByIdInClub>>>
) {
  return {
    id: record.id,
    clubId: record.clubId,
    handoverAt: record.handoverAt,
    academicTerm: record.academicTerm
      ? { id: record.academicTerm.id, name: record.academicTerm.name }
      : null,
    generalMeeting: record.generalMeeting
      ? {
          id: record.generalMeeting.id,
          meetingType: record.generalMeeting.meetingType,
          heldAt: record.generalMeeting.heldAt,
          location: record.generalMeeting.location,
        }
      : null,
    recordedBy: record.recorder ? toSafeUser(record.recorder) : null,
    outgoingBoard: record.outgoingBoardSnapshot,
    incomingBoard: record.incomingBoardSnapshot,
    transferredItems: record.transferredItems,
    createdAt: record.createdAt,
  };
}

export const handoverService = {
  async create(
    universityId: string,
    clubId: string,
    actorId: string,
    data: CreateHandoverRecordDTO
  ) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const meeting = await handoverRepository.findMeetingForHandover(
      clubId,
      universityId,
      data.generalMeetingId
    );
    if (!meeting) {
      throw notFound("handover.meetingNotFound");
    }
    if (meeting.boardMemberships.length === 0) {
      throw badRequest("handover.meetingWithoutBoard");
    }

    const existing = await handoverRepository.findByMeetingId(data.generalMeetingId);
    if (existing) {
      throw badRequest("handover.alreadyRecorded");
    }

    const handoverAt = data.handoverAt ? new Date(data.handoverAt) : new Date();
    const outgoingActive = await handoverRepository.findActiveBoardMemberships(clubId);
    const outgoingBoardSnapshot = outgoingActive.map((row) => ({
      userId: row.userId,
      boardType: row.boardType,
      seatType: row.seatType,
      title: row.title,
      fullName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
    }));

    const incomingBoardSnapshot = meeting.boardMemberships.map((row) => ({
      userId: row.userId,
      boardType: row.boardType,
      seatType: row.seatType,
      title: row.title,
      fullName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
    }));

    const transferredItems = await handoverRepository.collectTransferredItems(clubId, universityId);

    const record = await handoverRepository.executeHandover({
      clubId,
      universityId,
      academicTermId: meeting.academicTermId,
      generalMeetingId: meeting.id,
      handoverAt,
      recordedBy: actorId,
      outgoingBoardSnapshot,
      incomingBoardSnapshot,
      transferredItems,
    });

    const boardMembersForSync = meeting.boardMemberships.map((m) => ({
      userId: m.userId,
      boardType: m.boardType,
      seatType: m.seatType,
      title: m.title,
    }));

    await generalMeetingsService.syncRolesFromBoardElection(
      clubId,
      universityId,
      actorId,
      boardMembersForSync,
      meeting.academicTermId
    );

    await clubEffects.membershipChanged.emit(clubId);

    const full = await handoverRepository.findByIdInClub(clubId, record.id);
    return mapRecord(full!);
  },

  async list(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const rows = await handoverRepository.listForClub(clubId);
    return rows.map((row) => mapRecord(row as NonNullable<typeof row>));
  },

  async getById(universityId: string, clubId: string, handoverId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const record = await handoverRepository.findByIdInClub(clubId, handoverId);
    if (!record) {
      throw notFound("handover.notFound");
    }

    return mapRecord(record);
  },
};
