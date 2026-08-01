export const AcademicTermPermission = {
  MANAGE: "university.academic_term.manage",
} as const;

export type AcademicTermPermission = (typeof AcademicTermPermission)[keyof typeof AcademicTermPermission];

export const ACADEMIC_TERM_PERMISSION_CATALOG: { key: AcademicTermPermission; description: string }[] = [
  {
    key: AcademicTermPermission.MANAGE,
    description: "Akademik dönem tanımlama ve yönetimi",
  },
];
