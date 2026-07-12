import { describe, it, expect } from 'vitest'
import { insertGhostRow, insertGhostRows } from './bot-row'

function rows(...ranks: number[]) {
  return ranks.map((rank) => ({ rank, userId: `u${rank}` }))
}

describe('insertGhostRow', () => {
  it('inserts at the top when the bot leads', () => {
    expect(insertGhostRow(rows(1, 2, 3), { rank: 1, bot: true }).map((r) => r.rank)).toEqual([1, 1, 2, 3])
    expect(insertGhostRow(rows(1, 2, 3), { rank: 1, bot: true })[0]).toMatchObject({ bot: true })
  })

  it('inserts mid-list before the first row of equal or higher rank', () => {
    const out = insertGhostRow(rows(1, 2, 3, 4), { rank: 3, bot: true })
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 3, 4])
    expect(out[2]).toMatchObject({ bot: true })
  })

  it('keeps tied humans above the bot', () => {
    // Server rank already encodes the tie rule: a tied human got rank 2, the bot rank 3.
    const out = insertGhostRow(rows(1, 2, 3), { rank: 3, bot: true })
    expect(out[2]).toMatchObject({ bot: true })
    expect(out[3]).toMatchObject({ userId: 'u3' })
  })

  it('appends with its true rank when beyond the visible page', () => {
    const out = insertGhostRow(rows(1, 2, 3), { rank: 42, bot: true })
    expect(out).toHaveLength(4)
    expect(out[3]).toMatchObject({ rank: 42, bot: true })
  })

  it('handles an empty board', () => {
    expect(insertGhostRow([], { rank: 1, bot: true })).toEqual([{ rank: 1, bot: true }])
  })

  it('does not mutate the input rows', () => {
    const input = rows(1, 2)
    insertGhostRow(input, { rank: 1, bot: true })
    expect(input.map((r) => r.rank)).toEqual([1, 2])
  })
})

describe('insertGhostRows', () => {
  it('places several ghosts each at its own would-be rank', () => {
    const out = insertGhostRows(rows(1, 2, 3, 4), [
      { rank: 5, id: 'a' },
      { rank: 2, id: 'b' },
    ])
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2, 3, 4, 5])
    // The rank-2 ghost sits just before the human it ties; the rank-5 appends.
    expect(out[1]).toMatchObject({ id: 'b' })
    expect(out[5]).toMatchObject({ id: 'a' })
  })

  it('is a no-op with no bots and does not mutate inputs', () => {
    const input = rows(1, 2)
    const bots: { rank: number }[] = []
    expect(insertGhostRows(input, bots).map((r) => r.rank)).toEqual([1, 2])
    expect(input.map((r) => r.rank)).toEqual([1, 2])
  })

  it('keeps a deterministic order for ghosts that tie on rank', () => {
    const out = insertGhostRows(rows(1, 2), [
      { rank: 3, id: 'x' },
      { rank: 3, id: 'y' },
    ])
    expect(out.map((r) => (r as { id?: string }).id ?? `u${r.rank}`)).toEqual(['u1', 'u2', 'y', 'x'])
  })
})
