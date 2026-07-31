import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { ClubVariables } from "../../middlewares/club.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { requireVerifiedUserForWrites } from "../../middlewares/verified-user.middleware";
import { announcementsRoutes } from "../announcements/announcements.routes";
import { galleryRoutes } from "../gallery/gallery.routes";
import { clubActivitiesRoutes } from "../activities/routes/club-activities.routes";
import { browseRoutes } from "./routes/browse.routes";
import { applicationsRoutes } from "./routes/applications.routes";
import { membershipRoutes } from "./routes/membership.routes";
import { managementRoutes } from "./routes/management.routes";

/**
 * clubs feature'ının kök router'ı — `/api/clubs` altına mount edilir (index.ts).
 * Endpoint sayısı büyüdüğü için rotalar aktöre/kaynağa göre ayrı dosyalara
 * bölündü ve burada tek noktadan birleştirildi:
 *
 *   browse        → keşif + üyelik (herhangi bir üye): list/detail/members/join/leave
 *   applications  → kulüp kurma başvuruları (başvuran self-service)
 *   membership    → kulüp-içi üyelik yönetimi (staff/officer/president)
 *   management    → kulüp profilini + iletişim linklerini yönetme
 *   announcements → `/:clubId/announcements` alt-kaynağı
 *   gallery       → `/:clubId/gallery` alt-kaynağı
 *
 * Her alt-router kendi tam path'ini (`/:clubId/...`, `/applications/...`) içinde
 * tanımladığı için hepsi "/" köküne mount edilir; Hono segment sayısı/literal'e
 * göre çakışmayan pattern'leri doğru eşler.
 */
export const clubsRoutes = new Hono<{ Variables: ClubVariables }>();

// Tüm kulüp rotaları giriş ister; askıya alınan kullanıcı ANINDA kesilir.
// (Alt-router'lar ayrıca kendi authMiddleware'lerini çağırır — tekrar zararsızdır.)
//
// E-postasını doğrulamamış (pending) kullanıcı kulüpleri GEZEBİLİR ama katılamaz,
// başvuramaz, duyuru/galeri içeriği oluşturamaz. Kontrol burada, kök seviyede
// yapılır: alt-router'lara sonradan eklenen her yazma rotası otomatik korunur.
clubsRoutes.use("*", authMiddleware, requireActiveUser, requireVerifiedUserForWrites);

// Kulübe özel alt-kaynaklar (":clubId" parametresi bu mount'lardan miras alınır)
clubsRoutes.route("/:clubId/announcements", announcementsRoutes);
clubsRoutes.route("/:clubId/gallery", galleryRoutes);
clubsRoutes.route("/:clubId/activities", clubActivitiesRoutes);

clubsRoutes.route("/", applicationsRoutes);
clubsRoutes.route("/", membershipRoutes);
clubsRoutes.route("/", managementRoutes);
clubsRoutes.route("/", browseRoutes);
