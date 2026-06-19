import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { NotFoundError, ValidationError } from '../errors'
import { addMatchMedia, deleteMatchMedia, listMatchMedia, pruneLiveMediaForFinishedMatches } from './service'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const matchId = await makeMatch(ctx.db, { competitionId, roundId, kickoffTime: new Date('2026-06-12T16:00:00Z') })
  return { ...ctx, competitionId, matchId }
}

describe('addMatchMedia', () => {
  it('inserts a link and resolves embeddable from the whitelist by default', async () => {
    const { db, client, matchId } = await setup()
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://www.youtube.com/watch?v=abc123' })
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://sketchystream.example/x', label: 'Mirror' })

    const media = await listMatchMedia(db, matchId)
    expect(media).toHaveLength(2)
    expect(media.find((m) => m.url.includes('youtube'))?.embeddable).toBe(true)
    const grey = media.find((m) => m.url.includes('sketchystream'))
    expect(grey?.embeddable).toBe(false)
    expect(grey?.label).toBe('Mirror')
    await client.close()
  })

  it('honours an explicit embeddable override over the whitelist', async () => {
    const { db, client, matchId } = await setup()
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://sketchystream.example/x', embeddable: true })
    await addMatchMedia(db, { matchId, kind: 'HIGHLIGHTS', url: 'https://www.youtube.com/watch?v=zzz', embeddable: false })

    const media = await listMatchMedia(db, matchId)
    expect(media.find((m) => m.url.includes('sketchystream'))?.embeddable).toBe(true)
    expect(media.find((m) => m.url.includes('youtube'))?.embeddable).toBe(false)
    await client.close()
  })

  it('stores the per-link iframe overrides and sanitises the allow policy', async () => {
    const { db, client, matchId } = await setup()
    await addMatchMedia(db, {
      matchId,
      kind: 'LIVE',
      url: 'https://ppv.example/embed/x',
      embeddable: true,
      sandbox: false,
      allow: "autoplay; camera 'self'; <script>",
    })
    const [m] = await listMatchMedia(db, matchId)
    expect(m.sandbox).toBe(false)
    // "camera 'self'" and "<script>" are not bare tokens, so only autoplay survives.
    expect(m.allow).toBe('autoplay')
    await client.close()
  })

  it('leaves sandbox/allow null when not provided', async () => {
    const { db, client, matchId } = await setup()
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://youtu.be/abc123' })
    const [m] = await listMatchMedia(db, matchId)
    expect(m.sandbox).toBeNull()
    expect(m.allow).toBeNull()
    await client.close()
  })

  it('rejects a non-https url', async () => {
    const { db, client, matchId } = await setup()
    await expect(addMatchMedia(db, { matchId, kind: 'LIVE', url: 'http://insecure.example/x' })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects an unknown match', async () => {
    const { db, client } = await setup()
    await expect(addMatchMedia(db, { matchId: 'nope', kind: 'LIVE', url: 'https://youtu.be/abc123' })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('listMatchMedia', () => {
  it('orders by kind then creation and scopes to the match', async () => {
    const { db, client, competitionId, matchId } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const other = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-13T16:00:00Z') })
    await addMatchMedia(db, { matchId, kind: 'REPLAY', url: 'https://youtu.be/replay1' })
    await addMatchMedia(db, { matchId, kind: 'HIGHLIGHTS', url: 'https://youtu.be/high1' })
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://youtu.be/live1' })
    await addMatchMedia(db, { matchId: other, kind: 'LIVE', url: 'https://youtu.be/otherlive' })

    // Postgres orders an enum by its declared order (LIVE, REPLAY, HIGHLIGHTS).
    const media = await listMatchMedia(db, matchId)
    expect(media.map((m) => m.kind)).toEqual(['LIVE', 'REPLAY', 'HIGHLIGHTS'])
    const otherMedia = await listMatchMedia(db, other)
    expect(otherMedia.map((m) => m.url)).toEqual(['https://youtu.be/otherlive'])
    await client.close()
  })
})

describe('deleteMatchMedia', () => {
  it('removes a link scoped to its match and 404s on a missing id or wrong match', async () => {
    const { db, client, competitionId, matchId } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const other = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-13T16:00:00Z') })
    const row = await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://youtu.be/abc123' })
    // The [id] path is load-bearing: deleting through the wrong match must 404.
    await expect(deleteMatchMedia(db, other, row.id)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listMatchMedia(db, matchId)).toHaveLength(1)
    await deleteMatchMedia(db, matchId, row.id)
    expect(await listMatchMedia(db, matchId)).toHaveLength(0)
    await expect(deleteMatchMedia(db, matchId, row.id)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('pruneLiveMediaForFinishedMatches', () => {
  it('clears LIVE links on over matches (finished or awarded), keeps replays and live matches', async () => {
    const { db, client, competitionId, matchId } = await setup() // matchId is SCHEDULED
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const finished = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
    })
    const awarded = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'AWARDED',
    })
    await addMatchMedia(db, { matchId: finished, kind: 'LIVE', url: 'https://youtu.be/dead' })
    await addMatchMedia(db, { matchId: finished, kind: 'HIGHLIGHTS', url: 'https://youtu.be/high' })
    await addMatchMedia(db, { matchId: awarded, kind: 'LIVE', url: 'https://youtu.be/awd' })
    await addMatchMedia(db, { matchId, kind: 'LIVE', url: 'https://youtu.be/live' })

    expect(await pruneLiveMediaForFinishedMatches(db)).toBe(2)
    expect((await listMatchMedia(db, finished)).map((m) => m.kind)).toEqual(['HIGHLIGHTS'])
    expect((await listMatchMedia(db, awarded)).map((m) => m.kind)).toEqual([])
    expect((await listMatchMedia(db, matchId)).map((m) => m.kind)).toEqual(['LIVE'])
    expect(await pruneLiveMediaForFinishedMatches(db)).toBe(0) // idempotent
    await client.close()
  })
})
