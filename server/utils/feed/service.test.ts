import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getFeedMatches } from './service'

const NOW = new Date('2026-06-26T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('getFeedMatches', () => {
  it('returns active-competition fixtures within the 7-day window, ordered, with a predicted flag', async () => {
    const { db, client } = await createTestDb()
    try {
      const user = await makeUser(db, 'u1')
      const active = await seedCompetition(db, { slug: 'wc-2026', name: 'World Cup 2026' })
      const inactive = await seedCompetition(db, { slug: 'wc-2022', name: 'World Cup 2022', isActive: false })
      const rActive = (await findRoundId(db, active, 'GROUP', 1)) as string
      const rInactive = (await findRoundId(db, inactive, 'GROUP', 1)) as string

      const future = await makeMatch(db, { competitionId: active, roundId: rActive, kickoffTime: new Date(NOW.getTime() + 2 * DAY), homeTeam: 'France', awayTeam: 'Brazil' })
      const recent = await makeMatch(db, { competitionId: active, roundId: rActive, kickoffTime: new Date(NOW.getTime() - 2 * DAY), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0 })
      // Outside the window (older than 7 days) and an inactive competition: both excluded.
      await makeMatch(db, { competitionId: active, roundId: rActive, kickoffTime: new Date(NOW.getTime() - 8 * DAY), status: 'FINISHED' })
      await makeMatch(db, { competitionId: inactive, roundId: rInactive, kickoffTime: new Date(NOW.getTime() + 1 * DAY) })

      await makePrediction(db, { userId: user, matchId: future, roundId: rActive, home: 1, away: 0 })

      const feed = await getFeedMatches(db, user, NOW)
      expect(feed.map((m) => m.id)).toEqual([recent, future])
      expect(feed[0].competitionName).toBe('World Cup 2026')
      expect(feed[0].competitionSlug).toBe('wc-2026')
      expect(feed.find((m) => m.id === future)?.predicted).toBe(true)
      expect(feed.find((m) => m.id === recent)?.predicted).toBe(false)
    } finally {
      await client.close()
    }
  })

  it('returns an empty list when nothing falls in the window', async () => {
    const { db, client } = await createTestDb()
    try {
      const user = await makeUser(db, 'u1')
      const comp = await seedCompetition(db)
      const r = (await findRoundId(db, comp, 'GROUP', 1)) as string
      await makeMatch(db, { competitionId: comp, roundId: r, kickoffTime: new Date(NOW.getTime() - 30 * DAY), status: 'FINISHED' })
      expect(await getFeedMatches(db, user, NOW)).toEqual([])
    } finally {
      await client.close()
    }
  })
})
