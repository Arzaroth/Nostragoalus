// RFC 4180 CSV serialization for the client-side exports (the prize winners list).

// Excel and Google Sheets execute a cell that opens with a formula character, so a
// player-chosen display name like `=HYPERLINK(...)` would run in the league owner's
// spreadsheet the moment they open the export. A leading apostrophe forces the cell
// to text and still reads as the original value.
const FORMULA_LEAD = /^[=+\-@\t\r]/

function cell(value: string | number): string {
  const raw = String(value)
  const safe = FORMULA_LEAD.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

// Rows in, one CSV document out - the first row is the header like any other.
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

// Excel reads a UTF-8 CSV as the local 8-bit codepage unless the file opens with a
// byte-order mark, which turns an accented name into mojibake.
export function withBom(csv: string): string {
  return `\uFEFF${csv}`
}

// A filesystem-safe file name from a league name: "Les Cop@ins" -> "les-cop-ins".
// A name with nothing ASCII in it (Arabic, Thai) slugs to empty and falls back.
export function csvFileName(prefix: string, name: string, isoDate: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'league'}-${isoDate}.csv`
}
