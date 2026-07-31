import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, reqAuth, data } from "./helpers";

const UNIVERSITY_SLUG = "antalya-bilim";
const EGE_SLUG = "egebilim";
const TECH_CLUB_SLUG = "yazilim-teknoloji";
const FUTURE_SCHEDULE = "2026-12-31T09:00";
const FUTURE_START = "2026-12-31T14:00:00.000Z";

const FORBIDDEN_FIELDS = [
  "email",
  "studentNumber",
  "passwordHash",
  "clubMembers",
  "advisors",
  "goingCount",
  "myRsvp",
  "creator",
  "firstName",
  "lastName",
  "userId",
  "attendees",
];

function assertNoForbiddenFields(obj: unknown, path = ""): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) assertNoForbiddenFields(item, path);
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    expect(FORBIDDEN_FIELDS.includes(key)).toBe(false);
    assertNoForbiddenFields(value, `${path}.${key}`);
  }
}

describe("kamuya açık yüzey (T10.3/T10.5)", () => {
  let mustafa: string;
  let ayse: string;
  let techClubId: string;
  let photoClubId: string;
  let publicActivityId: string;
  let membersOnlyActivityId: string;

  beforeAll(async () => {
    [mustafa, ayse] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
    ]);

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === TECH_CLUB_SLUG)!.id;
    photoClubId = clubs.find((c) => c.slug === "fotografcilik")!.id;

    const antalyaActivities = await data<Array<{ id: string; title: string }>>(
      await get("/api/activities?scope=upcoming", mustafa)
    );
    publicActivityId = antalyaActivities.find((a) => a.title === "React ile Web Atölyesi")!.id;
    membersOnlyActivityId = (
      await data<Array<{ id: string; title: string }>>(
        await get(`/api/clubs/${photoClubId}/activities`, ayse)
      )
    ).find((a) => a.title === "Üyelere Özel Karanlık Oda Atölyesi")!.id;
  });

  it("kimliksiz istek yayınlanmış university etkinliğini görebilir", async () => {
    const res = await get(
      `/api/public/universities/${UNIVERSITY_SLUG}/activities/${publicActivityId}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("React ile Web Atölyesi");
    expect(body.data.visibility).toBeUndefined();
    assertNoForbiddenFields(body.data);
  });

  it("members görünürlüklü etkinlik kimliksiz istekte 404", async () => {
    const res = await get(
      `/api/public/universities/${UNIVERSITY_SLUG}/activities/${membersOnlyActivityId}`
    );
    expect(res.status).toBe(404);
  });

  it("draft ve zamanlanmış taslak kimliksiz istekte 404", async () => {
    const draftTitle = `Public draft ${Date.now()}`;
    const createDraft = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: draftTitle,
      startsAt: FUTURE_START,
      publish: false,
    });
    expect(createDraft.status).toBe(201);
    const draftId = (await createDraft.json()).data.id;

    expect(
      (await get(`/api/public/universities/${UNIVERSITY_SLUG}/activities/${draftId}`)).status
    ).toBe(404);

    const scheduledTitle = `Public scheduled ${Date.now()}`;
    const createScheduled = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: scheduledTitle,
      startsAt: FUTURE_START,
      publish: false,
      scheduledPublishAtLocal: FUTURE_SCHEDULE,
    });
    expect(createScheduled.status).toBe(201);
    const scheduledId = (await createScheduled.json()).data.id;

    expect(
      (await get(`/api/public/universities/${UNIVERSITY_SLUG}/activities/${scheduledId}`)).status
    ).toBe(404);
  });

  it("kamuya açık kulüp yanıtında kişisel veri alanı yok", async () => {
    const res = await get(
      `/api/public/universities/${UNIVERSITY_SLUG}/clubs/${TECH_CLUB_SLUG}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe(TECH_CLUB_SLUG);
    assertNoForbiddenFields(body.data);
  });

  it("başka tenant'ın kaynağı sızmıyor", async () => {
    expect(
      (await get(`/api/public/universities/${EGE_SLUG}/activities/${publicActivityId}`)).status
    ).toBe(404);

    expect((await get(`/api/public/universities/${UNIVERSITY_SLUG}/clubs/ege-tech`)).status).toBe(
      404
    );

    expect(
      (await get(`/api/public/universities/${EGE_SLUG}/clubs/${TECH_CLUB_SLUG}`)).status
    ).toBe(404);
  });
});
