import postgres from "postgres";

/**
 * Seed sonrası üyelik başlangıç olaylarını üretir (migration backfill seed'den önce koştuğu için).
 * Idempotent — mevcut joined olayı olan satırlara dokunmaz.
 */
export async function backfillMembershipJoinedEvents(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO club_membership_events (club_id, user_id, university_id, event_type, role, occurred_at)
      SELECT m.club_id, m.user_id, m.university_id, 'joined'::club_membership_event_type, m.role, m.joined_at
      FROM club_members m
      WHERE m.status = 'approved' AND m.left_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM club_membership_events e
          WHERE e.club_id = m.club_id AND e.user_id = m.user_id AND e.event_type = 'joined'
        )
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
