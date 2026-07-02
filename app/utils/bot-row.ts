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

// Several ghost rows at once - one per enabled bot persona. Folds the single
// insert lowest-rank first, so each bot lands relative to the rows (real or
// already-placed ghost) settled above it. Bots that tie on rank keep a stable,
// deterministic order. Neither the rows nor the bots array is mutated.
export function insertGhostRows<T extends { rank: number }, B extends { rank: number }>(
  rows: T[],
  bots: B[],
): (T | B)[] {
  return [...bots].sort((a, b) => a.rank - b.rank).reduce<(T | B)[]>((acc, bot) => insertGhostRow(acc, bot), rows)
}
