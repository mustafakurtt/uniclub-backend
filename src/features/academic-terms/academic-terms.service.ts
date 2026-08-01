import { academicTermsRepository } from "./academic-terms.repository";
import { badRequest, notFound } from "../../shared/utils/errors";
import type { CreateAcademicTermDTO, UpdateAcademicTermDTO } from "./academic-terms.schema";

function isExclusionViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  if (e.code === "23P01" || e.cause?.code === "23P01") return true;
  return (e.message ?? "").includes("academic_terms_no_overlap");
}

function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23503" || e.cause?.code === "23503";
}

function assertValidRange(startsAt: Date, endsAt: Date) {
  if (endsAt <= startsAt) {
    throw badRequest("academicTerm.endsBeforeStarts");
  }
}

function withActiveFlag(
  term: NonNullable<Awaited<ReturnType<typeof academicTermsRepository.findInUniversity>>>
) {
  const now = Date.now();
  const isActive =
    term.status === "open" &&
    term.startsAt.getTime() <= now &&
    term.endsAt.getTime() >= now;
  return { ...term, isActive };
}

export const academicTermsService = {
  async list(universityId: string) {
    const terms = await academicTermsRepository.listByUniversity(universityId);
    return terms.map((t) => withActiveFlag(t));
  },

  async create(universityId: string, data: CreateAcademicTermDTO) {
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    assertValidRange(startsAt, endsAt);

    try {
      const row = await academicTermsRepository.create(universityId, data);
      return withActiveFlag(row);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw badRequest("academicTerm.overlap");
      }
      throw err;
    }
  },

  async update(universityId: string, termId: string, data: UpdateAcademicTermDTO) {
    const existing = await academicTermsRepository.findInUniversity(universityId, termId);
    if (!existing) {
      throw notFound("academicTerm.notFound");
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
    assertValidRange(startsAt, endsAt);

    try {
      const row = await academicTermsRepository.update(termId, data);
      if (!row) throw notFound("academicTerm.notFound");
      return withActiveFlag(row);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw badRequest("academicTerm.overlap");
      }
      throw err;
    }
  },

  async delete(universityId: string, termId: string) {
    const existing = await academicTermsRepository.findInUniversity(universityId, termId);
    if (!existing) {
      throw notFound("academicTerm.notFound");
    }

    const linked = await academicTermsRepository.countMembershipEvents(termId);
    if (linked > 0) {
      throw badRequest("academicTerm.hasHistory");
    }

    try {
      await academicTermsRepository.delete(termId);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw badRequest("academicTerm.hasHistory");
      }
      throw err;
    }
  },

  resolveActiveTermId(universityId: string, at: Date = new Date()) {
    return academicTermsRepository.findActiveAt(universityId, at).then((t) => t?.id ?? null);
  },
};
