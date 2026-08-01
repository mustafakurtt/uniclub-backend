-- Tek adımlı eski başvurularda approver_role "advisor" bilgi amaçlıydı; karar club.approve yetkisinden geldi.
-- Çok kademeli zincirde (step 1 advisor + step 2 …) advisor gerçek karar vericidir — dokunulmaz.
UPDATE "club_application_approvals" AS a
SET "approver_role" = 'club_approver'
WHERE a."approver_role" = 'advisor'
  AND (SELECT COUNT(*)::int FROM "club_application_approvals" b WHERE b."application_id" = a."application_id") = 1;
