/**
 * Admin kök router — `/api/admin` altına mount edilir (index.ts).
 * Endpoint sayısı büyüdüğü için rotalar konuya göre ayrı dosyalara bölündü
 * ve burada tek noktadan birleştirildi.
 *
 * Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
 * fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
import { Hono } from "hono";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { approvalCommitteesRoutes } from "../approval-committees/approval-committees.routes";
import { adminDashboardRoutes } from "./admin-dashboard.routes";
import { adminUsersRoutes } from "./admin-users.routes";
import { adminClubApplicationsRoutes } from "../clubs/routes/admin-club-applications.routes";
import { adminFormationProposalsRoutes } from "../clubs/routes/admin-formation-proposals.routes";
import { adminClubsRoutes } from "../clubs/routes/admin-clubs.routes";
import { adminActivitiesRoutes } from "../activities/admin-activities.routes";

export const adminRoutes = new Hono<{ Variables: RbacVariables }>();

adminRoutes.route("/", approvalCommitteesRoutes);
adminRoutes.route("/", adminDashboardRoutes);
adminRoutes.route("/", adminUsersRoutes);
adminRoutes.route("/", adminClubApplicationsRoutes);
adminRoutes.route("/", adminFormationProposalsRoutes);
adminRoutes.route("/", adminClubsRoutes);
adminRoutes.route("/", adminActivitiesRoutes);
