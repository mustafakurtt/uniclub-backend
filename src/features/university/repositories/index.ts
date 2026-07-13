/**
 * university feature'ının veri erişim katmanı — kaynak başına bir repository.
 * Hepsi core/db/BaseRepository'yi extend eder: mekanik CRUD + soft delete +
 * transaction miras alınır, yalnızca ilişkisel/özel sorgular sınıflarda yazılır.
 */
export { universityRepository } from "./university.repository";
export { domainRepository } from "./domain.repository";
export { facultyRepository } from "./faculty.repository";
export { departmentRepository } from "./department.repository";
