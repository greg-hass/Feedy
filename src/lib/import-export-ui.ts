export type ImportSummary = {
  imported?: number;
  duplicates?: number;
  failed?: number;
  foldersCreated?: number;
};

export function formatImportSummary(result: ImportSummary) {
  const parts = [
    `${result.imported ?? 0} imported`,
    `${result.duplicates ?? 0} duplicates skipped`,
    `${result.foldersCreated ?? 0} folders created`,
  ];

  if ((result.failed ?? 0) > 0) {
    parts.push(`${result.failed} failed`);
  }

  return parts.join(" · ");
}
