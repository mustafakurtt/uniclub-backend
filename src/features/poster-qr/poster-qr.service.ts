import { randomBytes } from "node:crypto";
import { posterQrRepository } from "./poster-qr.repository";
import { posterQrCache, posterQrEffects } from "./poster-qr.cache";
import { badRequest, forbidden, notFound } from "../../shared/utils/errors";
import type {
  CreatePosterQrPayload,
  PosterQrActiveTarget,
  PosterQrResolveResult,
  PosterQrResolveStatus,
  UpdatePosterQrPayload,
} from "./poster-qr.types";
import type { CreatePosterQrDTO, UpdatePosterQrDTO } from "./poster-qr.schema";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

function generatePosterQrCode(): string {
  return randomBytes(12).toString("base64url");
}

function computeAvailability(row: {
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
}): PosterQrResolveStatus {
  if (row.status === "cancelled") return "cancelled";
  const now = Date.now();
  if (row.validFrom && row.validFrom.getTime() > now) return "not_yet_active";
  if (row.validUntil && row.validUntil.getTime() < now) return "expired";
  return "active";
}

async function buildActiveTarget(
  universityId: string,
  row: NonNullable<Awaited<ReturnType<typeof posterQrRepository.findByCode>>>
): Promise<PosterQrActiveTarget | null> {
  if (row.targetType === "club" && row.targetClubId) {
    const club = await posterQrRepository.findApprovedClubInUniversity(universityId, row.targetClubId);
    if (!club?.university?.slug) return null;
    return { type: "club", universitySlug: club.university.slug, clubSlug: club.slug };
  }
  if (row.targetType === "activity" && row.targetActivityId) {
    const activity = await posterQrRepository.findPublicActivityInUniversity(
      universityId,
      row.targetActivityId
    );
    const hostLink = activity?.activityClubs.find(
      (ac) => ac.club?.universityId === universityId && ac.club?.university?.slug
    );
    if (!hostLink?.club?.university?.slug) return null;
    return {
      type: "activity",
      universitySlug: hostLink.club.university.slug,
      activityId: row.targetActivityId,
    };
  }
  return null;
}

function toDto(row: NonNullable<Awaited<ReturnType<typeof posterQrRepository.findById>>>) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    sourceLabel: row.sourceLabel,
    targetType: row.targetType,
    targetClubId: row.targetClubId,
    targetActivityId: row.targetActivityId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    scanCount: row.scanCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertTargetPayload(payload: CreatePosterQrPayload | UpdatePosterQrDTO) {
  if (payload.targetType === "club" && !payload.targetClubId) {
    throw badRequest("posterQr.clubTargetRequired");
  }
  if (payload.targetType === "activity" && !payload.targetActivityId) {
    throw badRequest("posterQr.activityTargetRequired");
  }
}

async function assertClubTargetInTenant(universityId: string, clubId: string) {
  const club = await posterQrRepository.findApprovedClubInUniversity(universityId, clubId);
  if (!club) {
    throw notFound("club.notFound");
  }
}

async function assertActivityTargetInTenant(universityId: string, activityId: string) {
  const activity = await posterQrRepository.findPublicActivityInUniversity(universityId, activityId);
  if (!activity) {
    throw notFound("activity.notFound");
  }
}

async function assertActivityHostedByClub(clubId: string, activityId: string) {
  const link = await posterQrRepository.isActivityHostedByClub(activityId, clubId);
  if (!link) {
    throw forbidden("activity.notAHostClub");
  }
}

