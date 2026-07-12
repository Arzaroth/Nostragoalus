import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makeReaction, makeUser, seedCompetition } from '../../../tests/factories'
import {
  getCompetitionReactionTotals,
  getMatchReactionTotals,
  getMyCompetitionReactions,
  getMyReaction,
  setReaction,
} from './service'
import { matchReaction } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'

const NOW = new Date('2026-06-10T12:00:00Z')
const STARTED = new Date('2026-06-10T10:00:00Z') // kicked off two hours ago
const FUTURE = new Date('2026-06-11T16:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, roundId, userId }
}

async function countRows(db: Awaited<ReturnType<typeof setup>>['db'], matchId: string): Promise<number> {
  const rows = await db.select().from(matchReaction).where(eq(matchReaction.matchId, matchId))
  return rows.length
}

describe('setReaction', () => {
  it('rejects an unknown reaction', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await expect(
      setReaction(db, { userId, matchId: m, emoji: 'NOPE' as never }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws when the match does not exist', async () => {
    const { db, client, userId } = await setup()
    await expect(setReaction(db, { userId, matchId: 'nope', emoji: 'FIRE' }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects reactions before kickoff', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await expect(setReaction(db, { userId, matchId: m, emoji: 'FIRE' }, NOW)).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('stores a reaction once kickoff has passed', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await setReaction(db, { userId, matchId: m, emoji: 'FIRE' }, NOW)
    expect(await getMyReaction(db, userId, m)).toBe('FIRE')
    expect((await getMatchReactionTotals(db, m)).FIRE).toBe(1)
    await client.close()
  })

  it('changes the reaction in place without adding a row', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await setReaction(db, { userId, matchId: m, emoji: 'FIRE' }, NOW)
    await setReaction(db, { userId, matchId: m, emoji: 'WOW' }, NOW)
    expect(await getMyReaction(db, userId, m)).toBe('WOW')
    expect(await countRows(db, m)).toBe(1)
    const totals = await getMatchReactionTotals(db, m)
    expect(totals.FIRE).toBe(0)
    expect(totals.WOW).toBe(1)
    await client.close()
  })

  it('clears the reaction when emoji is null', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await setReaction(db, { userId, matchId: m, emoji: 'FIRE' }, NOW)
    await setReaction(db, { userId, matchId: m, emoji: null }, NOW)
    expect(await getMyReaction(db, userId, m)).toBeNull()
    expect(await countRows(db, m)).toBe(0)
    await client.close()
  })

  it('treats clearing a missing reaction as a no-op', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await setReaction(db, { userId, matchId: m, emoji: null }, NOW)
    expect(await getMyReaction(db, userId, m)).toBeNull()
    await client.close()
  })
})

describe('getMatchReactionTotals', () => {
  it('returns all zeros for a match with no reactions', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    expect(await getMatchReactionTotals(db, m)).toEqual({ FIRE: 0, GOAL: 0, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 0 })
    await client.close()
  })

  it('counts reactions grouped by emoji', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const u3 = await makeUser(db, 'u3')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await makeReaction(db, { userId, matchId: m, emoji: 'FIRE' })
    await makeReaction(db, { userId: u2, matchId: m, emoji: 'FIRE' })
    await makeReaction(db, { userId: u3, matchId: m, emoji: 'WOW' })
    const totals = await getMatchReactionTotals(db, m)
    expect(totals.FIRE).toBe(2)
    expect(totals.WOW).toBe(1)
    expect(totals.SAD).toBe(0)
    await client.close()
  })

  it('counts only league members when scoped to a league', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const u3 = await makeUser(db, 'u3')
    const leagueId = await makeLeague(db, { competitionId, ownerId: userId })
    await addLeagueMember(db, leagueId, u2)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await makeReaction(db, { userId, matchId: m, emoji: 'FIRE' }) // member
    await makeReaction(db, { userId: u2, matchId: m, emoji: 'WOW' }) // member
    await makeReaction(db, { userId: u3, matchId: m, emoji: 'FIRE' }) // not a member
    const global = await getMatchReactionTotals(db, m)
    expect(global.FIRE).toBe(2)
    expect(global.WOW).toBe(1)
    const scoped = await getMatchReactionTotals(db, m, { leagueId })
    expect(scoped.FIRE).toBe(1)
    expect(scoped.WOW).toBe(1)
    await client.close()
  })
})

