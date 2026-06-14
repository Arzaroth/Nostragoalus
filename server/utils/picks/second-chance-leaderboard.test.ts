import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser, seedCompetition, makeMatch } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { championPick, bestScorerPick, goalEvent } from '../../../db/schema'
import { awardChampionBonuses } from '../champion/service'
import { awardBestScorerBonuses } from '../bestscorer/service'
import { getLeaderboard } from '../leaderboard/service'

// End-to-end: tournament over, bonuses awarded, leaderboard reflects the
// halving for re-picked champion / best-scorer picks. Each user makes NO match
// predictions, so totalPoints == champion + best-scorer bonus only - isolating
// the bonus impact.
const CHAMP_PTS = 10 // potentialPoints; re-picked pays floor(10/2)=5
const SCORER_BONUS = 10 // re-picked pays floor(10/2)=5
const WINNER = 'BRA'
const TOP_SCORER = 'p-top'

describe('second-chance bonus impact on the leaderboard', () => {
  it('awards full vs halved bonuses across the pick matrix', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)

    // A decided final + a goal for the top scorer (gates the best-scorer award).
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null))!
    const finalId = await makeMatch(db, { competitionId, roundId: finalRound, kickoffTime: new Date('2026-07-19T18:00:00Z'), stage: 'FINAL', status: 'FINISHED', winner: 'HOME' })
    await db.insert(goalEvent).values({ matchId: finalId, competitionId, side: 'HOME', teamName: 'Brazil', playerId: TOP_SCORER, playerName: 'Top Scorer', ownGoal: false })

    // 6 users covering the matrix.
    const champ = async (userId: string, code: string, repicked: boolean) =>
      db.insert(championPick).values({ userId, competitionId, teamCode: code, teamName: code, potentialPoints: CHAMP_PTS, repicked })
    const scorer = async (userId: string, playerId: string, repicked: boolean) =>
      db.insert(bestScorerPick).values({ userId, competitionId, playerId, playerName: playerId, teamCode: 'BRA', teamName: 'Brazil', repicked })

    const u1 = await makeUser(db, 'u1', 'champ-full') // correct champ, not repicked
    const u2 = await makeUser(db, 'u2', 'champ-half') // correct champ, repicked
    const u3 = await makeUser(db, 'u3', 'scorer-full') // correct scorer, not repicked
    const u4 = await makeUser(db, 'u4', 'scorer-half') // correct scorer, repicked
    const u5 = await makeUser(db, 'u5', 'both') // both correct, neither repicked
    const u6 = await makeUser(db, 'u6', 'none') // both wrong

    await champ(u1, WINNER, false)
    await champ(u2, WINNER, true)
    await scorer(u3, TOP_SCORER, false)
    await scorer(u4, TOP_SCORER, true)
    await champ(u5, WINNER, false)
    await scorer(u5, TOP_SCORER, false)
    await champ(u6, 'FRA', false) // wrong champion
    await scorer(u6, 'p-other', false) // wrong scorer

    await awardChampionBonuses(db, competitionId, WINNER)
    await awardBestScorerBonuses(db, competitionId, SCORER_BONUS)

    const rows = await getLeaderboard(db, { competitionId })
    const total = (name: string) => rows.find((r) => r.displayName === name)?.totalPoints

    // Readable simulation output.
    console.log('\n  second-chance bonus simulation (no match predictions):')
    for (const r of [...rows].sort((a, b) => b.totalPoints - a.totalPoints)) {
      console.log(`    ${r.displayName.padEnd(12)} champ:${String(r.championPoints).padStart(2)}  scorer:${String(r.bestScorerPoints).padStart(2)}  total:${r.totalPoints}`)
    }

    expect(total('champ-full')).toBe(10) // full champion
    expect(total('champ-half')).toBe(5) // halved champion
    expect(total('scorer-full')).toBe(10) // full scorer
    expect(total('scorer-half')).toBe(5) // halved scorer
    expect(total('both')).toBe(20) // full champion + full scorer
    expect(total('none')).toBe(0) // nothing correct
    await client.close()
  })
})