export const posterQrService = {
  async createForClub(clubId: string, universityId: string, createdBy: string, data: CreatePosterQrDTO) {
    assertTargetPayload(data);
    if (data.targetType === "club") {
      if (data.targetClubId !== clubId) {
        throw forbidden("posterQr.clubTargetMismatch");
      }
      await assertClubTargetInTenant(universityId, clubId);
    } else {
      await assertActivityHostedByClub(clubId, data.targetActivityId!);
      await assertActivityTargetInTenant(universityId, data.targetActivityId!);
    }

    const row = await this.createWithUniqueCode(universityId, createdBy, data);
    return toDto(row);
  },

  async createForUniversity(universityId: string, createdBy: string, data: CreatePosterQrDTO) {
    assertTargetPayload(data);
    if (data.targetType === "club") {
      await assertClubTargetInTenant(universityId, data.targetClubId!);
    } else {
      await assertActivityTargetInTenant(universityId, data.targetActivityId!);
    }

    const row = await this.createWithUniqueCode(universityId, createdBy, data);
    return toDto(row);
  },

  async createWithUniqueCode(
    universityId: string,
    createdBy: string,
    data: CreatePosterQrDTO
  ) {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generatePosterQrCode();
      try {
        const row = await posterQrRepository.create(universityId, code, createdBy, data);
        if (!row) throw badRequest("posterQr.createFailed");
        return row;
      } catch (err) {
        if (attempt === MAX_CODE_GENERATION_ATTEMPTS - 1) throw err;
        // unique violation → yeniden dene
      }
    }
    throw badRequest("posterQr.createFailed");
  },

  async updateForClub(
    clubId: string,
    universityId: string,
    qrId: string,
    data: UpdatePosterQrDTO
  ) {
    const row = await posterQrRepository.findById(qrId);
    if (!row || row.universityId !== universityId) {
      throw notFound("posterQr.notFound");
    }
    if (data.targetType === "club" || data.targetClubId) {
      const targetClubId = data.targetClubId ?? row.targetClubId;
      if (targetClubId !== clubId) {
        throw forbidden("posterQr.clubTargetMismatch");
      }
    }
    if (data.targetType === "activity" || data.targetActivityId) {
      const activityId = data.targetActivityId ?? row.targetActivityId;
      if (!activityId) throw badRequest("posterQr.activityTargetRequired");
      await assertActivityHostedByClub(clubId, activityId);
    }
    if (data.targetType) assertTargetPayload(data);

    const updated = await posterQrRepository.update(qrId, data);
    if (!updated) throw notFound("posterQr.notFound");
    await posterQrEffects.codeChanged.emit(updated.code);
    return toDto(updated);
  },

  async updateForUniversity(universityId: string, qrId: string, data: UpdatePosterQrDTO) {
    const row = await posterQrRepository.findById(qrId);
    if (!row || row.universityId !== universityId) {
      throw notFound("posterQr.notFound");
    }
    if (data.targetType) assertTargetPayload(data);
    if (data.targetClubId) {
      await assertClubTargetInTenant(universityId, data.targetClubId);
    }
    if (data.targetActivityId) {
      await assertActivityTargetInTenant(universityId, data.targetActivityId);
    }

    const updated = await posterQrRepository.update(qrId, data);
    if (!updated) throw notFound("posterQr.notFound");
    await posterQrEffects.codeChanged.emit(updated.code);
    return toDto(updated);
  },

  async cancelForClub(clubId: string, universityId: string, qrId: string) {
    const row = await posterQrRepository.findById(qrId);
    if (!row || row.universityId !== universityId) {
      throw notFound("posterQr.notFound");
    }
    if (row.targetClubId === clubId) {
      // kulüp sayfası hedefi — doğrudan
    } else if (row.targetActivityId) {
      await assertActivityHostedByClub(clubId, row.targetActivityId);
    } else {
      throw forbidden("posterQr.clubTargetMismatch");
    }

    const cancelled = await posterQrRepository.cancel(qrId);
    if (!cancelled) throw notFound("posterQr.notFound");
    await posterQrEffects.codeChanged.emit(cancelled.code);
    return toDto(cancelled);
  },

  async cancelForUniversity(universityId: string, qrId: string) {
    const row = await posterQrRepository.findById(qrId);
    if (!row || row.universityId !== universityId) {
      throw notFound("posterQr.notFound");
    }
    const cancelled = await posterQrRepository.cancel(qrId);
    if (!cancelled) throw notFound("posterQr.notFound");
    await posterQrEffects.codeChanged.emit(cancelled.code);
    return toDto(cancelled);
  },

  listForClub(clubId: string) {
    return posterQrRepository.listForClub(clubId).then((rows) => rows.map(toDto));
  },

  listForUniversity(universityId: string) {
    return posterQrRepository.listByUniversity(universityId).then((rows) => rows.map(toDto));
  },

  async resolve(code: string): Promise<PosterQrResolveResult> {
    const row = await posterQrRepository.findByCode(code);
    if (!row) {
      throw notFound("posterQr.notFound");
    }

    const availability = computeAvailability(row);
    if (availability !== "active") {
      return { status: availability };
    }

    const result = await posterQrCache.resolve(code).read(async () => {
      const target = await buildActiveTarget(row.universityId, row);
      if (!target) {
        throw notFound("posterQr.notFound");
      }
      return { status: "active", target };
    });

    await this.recordScanSafe(row.id);
    return result;
  },

  async recordScanSafe(qrCodeId: string) {
    try {
      await posterQrRepository.recordScan(qrCodeId);
    } catch {
      // fail-open — çözümleme yolunu yavaşlatmaz / düşürmez
    }
  },
};