describe('getMyReaction', () => {
  it('is null when the user has not reacted', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    expect(await getMyReaction(db, userId, m)).toBeNull()
    await client.close()
  })
})

describe('getCompetitionReactionTotals', () => {
  it('returns an empty map when nothing has been reacted to', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    expect(await getCompetitionReactionTotals(db, competitionId)).toEqual({})
    await client.close()
  })

  it('groups counts per match, only for matches that have reactions', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED }) // no reactions
    await makeReaction(db, { userId, matchId: m1, emoji: 'FIRE' })
    await makeReaction(db, { userId: u2, matchId: m1, emoji: 'FIRE' })
    await makeReaction(db, { userId, matchId: m2, emoji: 'WOW' })
    const map = await getCompetitionReactionTotals(db, competitionId)
    expect(Object.keys(map).sort()).toEqual([m1, m2].sort())
    expect(map[m1].FIRE).toBe(2)
    expect(map[m1].WOW).toBe(0)
    expect(map[m2].WOW).toBe(1)
    await client.close()
  })

  it('counts only league members when scoped to a league', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const leagueId = await makeLeague(db, { competitionId, ownerId: userId })
    await addLeagueMember(db, leagueId, u2)
    const outsider = await makeUser(db, 'u3')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    await makeReaction(db, { userId, matchId: m, emoji: 'FIRE' }) // member
    await makeReaction(db, { userId: u2, matchId: m, emoji: 'WOW' }) // member
    await makeReaction(db, { userId: outsider, matchId: m, emoji: 'FIRE' }) // not a member
    expect((await getCompetitionReactionTotals(db, competitionId))[m].FIRE).toBe(2)
    const scoped = await getCompetitionReactionTotals(db, competitionId, { leagueId })
    expect(scoped[m].FIRE).toBe(1)
    expect(scoped[m].WOW).toBe(1)
    await client.close()
  })

  it('excludes reactions from other competitions', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const otherComp = await seedCompetition(db)
    const otherRound = (await findRoundId(db, otherComp, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    const other = await makeMatch(db, { competitionId: otherComp, roundId: otherRound, kickoffTime: STARTED })
    await makeReaction(db, { userId, matchId: m, emoji: 'FIRE' })
    await makeReaction(db, { userId, matchId: other, emoji: 'WOW' })
    const map = await getCompetitionReactionTotals(db, competitionId)
    expect(Object.keys(map)).toEqual([m])
    await client.close()
  })
})

describe('getMyCompetitionReactions', () => {
  it('maps each reacted match to the caller own emoji, this competition only', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const otherComp = await seedCompetition(db)
    const otherRound = (await findRoundId(db, otherComp, 'GROUP', 1)) as string
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: STARTED })
    const other = await makeMatch(db, { competitionId: otherComp, roundId: otherRound, kickoffTime: STARTED })
    await makeReaction(db, { userId, matchId: m1, emoji: 'FIRE' })
    await makeReaction(db, { userId, matchId: m2, emoji: 'SAD' })
    await makeReaction(db, { userId, matchId: other, emoji: 'WOW' }) // other competition
    await makeReaction(db, { userId: u2, matchId: m1, emoji: 'ANGRY' }) // someone else
    const mine = await getMyCompetitionReactions(db, userId, competitionId)
    expect(mine).toEqual({ [m1]: 'FIRE', [m2]: 'SAD' })
    await client.close()
  })

  it('returns an empty map when the caller has not reacted', async () => {
    const { db, client, competitionId, userId } = await setup()
    expect(await getMyCompetitionReactions(db, userId, competitionId)).toEqual({})
    await client.close()
  })
})
