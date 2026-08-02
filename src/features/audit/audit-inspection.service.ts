import { academicTermsRepository } from "../academic-terms/academic-terms.repository";
import { auditInspectionRepository } from "./audit-inspection.repository";
import type { AuditActivitySummary, AuditDecisionActor, AuditDecisionListItem } from "./audit-inspection.types";
import type { AuditDecisionListQuery, AuditPeriodQuery } from "./audit-inspection.schema";
import {
  decodeAuditDecisionCursor,
  encodeAuditDecisionCursor,
} from "./audit-inspection.cursor";
import { extractDecisionNote, resolveDecisionActionLabel } from "./audit-decisions";
import { badRequest, notFound } from "../../shared/utils/errors";

function toDecisionActor(
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    deletedAt: Date | null;
  } | null
): AuditDecisionActor | null {
  if (!actor?.id) return null;
  if (actor.deletedAt) {
    return { id: actor.id, displayName: null, anonymized: true };
  }
  const displayName = `${actor.firstName} ${actor.lastName}`.trim();
  return { id: actor.id, displayName, anonymized: false };
}

async function resolvePeriodBounds(
  universityId: string,
  query: AuditPeriodQuery
): Promise<{ from: Date; to: Date; academicTermId: string | null; academicTermName: string | null }> {
  let from: Date | undefined = query.from ? new Date(query.from) : undefined;
  let to: Date | undefined = query.to ? new Date(query.to) : undefined;
  let academicTermId: string | null = null;
  let academicTermName: string | null = null;

  if (query.academicTermId) {
    const term = await academicTermsRepository.findInUniversity(universityId, query.academicTermId);
    if (!term) {
      throw notFound("academicTerm.notFound");
    }
    academicTermId = term.id;
    academicTermName = term.name;
    from = term.startsAt;
    to = term.endsAt;
  }

  if (!from || !to) {
    throw badRequest("audit.periodRequired");
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("audit.invalidPeriod");
  }

  if (from > to) {
    throw badRequest("audit.invalidPeriod");
  }

  // İsteğe bağlı from/to ile akademik dönem aralığını daralt.
  if (query.from) {
    const explicitFrom = new Date(query.from);
    if (explicitFrom > from) from = explicitFrom;
  }
  if (query.to) {
    const explicitTo = new Date(query.to);
    if (explicitTo < to) to = explicitTo;
  }

  return { from, to, academicTermId, academicTermName };
}

export const auditInspectionService = {
  async getSummary(universityId: string, query: AuditPeriodQuery): Promise<AuditActivitySummary> {
    const period = await resolvePeriodBounds(universityId, query);
    const counts = await auditInspectionRepository.countActivitySummary(universityId, period);

    return {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        academicTermId: period.academicTermId,
        academicTermName: period.academicTermName,
      },
      counts,
    };
  },

  async listDecisions(universityId: string, query: AuditDecisionListQuery) {
    let cursor: { createdAt: Date; id: string } | undefined;
    if (query.cursor) {
      const decoded = decodeAuditDecisionCursor(query.cursor);
      if (!decoded) {
        throw badRequest("audit.invalidCursor");
      }
      cursor = decoded;
    }

    const period = await resolvePeriodBounds(universityId, query);
    const rows = await auditInspectionRepository.listDecisions(
      universityId,
      period,
      query.limit,
      cursor,
      { actorId: query.actorId, targetId: query.targetId }
    );

    const items: AuditDecisionListItem[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      actionLabel: resolveDecisionActionLabel(row),
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
      actor: toDecisionActor(row.actor),
      note: extractDecisionNote(row.metadata),
    }));

    const last = items[items.length - 1];
    const nextCursor =
      items.length === query.limit && last
        ? encodeAuditDecisionCursor(last.createdAt, last.id)
        : null;

    return {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        academicTermId: period.academicTermId,
        academicTermName: period.academicTermName,
      },
      items,
      nextCursor,
    };
  },
};
