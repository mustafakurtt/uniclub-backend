import { db } from "../../../db";
import { universityDomains } from "../../../db/schema";
import { BaseRepository } from "../../../core/db/base.repository";
import type { DomainType, UpdateDomainPayload } from "../university.types";

/**
 * E-posta domaini veri erişimi.
 *
 * ÖNEMLİ: `domain` UNIQUE ve kayıt (register) akışı tenant'ı domainden çözüyor.
 * Bu yüzden domainlerde soft-delete KULLANMAYIZ (softDelete: false) — silinen
 * domain fiziksel gider; aksi halde (a) aynı domain yeniden eklenince unique
 * ihlali olur, (b) ölü bir domain hâlâ kayıt akışında eşleşirdi. `deleted_at`
 * kolonu şemada ileride gerekebilir diye durur ama burada kullanılmaz.
 */
class DomainRepository extends BaseRepository<typeof universityDomains, typeof db.query.universityDomains> {
  constructor() {
    super(db, universityDomains, { softDelete: false, query: db.query.universityDomains });
  }

  /** Benzersizlik kontrolü — domain sistemde herhangi bir tenant'ta kayıtlı mı? */
  findByDomain(domain: string) {
    return this.query!.findFirst({ where: { domain } });
  }

  findInUniversity(universityId: string, domainId: string) {
    return this.query!.findFirst({ where: { id: domainId, universityId } });
  }

  listByUniversity(universityId: string) {
    return this.query!.findMany({ where: { universityId } });
  }

  add(universityId: string, domain: string, domainType: DomainType) {
    return this.create({ universityId, domain, domainType });
  }

  update(domainId: string, data: UpdateDomainPayload) {
    return this.updateById(domainId, data);
  }
}

export const domainRepository = new DomainRepository();
