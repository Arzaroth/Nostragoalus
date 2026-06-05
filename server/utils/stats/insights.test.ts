import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { getMatchInsights, minuteValue } from './insights'
import { goalEvent, match } from '../../../db/schema'

const NOW = new Date('2026-06-13T00:00:00Z')

describe('getMatchInsights', () => {
  it('includes possession and goals stored for the match', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, {
      competitionId,
      roundId: md1,
      groupName: 'A',
      stage: 'GROUP',
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      homeTeam: 'A',
      homeTeamCode: 'A',
      awayTeam: 'B',
      awayTeamCode: 'B',
    })
    await db.update(match).set({ possessionHome: '55', possessionAway: '45' }).where(eq(match.id, mid))
    await db.insert(goalEvent).values({
      matchId: mid,
      competitionId,
      side: 'HOME',
      teamName: 'A',
      teamCode: 'A',
      playerName: 'Scorer',
      ownGoal: false,
      minute: "10'",
    })
    await db.insert(goalEvent).values({ matchId: mid, competitionId, side: 'AWAY', teamName: 'B', teamCode: 'B', playerName: 'Late', ownGoal: false, minute: "45'+2'" })
    await db.insert(goalEvent).values({ matchId: mid, competitionId, side: 'HOME', teamName: 'A', teamCode: 'A', playerName: 'Early', ownGoal: false, minute: "5'" })

    const insights = await getMatchInsights(db, mid, NOW)
    expect(insights!.possession).toEqual({ home: 55, away: 45 })
    // goals sorted chronologically regardless of insert/side order
    expect(insights!.goals.map((g) => g.minute)).toEqual(["5'", "10'", "45'+2'"])
    await client.close()
  })

  it('returns null for an unknown match', async () => {
    const { db, client } = await createTestDb()
    expect(await getMatchInsights(db, 'nope', NOW)).toBeNull()
    await client.close()
  })

  it('builds group standings, form, next matches and head-to-head', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const md2 = (await findRoundId(db, competitionId, 'GROUP', 2)) as string

    const base = { competitionId, groupName: 'A', stage: 'GROUP' as const }
    // matchday 1 (finished)
    await makeMatch(db, { ...base, roundId: md1, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0, homeTeam: 'Mexico', homeTeamCode: 'MEX', awayTeam: 'Canada', awayTeamCode: 'CAN' })
    await makeMatch(db, { ...base, roundId: md1, kickoffTime: new Date('2026-06-11T19:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 1, homeTeam: 'Brazil', homeTeamCode: 'BRA', awayTeam: 'Spain', awayTeamCode: 'ESP' })
    // matchday 2: the focus match (upcoming) + a future one for "next"
    const focus = await makeMatch(db, { ...base, roundId: md2, kickoffTime: new Date('2026-06-15T16:00:00Z'), status: 'SCHEDULED', homeTeam: 'Mexico', homeTeamCode: 'MEX', awayTeam: 'Brazil', awayTeamCode: 'BRA' })
    await makeMatch(db, { ...base, roundId: md2, kickoffTime: new Date('2026-06-16T16:00:00Z'), status: 'SCHEDULED', homeTeam: 'Mexico', homeTeamCode: 'MEX', awayTeam: 'Spain', awayTeamCode: 'ESP' })

    const insights = await getMatchInsights(db, focus, NOW)
    expect(insights).not.toBeNull()
    expect(insights!.standings).toHaveLength(4)
    expect(insights!.standings![0].name).toBe('Mexico') // 3 pts, gd +2
    expect(insights!.form.home[0]).toMatchObject({ result: 'W', opponent: 'Canada', score: '2–0' })
    expect(insights!.next.home.map((n) => n.opponent)).toContain('Spain')
    expect(insights!.headToHead).toEqual([])
    await client.close()
  })

  it('handles a knockout match: no standings, W/D/L form, away results, and head-to-head', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const r16 = (await findRoundId(db, competitionId, 'R16', null)) as string

    const grp = { competitionId, roundId: md1, groupName: 'A', stage: 'GROUP' as const, status: 'FINISHED' as const }
    await makeMatch(db, { ...grp, kickoffTime: new Date('2026-06-10T16:00:00Z'), fullTimeHome: 0, fullTimeAway: 1, homeTeam: 'B', homeTeamCode: 'B', awayTeam: 'D', awayTeamCode: 'D' }) // B loss
    await makeMatch(db, { ...grp, kickoffTime: new Date('2026-06-11T16:00:00Z'), fullTimeHome: 0, fullTimeAway: 2, homeTeam: 'A', homeTeamCode: 'A', awayTeam: 'B', awayTeamCode: 'B' }) // B away win + h2h vs A
    await makeMatch(db, { ...grp, kickoffTime: new Date('2026-06-12T16:00:00Z'), fullTimeHome: 1, fullTimeAway: 1, homeTeam: 'B', homeTeamCode: 'B', awayTeam: 'C', awayTeamCode: 'C' }) // B draw

    const focus = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: new Date('2026-06-28T16:00:00Z'), status: 'SCHEDULED', homeTeam: 'B', homeTeamCode: 'B', awayTeam: 'A', awayTeamCode: 'A' })

    const insights = await getMatchInsights(db, focus, NOW)
    expect(insights!.standings).toBeNull()
    expect(insights!.form.home.map((f) => f.result)).toEqual(['D', 'W', 'L'])
    expect(insights!.form.away.map((f) => f.result)).toEqual(['L'])
    expect(insights!.headToHead.length).toBeGreaterThan(0)
    await client.close()
  })

  it('decides level-knockout form by the penalty shootout', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const r16 = (await findRoundId(db, competitionId, 'R16', null)) as string
    const sf = (await findRoundId(db, competitionId, 'SF', null)) as string
    const pens = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: new Date('2026-06-28T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 1, homeTeam: 'B', homeTeamCode: 'B', awayTeam: 'C', awayTeamCode: 'C' })
    await db.update(match).set({ penaltiesHome: 4, penaltiesAway: 2 }).where(eq(match.id, pens))
    const focus = await makeMatch(db, { competitionId, roundId: sf, stage: 'SF', kickoffTime: new Date('2026-07-05T16:00:00Z'), status: 'SCHEDULED', homeTeam: 'B', homeTeamCode: 'B', awayTeam: 'C', awayTeamCode: 'C' })

    const insights = await getMatchInsights(db, focus, NOW)
    expect(insights!.form.home[0]).toMatchObject({ result: 'W', score: '1–1 (4–2p)' })
    expect(insights!.form.away[0]).toMatchObject({ result: 'L', score: '1–1 (2–4p)' })
    await client.close()
  })
})

describe('minuteValue', () => {
  it('parses minutes with stoppage time and falls back for blanks', () => {
    expect(minuteValue("9'")).toBe(900)
    expect(minuteValue("45'+2'")).toBe(4502)
    expect(minuteValue(null)).toBe(1e9)
    expect(minuteValue('?')).toBe(1e9)
  })
})
