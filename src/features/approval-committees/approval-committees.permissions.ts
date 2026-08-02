export const ApprovalCommitteePermission = {
  MANAGE: "university.approval_committee.manage",
} as const;

export type ApprovalCommitteePermission =
  (typeof ApprovalCommitteePermission)[keyof typeof ApprovalCommitteePermission];

export const APPROVAL_COMMITTEE_PERMISSION_CATALOG: {
  key: ApprovalCommitteePermission;
  description: string;
}[] = [
  {
    key: ApprovalCommitteePermission.MANAGE,
    description: "Onay kurullarını listeleme, oluşturma ve üye yönetimi",
  },
];
