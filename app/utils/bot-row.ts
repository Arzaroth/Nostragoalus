// Inserts the bot's ghost row at its would-be rank without renumbering anyone:
// the server rank already places the bot after every human it ties with. When
// the bot falls beyond the visible page, it is appended with its true rank.
export function insertGhostRow<T extends { rank: number }, B extends { rank: number }>(
  rows: T[],
  bot: B,
): (T | B)[] {
  const index = rows.findIndex((r) => r.rank >= bot.rank)
  if (index === -1) return [...rows, bot]
  return [...rows.slice(0, index), bot, ...rows.slice(index)]
}
