export const ExportPermission = {
  GENERATE: "university.export.generate",
} as const;

export type ExportPermission = (typeof ExportPermission)[keyof typeof ExportPermission];

export const EXPORT_PERMISSION_CATALOG: {
  key: ExportPermission;
  description: string;
}[] = [
  {
    key: ExportPermission.GENERATE,
    description: "Kurumsal raporları Excel/CSV olarak dışa aktarma",
  },
];
