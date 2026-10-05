/** Byte-order mark so Excel reads the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

const quote = (value: string | number | null | undefined) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Downloads rows as a CSV file that opens in Excel. Amounts are written exactly as the server sent
 * them (decimal strings), never re-calculated in the browser.
 */
export function downloadCsv(fileName: string, rows: (string | number | null | undefined)[][]) {
  const text = rows.map((cells) => cells.map(quote).join(',')).join('\r\n');
  const blob = new Blob([`${BOM}${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** "Bilal Store / Saddar" → "bilal-store-saddar" for file names. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
