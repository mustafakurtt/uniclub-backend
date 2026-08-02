export type AuditPeriodBounds = {
  from: Date;
  to: Date;
  academicTermId: string | null;
  academicTermName: string | null;
};

export type AuditActivitySummary = {
  period: {
    from: string;
    to: string;
    academicTermId: string | null;
    academicTermName: string | null;
  };
  counts: {
    applicationsSubmitted: number;
    applicationsApproved: number;
    applicationsRejected: number;
    applicationsRevisionRequested: number;
    clubsCreated: number;
    clubsClosed: number;
    generalMeetingsHeld: number;
    handoversRecorded: number;
    advisorInvitationsAccepted: number;
    advisorInvitationsDeclined: number;
    activitiesHeld: number;
  };
};

export type AuditDecisionActor = {
  id: string;
  displayName: string | null;
  anonymized: boolean;
};

export type AuditDecisionListItem = {
  id: string;
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
  actor: AuditDecisionActor | null;
  note: string | null;
};
