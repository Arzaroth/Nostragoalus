import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { upsertPrediction } from '../predictions/service'
import { commitmentChainHead, predictionCommitment } from '../../../db/schema'
import { COMMITMENT_GENESIS, verifyLedger } from '../../../shared/commitment'
import { appendPredictionCommitment, getChainHead, getCommitmentChain, verifyChainServer } from './service'

const NOW = new Date('2026-06-10T00:00:00Z')
const FUTURE = new Date('2026-06-11T16:00:00Z')
const AFTER_KICKOFF = new Date('2026-06-12T00:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, roundId, userId }
}

async function ledgerRows(db: Awaited<ReturnType<typeof setup>>['db']) {
  return db.select().from(predictionCommitment).orderBy(predictionCommitment.seq)
}

describe('getChainHead', () => {
  it('returns the genesis head on an empty ledger', async () => {
    const { db, client } = await setup()
    expect(await getChainHead(db)).toEqual({ seq: 0, headHash: COMMITMENT_GENESIS, updatedAt: null })
    await client.close()
  })
})

describe('appendPredictionCommitment', () => {
  it('chains entries from genesis and advances the head', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await appendPredictionCommitment(db, { predictionId: 'p1', userId, matchId: m, homeGoals: 1, awayGoals: 0 })
    await appendPredictionCommitment(db, { predictionId: 'p1', userId, matchId: m, homeGoals: 2, awayGoals: 2 }, NOW)

    const rows = await ledgerRows(db)
    expect(rows.map((r) => r.seq)).toEqual([1, 2])
    expect(rows[0].prevHash).toBe(COMMITMENT_GENESIS)
    expect(rows[1].prevHash).toBe(rows[0].entryHash)

    const head = await getChainHead(db)
    expect(head.seq).toBe(2)
    expect(head.headHash).toBe(rows[1].entryHash)
    await client.close()
  })
})

describe('upsertPrediction commitments', () => {
  it('appends on a new pick and a re-pick, but not on an identical save', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })

    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    expect(await ledgerRows(db)).toHaveLength(1)

    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 1 }, NOW)
    expect(await ledgerRows(db)).toHaveLength(2)

    // Identical re-save (autosave) must not grow the ledger.
    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 1 }, NOW)
    expect(await ledgerRows(db)).toHaveLength(2)

    const head = await getChainHead(db)
    const rows = await ledgerRows(db)
    expect(head.headHash).toBe(rows[1].entryHash)
    await client.close()
  })

  it('appends when only one score axis changes', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })

    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 1 }, NOW)
    expect(await ledgerRows(db)).toHaveLength(1)

    // Same home, different away - the change still seals a new commitment.
    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 3 }, NOW)
    expect(await ledgerRows(db)).toHaveLength(2)
    await client.close()
  })
})

describe('getCommitmentChain', () => {
  it('hides the opening until kickoff, then reveals it - and verifies either way', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 3, away: 1 }, NOW)

    const before = await getCommitmentChain(db, {}, NOW)
    expect(before.entries[0].opened).toBe(false)
    expect(before.entries[0].homeGoals).toBeUndefined()
    expect(before.entries[0].salt).toBeUndefined()
    expect((await verifyLedger(before.entries)).ok).toBe(true)

    const after = await getCommitmentChain(db, {}, AFTER_KICKOFF)
    expect(after.entries[0].opened).toBe(true)
    expect(after.entries[0].homeGoals).toBe(3)
    expect(after.entries[0].awayGoals).toBe(1)
    expect(after.entries[0].salt).toBeDefined()
    expect((await verifyLedger(after.entries)).ok).toBe(true)
    await client.close()
  })

  it('paginates with afterSeq + nextSeq cursor', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 0 }, NOW)

    const page1 = await getCommitmentChain(db, { limit: 1 }, NOW)
    expect(page1.entries).toHaveLength(1)
    expect(page1.entries[0].seq).toBe(1)
    expect(page1.nextSeq).toBe(1)

    const page2 = await getCommitmentChain(db, { afterSeq: page1.nextSeq as number, limit: 1 }, NOW)
    expect(page2.entries[0].seq).toBe(2)
    expect(page2.nextSeq).toBeNull()
    await client.close()
  })
})

describe('verifyChainServer', () => {
  it('passes for a clean ledger and counts every entry, paging through', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m, home: 3, away: 0 }, NOW)

    const head = await getChainHead(db)
    // pageSize 1 forces the multi-page loop.
    const res = await verifyChainServer(db, AFTER_KICKOFF, 1)
    expect(res).toMatchObject({ ok: true, verified: 3, head: head.headHash })
    await client.close()
  })

  it('detects an admin editing a revealed opening', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)

    // Retro-edit the stored pick in the ledger after the match has opened.
    await db.update(predictionCommitment).set({ homeGoals: 9 }).where(eq(predictionCommitment.seq, 1))
    const res = await verifyChainServer(db, AFTER_KICKOFF)
    expect(res).toMatchObject({ ok: false, reason: 'commitment', failedSeq: 1 })
    await client.close()
  })

  it('detects a broken chain link even before kickoff', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m, home: 2, away: 0 }, NOW)

    await db.update(predictionCommitment).set({ prevHash: 'x'.repeat(64) }).where(eq(predictionCommitment.seq, 2))
    const res = await verifyChainServer(db, NOW)
    expect(res).toMatchObject({ ok: false, reason: 'link', failedSeq: 2 })
    await client.close()
  })

  it('confirms an empty ledger against the genesis head', async () => {
    const { db, client } = await setup()
    expect(await verifyChainServer(db, NOW)).toMatchObject({ ok: true, verified: 0, head: COMMITMENT_GENESIS })
    await client.close()
  })

  it('flags a rewritten head pointer even when the entries verify', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)

    // Every entry still chains cleanly, but the published head is swapped: the
    // walk's head no longer matches the served head, so the audit must fail.
    await db.update(commitmentChainHead).set({ headHash: 'f'.repeat(64) })
    expect((await verifyChainServer(db, NOW)).ok).toBe(false)
    await client.close()
  })
})
