import { Hono } from "hono";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { universitiesRoutes } from "./routes/universities.routes";
import { domainsRoutes } from "./routes/domains.routes";
import { facultiesRoutes } from "./routes/faculties.routes";
import { departmentsRoutes } from "./routes/departments.routes";

/**
 * university feature'ının kök router'ı — `/api/universities` altına mount edilir
 * (index.ts). Endpoint sayısı büyüdüğü için rotalar alt-kaynağa göre ayrı
 * dosyalara bölündü (universities / domains / faculties / departments) ve burada
 * tek noktadan birleştirildi. Her alt-router kendi path prefix'ini (`/`,
 * `/:universityId/domains`, ...) içinde tanımladığı için hepsi "/" köküne mount
 * edilir; Hono, segment sayısına göre çakışmayan pattern'leri doğru eşler.
 *
 * GET rotaları public'tir; yazma rotaları granüler `university.*` izinleriyle
 * korunur (bkz. university.permissions.ts).
 */
export const universityRoutes = new Hono<{ Variables: RbacVariables }>();

universityRoutes.route("/", universitiesRoutes);
universityRoutes.route("/", domainsRoutes);
universityRoutes.route("/", facultiesRoutes);
universityRoutes.route("/", departmentsRoutes);
