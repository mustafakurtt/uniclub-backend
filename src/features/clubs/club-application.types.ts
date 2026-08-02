import type { Club, ClubApplication } from "./clubs.types";

export interface DecideClubApplicationResult {
  application: ClubApplication;
  club: Club | null;
}
