export type SpreadsheetValue = string | number | boolean | null;

export async function downloadXlsx(
  filename: string,
  header: string[],
  rows: SpreadsheetValue[][],
): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const data = [
    header.map(value => ({ value, fontWeight: 'bold' as const, backgroundColor: '#EEF2FF' })),
    ...rows,
  ];
  const columns = header.map((title, columnIndex) => {
    const longestValue = rows.reduce((max, row) => Math.max(max, String(row[columnIndex] ?? '').length), title.length);
    return { width: Math.min(Math.max(longestValue + 3, 14), 52) };
  });
  const normalizedFilename = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  await writeExcelFile(data, { columns, stickyRowsCount: 1 }).toFile(normalizedFilename);
}
