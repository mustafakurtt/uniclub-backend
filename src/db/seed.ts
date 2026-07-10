import { sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { hashPassword } from "../shared/utils/password.util";
import { UniversityPermission, UNIVERSITY_PERMISSION_CATALOG } from "../features/university/university.permissions";
import { AuthPermission } from "../features/auth/auth.permissions";
import { AdminPermission, ADMIN_PERMISSION_CATALOG } from "../features/admin/admin.permissions";
import { ClubPermission, CLUB_PERMISSION_CATALOG } from "../features/clubs/clubs.permissions";
import { AnnouncementPermission, ANNOUNCEMENT_PERMISSION_CATALOG } from "../features/announcements/announcements.permissions";
import { GalleryPermission, GALLERY_PERMISSION_CATALOG } from "../features/gallery/gallery.permissions";
import { AuditPermission, AUDIT_PERMISSION_CATALOG } from "../features/audit/audit.permissions";

/**
 * Global rol → yetki demetleri (kurumsal model, bkz. docs/yonetim/06 §B4).
 * super_admin tüm yetkileri alır (aşağıda ayrıca ele alınır). Buradaki roller
 * "global şablon" (universityId: null) olarak kurulur.
 */
const ROLE_BUNDLES: Record<string, string[]> = {
  // Tenant yöneticisi (eski "admin"): kendi üniversitesinin tamamı + moderasyon +
  // (tenant-scoped) rol yönetimi. Platform işleri (university.create/delete,
  // permission.manage) HARİÇ.
  university_admin: [
    AdminPermission.USER_VIEW, AdminPermission.USER_MANAGE,
    ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW, ClubPermission.APPROVE,
    ClubPermission.UPDATE, ClubPermission.ADVISOR_MANAGE, ClubPermission.MEMBER_MANAGE, ClubPermission.DELETE,
    AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
    UniversityPermission.UPDATE,
    UniversityPermission.FACULTY_CREATE, UniversityPermission.FACULTY_UPDATE, UniversityPermission.FACULTY_DELETE,
    UniversityPermission.DEPARTMENT_CREATE, UniversityPermission.DEPARTMENT_UPDATE, UniversityPermission.DEPARTMENT_DELETE,
    UniversityPermission.DOMAIN_CREATE, UniversityPermission.DOMAIN_UPDATE, UniversityPermission.DOMAIN_DELETE,
    AuthPermission.ROLE_MANAGE,
    AuditPermission.VIEW,
  ],
  // SKS / Öğrenci Kulüpleri Koordinatörlüğü: kulüp yaşam döngüsü + moderasyon.
  student_affairs: [
    AdminPermission.USER_VIEW,
    ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW, ClubPermission.APPROVE,
    ClubPermission.UPDATE, ClubPermission.ADVISOR_MANAGE, ClubPermission.MEMBER_MANAGE,
    AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
  ],
  // Öğrenci İşleri / BİDB: akademik yapı + bölüm atama.
  academic_affairs: [
    AdminPermission.USER_VIEW, AdminPermission.USER_MANAGE,
    UniversityPermission.FACULTY_CREATE, UniversityPermission.FACULTY_UPDATE, UniversityPermission.FACULTY_DELETE,
    UniversityPermission.DEPARTMENT_CREATE, UniversityPermission.DEPARTMENT_UPDATE, UniversityPermission.DEPARTMENT_DELETE,
    UniversityPermission.DOMAIN_CREATE, UniversityPermission.DOMAIN_UPDATE, UniversityPermission.DOMAIN_DELETE,
  ],
  // İçerik moderatörü.
  content_moderator: [
    ClubPermission.VIEW, AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
  ],
  // Denetim / İzleme (salt-okunur, kendi tenant). Denetim izi bu rolün ana ekranıdır.
  auditor: [
    AdminPermission.USER_VIEW, ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW,
    AuditPermission.VIEW,
  ],
  // Platform Destek (salt-okunur, çapraz tenant — tenant scope bypass'ı roldedir).
  platform_support: [
    AdminPermission.USER_VIEW, ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW,
    AuditPermission.VIEW,
  ],
};

/**
 * ÇOK ÜNİVERSİTELİ (multi-tenant) TEST SEED'İ
 *
 * Amaç: her rolün (super_admin / admin / advisor / kulüp başkanı / officer /
 * üye / sıradan öğrenci) ve her durumun (pending/approved/rejected/archived
 * kulüpler, pending/suspended kullanıcılar, bekleyen üyelik istekleri, onay
 * zincirli başvurular) gerçekçi test verisiyle karşılanması.
 *
 * 3 üniversite kurulur:
 *   1. Antalya Bilim Üniversitesi  — en zengin veri seti (eski seed'in hesapları AYNEN korunur)
 *   2. Ege Bilim Üniversitesi      — tenant izolasyon testleri (Antalya ile AYNI slug'lı kulüp!)
 *   3. Karadeniz Teknoloji Üniv.   — çapraz rol senaryoları (bir kulüpte officer, diğerinde başkan)
 *
 * Tenant izolasyonunu test etmek için bilinçli çakışmalar:
 *   - "yazilim-teknoloji" slug'ı hem Antalya'da hem Ege'de var (slug üniversite-başına unique).
 *   - "Satranç Kulübü" başvurusu hem Antalya'da hem Karadeniz'de pending.
 *   - Her üniversitede EN AZ BİR kulüpsüz advisor var (danışman atama havuzu) ve
 *     EN AZ BİR danışmansız kulüp var (atama akışının test edilebilmesi için).
 *
 * Tüm hesapların şifresi: "Password123!"
 */

async function main() {
  console.log("🌱 Veritabanı tohumlama (seeding) başlatılıyor...");

  const mockPassword = await hashPassword("Password123!");

  // Bütün işlemleri tek bir Transaction içinde yapıyoruz ki,
  // ortasında hata verirse veritabanı yarım kalmasın, her şeyi geri alsın.
  await db.transaction(async (tx) => {
    // ═══════════════════════════════════════════════
    // 0. TEMİZLİK — seed idempotent olmalı
    // ═══════════════════════════════════════════════
    // Tablolar elle sayılmıyor: pg_tables'tan okunuyor ki yeni bir tablo
    // eklendiğinde burayı güncellemek unutulmasın. Migration geçmişi
    // `drizzle` şemasında durduğu için `public`i temizlemek ona dokunmaz.
    // TRUNCATE transaction içinde: seed ortada patlarsa silme de geri alınır.
    console.log("🧹 public şeması temizleniyor (idempotent seed)...");
    await tx.execute(sql`
      DO $$
      DECLARE tbl text;
      BEGIN
        FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        LOOP
          EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', tbl);
        END LOOP;
      END $$;
    `);

    // ═══════════════════════════════════════════════
    // 1. GLOBAL ROLLER VE YETKİLER (tek sefer, tenant'tan bağımsız)
    // ═══════════════════════════════════════════════
    console.log("🔐 Global Roller ekleniyor (kurumsal 9 rol, rütbeli)...");
    // Kurumsal model (bkz. docs/yonetim/06 + 07): platform + tenant + akademik + öğrenci.
    // `rank` = yetki derecesi (yüksek = daha yetkili). Bir aktör YALNIZCA kendinden
    // DÜŞÜK rütbeli rolü atayıp kaldırabilir ve yalnızca kendinden düşük rütbeli
    // kullanıcıya dokunabilir → moderatör admini söküp atamaz, admin kendini düşüremez.
    // Aradaki boşluklar (10'ar) bilinçlidir: ileride ara kademe rol eklenebilsin.
    const roleDefs = [
      { name: "student", description: "Öğrenci", rank: 10 },
      { name: "advisor", description: "Danışman Hoca (kulüp danışmanı atanabilme etiketi)", rank: 20 },
      { name: "auditor", description: "Denetim / İzleme — salt-okunur", rank: 30 },
      { name: "content_moderator", description: "İçerik Moderatörü — duyuru/galeri", rank: 30 },
      { name: "student_affairs", description: "SKS / Öğrenci Kulüpleri Koordinatörlüğü", rank: 45 },
      { name: "academic_affairs", description: "Öğrenci İşleri / BİDB — akademik yapı", rank: 45 },
      { name: "university_admin", description: "Okul Yöneticisi — tenant'ın tamamı", rank: 60 },
      { name: "platform_support", description: "Platform Destek — salt-okunur, çapraz tenant", rank: 90 },
      { name: "super_admin", description: "Sistem Yöneticisi — platform + tüm tenantlar", rank: 100 },
    ];

    const roleIdByName: Record<string, string> = {};
    for (const def of roleDefs) {
      const [inserted] = await tx.insert(schema.roles).values(def).returning();
      roleIdByName[def.name] = inserted.id;
    }

    console.log("🗝️ Yetki (permission) kataloğu ekleniyor...");
    const insertedPermissions = await tx.insert(schema.permissions).values([
      // user.view / user.manage (okuma-yazma ayrık)
      ...ADMIN_PERMISSION_CATALOG,
      // club.* granüler yetkileri (view / application.view / approve / update / advisor / member / delete)
      ...CLUB_PERMISSION_CATALOG,
      // university.* granüler yetkileri (üniversite/domain/fakülte/bölüm × create/update/delete)
      ...UNIVERSITY_PERMISSION_CATALOG,
      // içerik moderasyonu (tenant override)
      ...ANNOUNCEMENT_PERMISSION_CATALOG,
      ...GALLERY_PERMISSION_CATALOG,
      // denetim izi görüntüleme (salt-okunur)
      ...AUDIT_PERMISSION_CATALOG,
      { key: AuthPermission.ROLE_MANAGE, description: "Rol ve yetki kataloğu yönetimi" },
      { key: AuthPermission.PERMISSION_MANAGE, description: "Yetki tanımlama" },
    ]).returning();

    const permissionIdByKey: Record<string, string> = {};
    for (const p of insertedPermissions) {
      permissionIdByKey[p.key] = p.id;
    }

    // Rol → yetki demetleri (ROLE_BUNDLES). super_admin ayrıca TÜM yetkileri alır.
    for (const [roleName, keys] of Object.entries(ROLE_BUNDLES)) {
      if (keys.length === 0) continue;
      await tx.insert(schema.rolePermissions).values(
        keys.map((key) => ({
          roleId: roleIdByName[roleName],
          permissionId: permissionIdByKey[key],
        }))
      );
    }

    // super_admin: tüm yetkiler (platform dahil)
    await tx.insert(schema.rolePermissions).values(
      insertedPermissions.map((p) => ({
        roleId: roleIdByName["super_admin"],
        permissionId: p.id,
      }))
    );

    // ═══════════════════════════════════════════════
    // YARDIMCILAR — tekrar eden insert kalıplarını sadeleştirir
    // ═══════════════════════════════════════════════

    /** Üniversite + domainleri + fakülte/bölüm ağacını kurar, bölüm id haritası döner. */
    async function createUniversity(
      name: string,
      slug: string,
      domains: { domain: string; domainType: "student" | "staff" }[],
      faculties: { name: string; departments: string[] }[],
    ) {
      const [university] = await tx.insert(schema.universities).values({ name, slug }).returning();
      await tx.insert(schema.universityDomains).values(
        domains.map((d) => ({ universityId: university.id, ...d }))
      );

      const departmentIds: Record<string, string> = {};
      for (const fac of faculties) {
        const [insertedFaculty] = await tx.insert(schema.faculties).values({
          universityId: university.id,
          name: fac.name,
        }).returning();

        for (const deptName of fac.departments) {
          const [insertedDept] = await tx.insert(schema.departments).values({
            facultyId: insertedFaculty.id,
            name: deptName,
          }).returning();
          departmentIds[deptName] = insertedDept.id;
        }
      }
      return { university, departmentIds };
    }

    /**
     * Kullanıcıyı oluşturup global rolünü bağlar, id döner.
     * `universityId: null` → PLATFORM hesabı (hiçbir üniversiteye bağlı değil).
     */
    async function createUser(u: {
      universityId: string | null;
      departmentId?: string | null;
      firstName: string;
      lastName: string;
      email: string;
      studentNumber?: string | null;
      status?: "pending" | "active" | "suspended";
      role: keyof typeof roleIdByName;
    }) {
      const [inserted] = await tx.insert(schema.users).values({
        universityId: u.universityId,
        departmentId: u.departmentId ?? null,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        studentNumber: u.studentNumber ?? null,
        passwordHash: mockPassword,
        status: u.status ?? "active",
      }).returning();

      await tx.insert(schema.userRoles).values({ userId: inserted.id, roleId: roleIdByName[u.role] });
      return inserted.id;
    }

    /** Kulüp başvurusu + step 1 (danışman) onay satırını birlikte oluşturur. */
    async function createApplication(app: {
      universityId: string;
      proposedName: string;
      description: string;
      applicantId: string;
      status: "pending" | "approved" | "rejected";
      reviewerId?: string; // approved/rejected ise adımı kimin karara bağladığı
    }) {
      const [inserted] = await tx.insert(schema.clubApplications).values({
        universityId: app.universityId,
        proposedName: app.proposedName,
        description: app.description,
        applicantId: app.applicantId,
        status: app.status,
      }).returning();

      await tx.insert(schema.clubApplicationApprovals).values({
        applicationId: inserted.id,
        step: 1,
        approverRole: "advisor",
        approverId: app.status === "pending" ? null : app.reviewerId ?? null,
        status: app.status,
        reviewedAt: app.status === "pending" ? null : new Date(),
      });
      return inserted;
    }

    // ═══════════════════════════════════════════════════════════════
    // 1B. PLATFORM HESAPLARI (universityId: NULL — hiçbir okula ait değiller)
    // Şirketin kendi çalışanları. Tenant scope'unu rolleriyle bypass ederler;
    // e-posta domain'leri bir üniversiteye ait olmadığı için kayıt akışıyla
    // DEĞİL, yalnızca seed/super_admin eliyle oluşturulurlar.
    // ═══════════════════════════════════════════════════════════════
    console.log("🛰️ Platform hesapları (tenant'sız) kuruluyor...");
    await createUser({ universityId: null, firstName: "Sistem", lastName: "Yöneticisi", email: "superadmin@platform.local", role: "super_admin" });
    await createUser({ universityId: null, firstName: "İkinci", lastName: "Sistem Yöneticisi", email: "superadmin2@platform.local", role: "super_admin" }); // "son super_admin" korumasını test etmek için
    await createUser({ universityId: null, firstName: "Platform", lastName: "Destek", email: "destek@platform.local", role: "platform_support" }); // salt-okunur, çapraz tenant

    // ═══════════════════════════════════════════════════════════════
    // 2. ÜNİVERSİTE 1 — ANTALYA BİLİM (eski seed'in hesapları korunur)
    // ═══════════════════════════════════════════════════════════════
    console.log("🏢 [1/3] Antalya Bilim Üniversitesi kuruluyor...");
    const { university: antalya, departmentIds: antalyaDept } = await createUniversity(
      "Antalya Bilim Üniversitesi",
      "antalya-bilim",
      [
        { domain: "std.antalya.edu.tr", domainType: "student" },
        { domain: "antalya.edu.tr", domainType: "staff" },
      ],
      [
        { name: "Hukuk Fakültesi", departments: ["Hukuk"] },
        { name: "Diş Hekimliği Fakültesi", departments: ["Diş Hekimliği"] },
        { name: "Sağlık Bilimleri Fakültesi", departments: ["Hemşirelik", "Fizyoterapi ve Rehabilitasyon", "Beslenme ve Diyetetik", "Ebelik"] },
        { name: "Güzel Sanatlar Ve Mimarlık Fakültesi", departments: ["Mimarlık", "İç Mimarlık ve Çevre Tasarımı"] },
        { name: "Mühendislik Fakültesi", departments: ["Bilgisayar Mühendisliği", "Elektrik - Elektronik Mühendisliği", "Endüstri Mühendisliği", "İnşaat Mühendisliği", "Makine Mühendisliği"] },
        { name: "İktisadi, İdari ve Sosyal Bilimler Fakültesi", departments: ["Psikoloji", "Ekonomi", "İşletme", "Siyaset Bilimi ve Uluslararası İlişkiler"] },
        { name: "Turizm Fakültesi", departments: ["Turizm ve Otel İşletmeciliği", "Gastronomi ve Mutfak Sanatları"] },
        { name: "Sivil Havacılık Yüksekokulu", departments: ["Pilotaj"] },
        { name: "Sağlık Hizmetleri Meslek Yüksekokulu", departments: ["Diyaliz", "Anestezi", "İlk ve Acil Yardım", "Fizyoterapi", "Ağız ve Diş Sağlığı", "Ameliyathane Hizmetleri", "Tıbbi Görüntüleme Teknikleri", "Tıbbi Laboratuvar Teknikleri", "Optisyenlik"] },
        { name: "Meslek Yüksek Okulları", departments: ["Bilgisayar Teknolojileri Bölümü", "Aşçılık Programı", "İnşaat Teknolojisi Programı", "Hukuk Bölümü Adalet Programı"] },
      ],
    );

    // --- Kullanıcılar (eski hesaplar birebir aynı e-postalarla) ---
    const sen = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Bilgisayar Teknolojileri Bölümü"], firstName: "Senin", lastName: "Adın", email: "250803001@std.antalya.edu.tr", studentNumber: "250803001", role: "student" });
    const mustafa = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Bilgisayar Mühendisliği"], firstName: "Mustafa", lastName: "Kurt", email: "mustafa.kurt@std.antalya.edu.tr", studentNumber: "190501002", role: "student" });
    const ayse = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Psikoloji"], firstName: "Ayşe", lastName: "Yılmaz", email: "ayse.yilmaz@std.antalya.edu.tr", studentNumber: "210245003", role: "student" });
    const can = await createUser({ universityId: antalya.id, departmentId: antalyaDept["İşletme"], firstName: "Can", lastName: "Öztürk", email: "can.ozturk@std.antalya.edu.tr", studentNumber: "220134004", role: "student" });
    await createUser({ universityId: antalya.id, departmentId: antalyaDept["Makine Mühendisliği"], firstName: "Deniz", lastName: "Kara", email: "deniz.kara@std.antalya.edu.tr", studentNumber: "230198005", status: "pending", role: "student" }); // mail onayı bekleyen
    await createUser({ universityId: antalya.id, departmentId: antalyaDept["Hukuk"], firstName: "Fatma", lastName: "Şahin", email: "fatma.sahin@std.antalya.edu.tr", studentNumber: "200077006", status: "suspended", role: "student" }); // askıya alınmış (login engellenir)

    // Yeni öğrenciler — daha kalabalık üyelik/istek senaryoları için
    const emre = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Elektrik - Elektronik Mühendisliği"], firstName: "Emre", lastName: "Aksoy", email: "emre.aksoy@std.antalya.edu.tr", studentNumber: "210330007", role: "student" });
    const selin = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Mimarlık"], firstName: "Selin", lastName: "Koç", email: "selin.koc@std.antalya.edu.tr", studentNumber: "220415008", role: "student" });
    const burak = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Ekonomi"], firstName: "Burak", lastName: "Demirci", email: "burak.demirci@std.antalya.edu.tr", studentNumber: "230522009", role: "student" });

    // Danışmanlar — Ahmet (2 kulüp), Zeynep (1 kulüp), Murat (KULÜPSÜZ → atama havuzu)
    const ahmetHoca = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Bilgisayar Mühendisliği"], firstName: "Ahmet", lastName: "Hoca", email: "ahmet.hoca@antalya.edu.tr", role: "advisor" });
    const zeynepHoca = await createUser({ universityId: antalya.id, departmentId: antalyaDept["Psikoloji"], firstName: "Zeynep", lastName: "Aydın", email: "zeynep.aydin@antalya.edu.tr", role: "advisor" });
    await createUser({ universityId: antalya.id, departmentId: antalyaDept["Endüstri Mühendisliği"], firstName: "Murat", lastName: "Tekin", email: "murat.tekin@antalya.edu.tr", role: "advisor" }); // hiçbir kulübün danışmanı DEĞİL

    // Yöneticiler + kurumsal roller (yeni model — bkz. docs/yonetim/06)
    // NOT: super_admin ve platform_support artık BURADA DEĞİL — onlar tenant'sız
    // platform hesaplarıdır ve yukarıda (üniversitelerden önce) kurulur.
    await createUser({ universityId: antalya.id, firstName: "Elif", lastName: "Demir", email: "elif.demir@antalya.edu.tr", role: "university_admin" }); // tenant yöneticisi
    await createUser({ universityId: antalya.id, firstName: "Ahmet", lastName: "Yönetici", email: "ahmet.yonetici@antalya.edu.tr", role: "university_admin" }); // 2. admin — "son admin" korumasını test etmek için
    await createUser({ universityId: antalya.id, firstName: "SKS", lastName: "Görevlisi", email: "sks@antalya.edu.tr", role: "student_affairs" }); // kulüp onay/danışman/moderasyon
    await createUser({ universityId: antalya.id, firstName: "Öğrenci İşleri", lastName: "Görevlisi", email: "ogrenci.isleri@antalya.edu.tr", role: "academic_affairs" }); // akademik yapı
    await createUser({ universityId: antalya.id, firstName: "İçerik", lastName: "Moderatörü", email: "moderator@antalya.edu.tr", role: "content_moderator" }); // duyuru/galeri moderasyonu
    await createUser({ universityId: antalya.id, firstName: "Denetim", lastName: "Görevlisi", email: "denetci@antalya.edu.tr", role: "auditor" }); // salt-okunur izleme

    // --- Kulüpler ---
    console.log("   🏕️ Antalya kulüpleri ve üyelikleri...");

    // 1) approved + open — tam kadro (başkan/officer/üye) + bekleyen istek
    const [techClub] = await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "Yazılım ve Teknoloji Kulübü", slug: "yazilim-teknoloji",
      description: "Okulun en inek ama en eğlenceli kulübü.", joinPolicy: "open", status: "approved", createdBy: mustafa,
    }).returning();
    await tx.insert(schema.clubAdvisors).values({ clubId: techClub.id, userId: ahmetHoca });
    await tx.insert(schema.clubMembers).values([
      { clubId: techClub.id, userId: mustafa, role: "president", status: "approved" },
      { clubId: techClub.id, userId: can, role: "officer", status: "approved" },
      { clubId: techClub.id, userId: sen, role: "member", status: "approved" },
      { clubId: techClub.id, userId: selin, role: "member", status: "pending" }, // bekleyen katılım isteği
    ]);
    await tx.insert(schema.clubContactLinks).values([
      { clubId: techClub.id, platform: "instagram", url: "https://instagram.com/yazilim-antalya" },
      { clubId: techClub.id, platform: "discord", url: "https://discord.gg/yazilim-antalya" },
    ]);

    // 2) approved + approval_required — çift danışman + bekleyen istek
    const [photographyClub] = await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "Fotoğrafçılık Kulübü", slug: "fotografcilik",
      description: "Kampüsün ve şehrin güzelliklerini bir de bizim gözümüzden görün.", joinPolicy: "approval_required", status: "approved", createdBy: ayse,
    }).returning();
    await tx.insert(schema.clubAdvisors).values([
      { clubId: photographyClub.id, userId: ahmetHoca },
      { clubId: photographyClub.id, userId: zeynepHoca }, // birden fazla danışman senaryosu
    ]);
    await tx.insert(schema.clubMembers).values([
      { clubId: photographyClub.id, userId: ayse, role: "president", status: "approved" },
      { clubId: photographyClub.id, userId: burak, role: "member", status: "approved" },
      { clubId: photographyClub.id, userId: sen, role: "member", status: "pending" }, // onay bekleyen istek
    ]);
    await tx.insert(schema.clubContactLinks).values({ clubId: photographyClub.id, platform: "website", url: "https://fotografcilik-antalya.example.com" });

    // 3) approved + open — onaylanmış başvurudan doğan kulüp (aşağıdaki "Müzik" başvurusuyla eşleşir)
    const [musicClub] = await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "Müzik Kulübü", slug: "muzik",
      description: "Koro, orkestra ve akustik geceler.", joinPolicy: "open", status: "approved", createdBy: can,
    }).returning();
    await tx.insert(schema.clubAdvisors).values({ clubId: musicClub.id, userId: zeynepHoca });
    await tx.insert(schema.clubMembers).values([
      { clubId: musicClub.id, userId: can, role: "president", status: "approved" },
      { clubId: musicClub.id, userId: emre, role: "member", status: "approved" },
    ]);

    // 4) pending — admin onayı bekleyen kulüp; DANIŞMANI YOK (danışman atama testi burada yapılır)
    const [theatreClub] = await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "Tiyatro Kulübü", slug: "tiyatro",
      description: "Sahne tozunu yutmak isteyen herkese açık.", joinPolicy: "approval_required", status: "pending", createdBy: selin,
    }).returning();
    await tx.insert(schema.clubMembers).values({ clubId: theatreClub.id, userId: selin, role: "president", status: "approved" });

    // 5) archived — "önce arşivle sonra sil" akışının test verisi
    const [roboticsClub] = await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "Robotik Kulübü", slug: "robotik",
      description: "Bir dönem aktifti, şimdi arşivde.", joinPolicy: "open", status: "archived", createdBy: emre,
    }).returning();
    await tx.insert(schema.clubMembers).values({ clubId: roboticsClub.id, userId: emre, role: "president", status: "approved" });

    // 6) rejected — silinebilir ikinci durum
    await tx.insert(schema.clubs).values({
      universityId: antalya.id, name: "E-Spor Kulübü", slug: "e-spor",
      description: "Reddedilmiş örnek kulüp.", joinPolicy: "open", status: "rejected", createdBy: burak,
    });

    // --- Duyurular & Galeri (yalnızca aktif kulüplerde) ---
    await tx.insert(schema.announcements).values([
      { universityId: antalya.id, clubId: techClub.id, authorId: mustafa, title: "Kulübümüze Hoş Geldiniz!", content: "Bu dönem düzenli buluşmalar ve atölyeler yapacağız, herkesi bekleriz." },
      { universityId: antalya.id, clubId: techClub.id, authorId: can, title: "Bu Hafta Sonu Hackathon Var!", content: "Cumartesi 10:00'da kulüp odasında buluşuyoruz, takım kurmayı unutmayın." },
      { universityId: antalya.id, clubId: photographyClub.id, authorId: ayse, title: "İlk Fotoğraf Gezimiz Yaklaşıyor", content: "Kaleiçi'nde bir gezi planlıyoruz, fotoğraf makinenizi/telefonunuzu almayı unutmayın." },
      { universityId: antalya.id, clubId: musicClub.id, authorId: can, title: "Akustik Gece: Kayıtlar Açıldı", content: "Perşembe akşamı amfide buluşuyoruz, sahne almak isteyenler DM." },
    ]);
    await tx.insert(schema.clubGallery).values([
      { clubId: techClub.id, uploadedBy: mustafa, imageUrl: "https://picsum.photos/seed/tech-meetup-1/800/600", caption: "Haftalık buluşmamızdan bir kare" },
      { clubId: techClub.id, uploadedBy: can, imageUrl: "https://picsum.photos/seed/tech-hackathon-1/800/600", caption: "Hackathon gecesi" },
      { clubId: photographyClub.id, uploadedBy: ayse, imageUrl: "https://picsum.photos/seed/photo-kaleici-1/800/600", caption: "Kaleiçi gezisinden" },
      { clubId: musicClub.id, uploadedBy: can, imageUrl: "https://picsum.photos/seed/music-night-1/800/600", caption: "Geçen dönemin kapanış konseri" },
    ]);

    // --- Kulüp kurma başvuruları (onay zincirinin 3 durumu da mevcut) ---
    console.log("   📝 Antalya başvuruları...");
    await createApplication({ universityId: antalya.id, proposedName: "Satranç Kulübü", description: "Satranç oynamayı ve öğrenmeyi seven herkes için bir kulüp.", applicantId: sen, status: "pending" });
    await createApplication({ universityId: antalya.id, proposedName: "Doğa Yürüyüşü Kulübü", description: "Hafta sonları birlikte doğa yürüyüşlerine çıkmak isteyenler için.", applicantId: can, status: "pending" });
    await createApplication({ universityId: antalya.id, proposedName: "Müzik Kulübü", description: "Koro, orkestra ve akustik geceler.", applicantId: can, status: "approved", reviewerId: ahmetHoca }); // yukarıdaki Müzik Kulübü bundan doğdu
    await createApplication({ universityId: antalya.id, proposedName: "Kripto Para Kulübü", description: "Kripto piyasaları üzerine konuşma grubu.", applicantId: burak, status: "rejected", reviewerId: ahmetHoca });

    // ═══════════════════════════════════════════════════════════════
    // 3. ÜNİVERSİTE 2 — EGE BİLİM (tenant izolasyon senaryoları)
    // ═══════════════════════════════════════════════════════════════
    console.log("🏢 [2/3] Ege Bilim Üniversitesi kuruluyor...");
    const { university: ege, departmentIds: egeDept } = await createUniversity(
      "Ege Bilim Üniversitesi",
      "ege-bilim",
      [
        { domain: "std.egebilim.edu.tr", domainType: "student" },
        { domain: "egebilim.edu.tr", domainType: "staff" },
      ],
      [
        { name: "Mühendislik Fakültesi", departments: ["Bilgisayar Mühendisliği", "Yazılım Mühendisliği", "Elektrik - Elektronik Mühendisliği"] },
        { name: "İktisadi ve İdari Bilimler Fakültesi", departments: ["İşletme", "Ekonomi"] },
        { name: "Fen - Edebiyat Fakültesi", departments: ["Matematik", "Fizik", "Türk Dili ve Edebiyatı"] },
      ],
    );

    const cem = await createUser({ universityId: ege.id, departmentId: egeDept["Bilgisayar Mühendisliği"], firstName: "Cem", lastName: "Arslan", email: "cem.arslan@std.egebilim.edu.tr", studentNumber: "230101001", role: "student" });
    const gizem = await createUser({ universityId: ege.id, departmentId: egeDept["Yazılım Mühendisliği"], firstName: "Gizem", lastName: "Polat", email: "gizem.polat@std.egebilim.edu.tr", studentNumber: "230101002", role: "student" });
    const tolga = await createUser({ universityId: ege.id, departmentId: egeDept["Matematik"], firstName: "Tolga", lastName: "Erden", email: "tolga.erden@std.egebilim.edu.tr", studentNumber: "220202003", role: "student" });
    const nazli = await createUser({ universityId: ege.id, departmentId: egeDept["İşletme"], firstName: "Nazlı", lastName: "Güneş", email: "nazli.gunes@std.egebilim.edu.tr", studentNumber: "240303004", role: "student" });
    await createUser({ universityId: ege.id, departmentId: egeDept["Fizik"], firstName: "Barış", lastName: "Uçar", email: "baris.ucar@std.egebilim.edu.tr", studentNumber: "210404005", status: "suspended", role: "student" });
    await createUser({ universityId: ege.id, departmentId: egeDept["Ekonomi"], firstName: "Duygu", lastName: "Sarı", email: "duygu.sari@std.egebilim.edu.tr", studentNumber: "250505006", status: "pending", role: "student" });

    const leylaHoca = await createUser({ universityId: ege.id, departmentId: egeDept["Bilgisayar Mühendisliği"], firstName: "Leyla", lastName: "Hoca", email: "leyla.hoca@egebilim.edu.tr", role: "advisor" });
    await createUser({ universityId: ege.id, departmentId: egeDept["Matematik"], firstName: "Kemal", lastName: "Hoca", email: "kemal.hoca@egebilim.edu.tr", role: "advisor" }); // kulüpsüz danışman (atama havuzu)
    await createUser({ universityId: ege.id, firstName: "Okan", lastName: "Yıldız", email: "okan.yildiz@egebilim.edu.tr", role: "university_admin" });
    await createUser({ universityId: ege.id, firstName: "Ege SKS", lastName: "Görevlisi", email: "sks@egebilim.edu.tr", role: "student_affairs" }); // tenant izolasyon testi için

    console.log("   🏕️ Ege kulüpleri ve üyelikleri...");

    // Antalya'daki kulüple AYNI slug — tenant izolasyonu testi (listelemeler karışmamalı)
    const [egeTechClub] = await tx.insert(schema.clubs).values({
      universityId: ege.id, name: "Yazılım ve Teknoloji Kulübü", slug: "yazilim-teknoloji",
      description: "Ege'nin kod yazan kulübü — Antalya'dakiyle KARIŞMAMALI!", joinPolicy: "open", status: "approved", createdBy: cem,
    }).returning();
    await tx.insert(schema.clubAdvisors).values({ clubId: egeTechClub.id, userId: leylaHoca });
    await tx.insert(schema.clubMembers).values([
      { clubId: egeTechClub.id, userId: cem, role: "president", status: "approved" },
      { clubId: egeTechClub.id, userId: gizem, role: "officer", status: "approved" },
      { clubId: egeTechClub.id, userId: tolga, role: "member", status: "approved" },
    ]);
    await tx.insert(schema.clubContactLinks).values({ clubId: egeTechClub.id, platform: "instagram", url: "https://instagram.com/yazilim-egebilim" });
    await tx.insert(schema.announcements).values({ universityId: ege.id, clubId: egeTechClub.id, authorId: cem, title: "Tanışma Toplantısı", content: "Dönemin ilk buluşması çarşamba 18:00'de B blok amfide." });
    await tx.insert(schema.clubGallery).values({ clubId: egeTechClub.id, uploadedBy: gizem, imageUrl: "https://picsum.photos/seed/ege-tech-1/800/600", caption: "Tanışma toplantısından" });

    // approval_required + danışmansız + bekleyen istek
    const [hikingClub] = await tx.insert(schema.clubs).values({
      universityId: ege.id, name: "Dağcılık Kulübü", slug: "dagcilik",
      description: "Zirve sevdalıları burada.", joinPolicy: "approval_required", status: "approved", createdBy: gizem,
    }).returning();
    await tx.insert(schema.clubMembers).values([
      { clubId: hikingClub.id, userId: gizem, role: "president", status: "approved" },
      { clubId: hikingClub.id, userId: nazli, role: "member", status: "pending" }, // bekleyen istek
    ]);

    // pending + archived kulüpler (admin filtre/silme testleri)
    await tx.insert(schema.clubs).values([
      { universityId: ege.id, name: "Sinema Kulübü", slug: "sinema", description: "Onay bekleyen kulüp.", joinPolicy: "open", status: "pending", createdBy: tolga },
      { universityId: ege.id, name: "Münazara Kulübü", slug: "munazara", description: "Arşivlenmiş kulüp.", joinPolicy: "approval_required", status: "archived", createdBy: nazli },
    ]);

    console.log("   📝 Ege başvuruları...");
    await createApplication({ universityId: ege.id, proposedName: "Yapay Zeka Kulübü", description: "ML/AI okuma grubu ve proje atölyeleri.", applicantId: nazli, status: "pending" });
    await createApplication({ universityId: ege.id, proposedName: "Airsoft Kulübü", description: "Kampüs dışı airsoft etkinlikleri.", applicantId: tolga, status: "rejected", reviewerId: leylaHoca });

    // ═══════════════════════════════════════════════════════════════
    // 4. ÜNİVERSİTE 3 — KARADENİZ TEKNOLOJİ (çapraz rol senaryoları)
    // ═══════════════════════════════════════════════════════════════
    console.log("🏢 [3/3] Karadeniz Teknoloji Üniversitesi kuruluyor...");
    const { university: kartek, departmentIds: kartekDept } = await createUniversity(
      "Karadeniz Teknoloji Üniversitesi",
      "karadeniz-teknoloji",
      [
        { domain: "std.kartek.edu.tr", domainType: "student" },
        { domain: "kartek.edu.tr", domainType: "staff" },
      ],
      [
        { name: "Teknoloji Fakültesi", departments: ["Yazılım Mühendisliği", "Mekatronik Mühendisliği"] },
        { name: "Denizcilik Fakültesi", departments: ["Deniz Ulaştırma İşletme Mühendisliği", "Gemi Makineleri İşletme Mühendisliği"] },
      ],
    );

    const yusuf = await createUser({ universityId: kartek.id, departmentId: kartekDept["Yazılım Mühendisliği"], firstName: "Yusuf", lastName: "Çelik", email: "yusuf.celik@std.kartek.edu.tr", studentNumber: "230801001", role: "student" });
    const merve = await createUser({ universityId: kartek.id, departmentId: kartekDept["Mekatronik Mühendisliği"], firstName: "Merve", lastName: "Acar", email: "merve.acar@std.kartek.edu.tr", studentNumber: "230801002", role: "student" });
    const hakan = await createUser({ universityId: kartek.id, departmentId: kartekDept["Deniz Ulaştırma İşletme Mühendisliği"], firstName: "Hakan", lastName: "Turan", email: "hakan.turan@std.kartek.edu.tr", studentNumber: "220901003", role: "student" });
    const esra = await createUser({ universityId: kartek.id, departmentId: kartekDept["Gemi Makineleri İşletme Mühendisliği"], firstName: "Esra", lastName: "Bulut", email: "esra.bulut@std.kartek.edu.tr", studentNumber: "241001004", role: "student" });

    const omerHoca = await createUser({ universityId: kartek.id, departmentId: kartekDept["Mekatronik Mühendisliği"], firstName: "Ömer", lastName: "Hoca", email: "omer.hoca@kartek.edu.tr", role: "advisor" });
    await createUser({ universityId: kartek.id, departmentId: kartekDept["Deniz Ulaştırma İşletme Mühendisliği"], firstName: "Sevgi", lastName: "Hoca", email: "sevgi.hoca@kartek.edu.tr", role: "advisor" }); // kulüpsüz danışman
    await createUser({ universityId: kartek.id, firstName: "Hülya", lastName: "Özkan", email: "hulya.ozkan@kartek.edu.tr", role: "university_admin" });

    console.log("   🏕️ Karadeniz kulüpleri ve üyelikleri...");

    const [mechClub] = await tx.insert(schema.clubs).values({
      universityId: kartek.id, name: "Robotik ve Mekatronik Kulübü", slug: "robotik-mekatronik",
      description: "Robot yarışmalarına takım çıkarıyoruz.", joinPolicy: "open", status: "approved", createdBy: yusuf,
    }).returning();
    await tx.insert(schema.clubAdvisors).values({ clubId: mechClub.id, userId: omerHoca });
    await tx.insert(schema.clubMembers).values([
      { clubId: mechClub.id, userId: yusuf, role: "president", status: "approved" },
      { clubId: mechClub.id, userId: merve, role: "officer", status: "approved" }, // Merve burada officer...
      { clubId: mechClub.id, userId: hakan, role: "member", status: "approved" },
      { clubId: mechClub.id, userId: esra, role: "member", status: "pending" }, // bekleyen istek
    ]);
    await tx.insert(schema.clubContactLinks).values({ clubId: mechClub.id, platform: "telegram", url: "https://t.me/kartek-robotik" });
    await tx.insert(schema.announcements).values({ universityId: kartek.id, clubId: mechClub.id, authorId: merve, title: "Teknofest Takım Seçmeleri", content: "Bu cuma laboratuvar 2'de seçmeler var, CV'nizi getirin." });
    await tx.insert(schema.clubGallery).values({ clubId: mechClub.id, uploadedBy: yusuf, imageUrl: "https://picsum.photos/seed/kartek-robot-1/800/600", caption: "Geçen yılın yarışma robotu" });

    // Aynı kullanıcı (Merve) başka kulüpte PRESIDENT — çapraz rol senaryosu
    const [seaClub] = await tx.insert(schema.clubs).values({
      universityId: kartek.id, name: "Deniz Sporları Kulübü", slug: "deniz-sporlari",
      description: "Yelken, kürek ve dalış etkinlikleri.", joinPolicy: "approval_required", status: "approved", createdBy: merve,
    }).returning();
    await tx.insert(schema.clubMembers).values([
      { clubId: seaClub.id, userId: merve, role: "president", status: "approved" }, // ...burada başkan
      { clubId: seaClub.id, userId: hakan, role: "member", status: "pending" }, // hakan: robotikte approved, burada pending
    ]);

    // Antalya'dakiyle AYNI slug'lı pending kulüp (izolasyon + filtre testi)
    await tx.insert(schema.clubs).values({
      universityId: kartek.id, name: "Fotoğrafçılık Kulübü", slug: "fotografcilik",
      description: "Onay bekleyen kulüp — Antalya'daki onaylı kulüple aynı slug.", joinPolicy: "open", status: "pending", createdBy: esra,
    });

    console.log("   📝 Karadeniz başvuruları...");
    await createApplication({ universityId: kartek.id, proposedName: "Satranç Kulübü", description: "Antalya'daki başvuruyla AYNI isim — tenant izolasyon testi.", applicantId: esra, status: "pending" });
    await createApplication({ universityId: kartek.id, proposedName: "Havacılık Kulübü", description: "Model uçak ve drone atölyeleri.", applicantId: hakan, status: "rejected", reviewerId: omerHoca });
  });

  console.log("✅ Seeding başarıyla tamamlandı!");
  console.log("\n📋 Test hesapları (hepsi \"Password123!\" şifresiyle giriş yapar):");
  console.log("\n── PLATFORM (universityId: NULL — hiçbir okula bağlı değil) ─");
  console.log("   superadmin@platform.local        → super_admin      rank 100 (tüm yetkiler, 3 üniversite + platform)");
  console.log("   superadmin2@platform.local       → super_admin      rank 100 ('son super_admin' korumasını test etmek için)");
  console.log("   destek@platform.local            → platform_support rank  90 (salt-okunur, çapraz tenant)");
  console.log("\n── ANTALYA BİLİM (antalya-bilim) — kurumsal roller ─");
  console.log("   elif.demir@antalya.edu.tr        → university_admin rank 60 (sadece Antalya'nın tamamı)");
  console.log("   ahmet.yonetici@antalya.edu.tr    → university_admin rank 60 ('son admin' + 'eşit rütbe' testleri için)");
  console.log("   sks@antalya.edu.tr               → student_affairs  (kulüp onay/danışman/moderasyon)");
  console.log("   ogrenci.isleri@antalya.edu.tr    → academic_affairs (fakülte/bölüm/domain)");
  console.log("   moderator@antalya.edu.tr         → content_moderator(duyuru/galeri moderasyonu)");
  console.log("   denetci@antalya.edu.tr           → auditor          (salt-okunur izleme)");
  console.log("   ahmet.hoca@antalya.edu.tr        → advisor  (Yazılım + Fotoğrafçılık danışmanı)");
  console.log("   zeynep.aydin@antalya.edu.tr      → advisor  (Fotoğrafçılık + Müzik danışmanı)");
  console.log("   murat.tekin@antalya.edu.tr       → advisor  (KULÜPSÜZ — danışman atama testi için)");
  console.log("   mustafa.kurt@std.antalya.edu.tr  → student  (Yazılım başkanı)");
  console.log("   can.ozturk@std.antalya.edu.tr    → student  (Yazılım officer'ı + Müzik başkanı)");
  console.log("   ayse.yilmaz@std.antalya.edu.tr   → student  (Fotoğrafçılık başkanı)");
  console.log("   250803001@std.antalya.edu.tr     → student  (Yazılım üyesi, Fotoğrafçılık'ta pending, Satranç başvurusu)");
  console.log("   selin.koc@std.antalya.edu.tr     → student  (Tiyatro (pending kulüp) başkanı, Yazılım'da pending istek)");
  console.log("   emre.aksoy@std.antalya.edu.tr    → student  (Robotik (archived) başkanı, Müzik üyesi)");
  console.log("   burak.demirci@std.antalya.edu.tr → student  (Fotoğrafçılık üyesi, reddedilmiş Kripto başvurusu)");
  console.log("   deniz.kara@std.antalya.edu.tr    → student  (status: pending)");
  console.log("   fatma.sahin@std.antalya.edu.tr   → student  (status: suspended, giriş engellenir)");
  console.log("   Kulüpler: Yazılım(approved/open) Fotoğrafçılık(approved/onaylı) Müzik(approved)");
  console.log("             Tiyatro(pending, danışmansız) Robotik(archived) E-Spor(rejected)");
  console.log("\n── EGE BİLİM (ege-bilim) ──────────────────────────");
  console.log("   okan.yildiz@egebilim.edu.tr      → university_admin (sadece Ege)");
  console.log("   sks@egebilim.edu.tr              → student_affairs  (Ege — tenant izolasyon testi)");
  console.log("   leyla.hoca@egebilim.edu.tr       → advisor  (Yazılım ve Teknoloji danışmanı)");
  console.log("   kemal.hoca@egebilim.edu.tr       → advisor  (KULÜPSÜZ — atama havuzu)");
  console.log("   cem.arslan@std.egebilim.edu.tr   → student  (Yazılım ve Teknoloji başkanı — Antalya'dakiyle AYNI slug!)");
  console.log("   gizem.polat@std.egebilim.edu.tr  → student  (Yazılım officer'ı + Dağcılık başkanı)");
  console.log("   tolga.erden@std.egebilim.edu.tr  → student  (Yazılım üyesi, reddedilmiş Airsoft başvurusu)");
  console.log("   nazli.gunes@std.egebilim.edu.tr  → student  (Dağcılık'ta pending istek, Yapay Zeka başvurusu)");
  console.log("   baris.ucar@std.egebilim.edu.tr   → student  (status: suspended)");
  console.log("   duygu.sari@std.egebilim.edu.tr   → student  (status: pending)");
  console.log("   Kulüpler: Yazılım ve Teknoloji(approved) Dağcılık(approved, danışmansız)");
  console.log("             Sinema(pending) Münazara(archived)");
  console.log("\n── KARADENİZ TEKNOLOJİ (karadeniz-teknoloji) ──────");
  console.log("   hulya.ozkan@kartek.edu.tr        → university_admin (sadece Karadeniz)");
  console.log("   omer.hoca@kartek.edu.tr          → advisor  (Robotik ve Mekatronik danışmanı)");
  console.log("   sevgi.hoca@kartek.edu.tr         → advisor  (KULÜPSÜZ — atama havuzu)");
  console.log("   yusuf.celik@std.kartek.edu.tr    → student  (Robotik başkanı)");
  console.log("   merve.acar@std.kartek.edu.tr     → student  (Robotik'te OFFICER + Deniz Sporları'nda BAŞKAN)");
  console.log("   hakan.turan@std.kartek.edu.tr    → student  (Robotik üyesi, Deniz Sporları'nda pending)");
  console.log("   esra.bulut@std.kartek.edu.tr     → student  (Robotik'te pending istek, Satranç başvurusu)");
  console.log("   Kulüpler: Robotik ve Mekatronik(approved) Deniz Sporları(approved)");
  console.log("             Fotoğrafçılık(pending — Antalya'dakiyle aynı slug)");
}

// Bağlantı havuzu kapatılmadan süreç sonlanmaz: postgres-js açık soketleri
// event loop'ta tutar. Yerelde fark edilmez (terminali kaparsın), ama CI'da
// adım sonsuza kadar asılı kalır.
main()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (err) => {
    console.error("❌ Seeding sırasında hata oluştu:", err);
    await db.$client.end().catch(() => {});
    process.exit(1);
  });
