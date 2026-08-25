import type { RewardWinnerExportRow } from '#shared/types/rewards'
import { slugify } from './slug'

// RFC 4180 CSV serialization for the client-side exports (the prize winners list).

// Excel and Google Sheets execute a cell that opens with a formula character, so a
// player-chosen display name like `=HYPERLINK(...)` would run in the league owner's
// spreadsheet the moment they open the export. A leading apostrophe keeps the cell
// inert. It costs a visible apostrophe on the rare legitimate label that starts
// this way (`+1 ticket`), which is the right side of that trade.
const FORMULA_LEAD = /^[=+\-@\t\r]/

function cell(value: string | number): string {
  // Only text can be a formula; prefixing a number would turn the column to text
  // and break sorting and totals in the spreadsheet.
  const safe = typeof value === 'string' && FORMULA_LEAD.test(value) ? `'${value}` : String(value)
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

// Header and accessor are paired so a new column cannot land under the wrong
// heading - the two positional lists this replaced could drift by one edit.
const WINNER_COLUMNS: { header: string; cell: (row: RewardWinnerExportRow) => string | number }[] = [
  { header: 'criterion', cell: (r) => r.type },
  { header: 'prize', cell: (r) => r.prizeLabel },
  { header: 'team', cell: (r) => r.teamCode ?? '' },
  { header: 'player', cell: (r) => r.displayName },
  { header: 'player_id', cell: (r) => r.userId },
  { header: 'email', cell: (r) => r.email },
  { header: 'metric', cell: (r) => r.metric },
  { header: 'value', cell: (r) => r.value },
]

// The winners export as a CSV document. A concealed holder keeps their row with a
// blank name and email; player_id is what still tells the manager the row is a
// real person they may not identify rather than a broken export.
export function winnersCsv(rows: RewardWinnerExportRow[]): string {
  return toCsv([WINNER_COLUMNS.map((c) => c.header), ...rows.map((row) => WINNER_COLUMNS.map((c) => c.cell(row)))])
}

// Excel reads a UTF-8 CSV as the local 8-bit codepage unless the file opens with a
// byte-order mark, which turns an accented name into mojibake.
export function withBom(csv: string): string {
  return `\uFEFF${csv}`
}

// prizes-<league>-<YYYY-MM-DD>.csv, stamped with the manager's LOCAL date - a UTC
// stamp puts two exports from one working day into differently named files.
export function csvFileName(prefix: string, name: string, date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${prefix}-${slugify(name) || 'league'}-${y}-${m}-${d}.csv`
}
