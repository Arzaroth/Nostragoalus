import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { NotFoundError, ValidationError } from '../errors'
import {
  ROADMAP_STATUSES,
  SUGGESTION_TITLE_MAX,
  SUGGESTION_TITLE_MIN,
  createRoadmapItem,
  createSuggestion,
  deleteRoadmapItem,
  listRoadmapItems,
  reorderRoadmapItem,
  toggleVote,
  updateRoadmapItem,
} from './service'

describe('roadmap service', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db']
  let client: Awaited<ReturnType<typeof createTestDb>>['client']

  beforeAll(async () => {
    const t = await createTestDb()
    db = t.db
    client = t.client
  })

  afterAll(async () => {
    await client.close()
  })

  it('exposes the four statuses including the SUGGESTED community bucket', () => {
    expect(ROADMAP_STATUSES).toEqual(['PLANNED', 'IN_PROGRESS', 'SHIPPED', 'SUGGESTED'])
  })

  it('creates with defaults, trims, and appends per-status positions', async () => {
    const a = await createRoadmapItem(db, { title: '  Invite links  ' })
    expect(a.title).toBe('Invite links')
    expect(a.status).toBe('PLANNED')
    expect(a.description).toBeNull()
    expect(a.position).toBe(0)

    const b = await createRoadmapItem(db, { title: 'Auto refresh', description: '  toast on new build  ' })
    expect(b.position).toBe(1)
    expect(b.description).toBe('toast on new build')

    // A different status starts its own position sequence.
    const c = await createRoadmapItem(db, { title: 'PWA push', status: 'IN_PROGRESS' })
    expect(c.position).toBe(0)

    // Blank description collapses to null.
    const d = await createRoadmapItem(db, { title: 'iCal feed', description: '   ' })
    expect(d.description).toBeNull()
  })

  it('rejects an empty title on create', async () => {
    await expect(createRoadmapItem(db, { title: '   ' })).rejects.toThrow(ValidationError)
  })

  it('lists items grouped by status, each column ordered by position', async () => {
    const items = await listRoadmapItems(db)
    expect(items.length).toBeGreaterThanOrEqual(4)
    const byStatus = new Map<string, number[]>()
    for (const i of items) byStatus.set(i.status, [...(byStatus.get(i.status) ?? []), i.position])
    for (const positions of byStatus.values()) {
      expect(positions).toEqual([...positions].sort((x, y) => x - y))
    }
  })

  it('updates fields independently', async () => {
    const item = await createRoadmapItem(db, { title: 'Evil twin', description: 'swap scores' })

    const renamed = await updateRoadmapItem(db, item.id, { title: '  Evil twin v2  ' })
    expect(renamed.title).toBe('Evil twin v2')
    expect(renamed.description).toBe('swap scores')

    const cleared = await updateRoadmapItem(db, item.id, { description: null })
    expect(cleared.description).toBeNull()
    expect(cleared.title).toBe('Evil twin v2')

    const blanked = await updateRoadmapItem(db, item.id, { description: '   ' })
    expect(blanked.description).toBeNull()

    const shipped = await updateRoadmapItem(db, item.id, { status: 'SHIPPED', position: 7 })
    expect(shipped.status).toBe('SHIPPED')
    expect(shipped.position).toBe(7)
  })

  it('rejects an empty title on update', async () => {
    const item = await createRoadmapItem(db, { title: 'Wrapped' })
    await expect(updateRoadmapItem(db, item.id, { title: ' ' })).rejects.toThrow(ValidationError)
  })

  it('throws NotFoundError when updating or deleting a missing item', async () => {
    await expect(updateRoadmapItem(db, 'nope', { title: 'ghost' })).rejects.toThrow(NotFoundError)
    await expect(deleteRoadmapItem(db, 'nope')).rejects.toThrow(NotFoundError)
  })

  it('deletes an item', async () => {
    const item = await createRoadmapItem(db, { title: 'Survivor mode' })
    await deleteRoadmapItem(db, item.id)
    const items = await listRoadmapItems(db)
    expect(items.find((i) => i.id === item.id)).toBeUndefined()
  })

  it('appends to the end of the new column on a status change (no position collision)', async () => {
    const { db: d, client: c } = await createTestDb()
    const planned = await createRoadmapItem(d, { title: 'p0' }) // PLANNED 0
    await createRoadmapItem(d, { title: 'i0', status: 'IN_PROGRESS' }) // IN_PROGRESS 0
    await createRoadmapItem(d, { title: 'i1', status: 'IN_PROGRESS' }) // IN_PROGRESS 1
    const moved = await updateRoadmapItem(d, planned.id, { status: 'IN_PROGRESS' })
    expect(moved.status).toBe('IN_PROGRESS')
    expect(moved.position).toBe(2) // appended, not left at 0
    // An explicit position on a status change is honored instead.
    const pinned = await updateRoadmapItem(d, planned.id, { status: 'SHIPPED', position: 5 })
    expect(pinned.position).toBe(5)
    // Re-setting the same status doesn't re-append (position untouched).
    const same = await updateRoadmapItem(d, planned.id, { status: 'SHIPPED' })
    expect(same.position).toBe(5)
    await c.close()
  })

  it('reorders within a status column atomically, no-ops at the edge', async () => {
    const { db: d, client: c } = await createTestDb()
    const a = await createRoadmapItem(d, { title: 'a' })
    await createRoadmapItem(d, { title: 'b' })
    await createRoadmapItem(d, { title: 'c' })
    const titles = async () => (await listRoadmapItems(d)).map((i) => i.title)

    const b = (await listRoadmapItems(d))[1]
    const movedB = await reorderRoadmapItem(d, b.id, 'up')
    expect(movedB.position).toBe(0)
    expect(await titles()).toEqual(['b', 'a', 'c'])

    await reorderRoadmapItem(d, a.id, 'down') // a is now at index 1
    expect(await titles()).toEqual(['b', 'c', 'a'])

    const noop = await reorderRoadmapItem(d, b.id, 'up') // already top
    expect(noop.position).toBe(0)
    expect(await titles()).toEqual(['b', 'c', 'a'])
    await c.close()
  })

  it('reorder throws NotFoundError for a missing item', async () => {
    await expect(reorderRoadmapItem(db, 'nope', 'up')).rejects.toThrow(NotFoundError)
  })

  it('creates a suggestion: SUGGESTED, APPROVED, authored, trimmed, appended', async () => {
    const { db: d, client: c } = await createTestDb()
    const u = await makeUser(d, 'u1')
    const s = await createSuggestion(d, { authorId: u, title: '  Dark mode  ', description: '  please  ' })
    expect(s.status).toBe('SUGGESTED')
    expect(s.moderationStatus).toBe('APPROVED')
    expect(s.authorId).toBe(u)
    expect(s.title).toBe('Dark mode')
    expect(s.description).toBe('please')
    expect(s.position).toBe(0)

    const s2 = await createSuggestion(d, { authorId: u, title: 'Light mode' })
    expect(s2.position).toBe(1) // appended within the SUGGESTED column
    expect(s2.description).toBeNull()
    await c.close()
  })

  it('rejects a too-short or too-long suggestion title, accepts the boundaries', async () => {
    const { db: d, client: c } = await createTestDb()
    const u = await makeUser(d, 'u1')
    await expect(createSuggestion(d, { authorId: u, title: 'ab' })).rejects.toThrow(ValidationError)
    await expect(
      createSuggestion(d, { authorId: u, title: 'x'.repeat(SUGGESTION_TITLE_MAX + 1) }),
    ).rejects.toThrow(ValidationError)
    const min = await createSuggestion(d, { authorId: u, title: 'x'.repeat(SUGGESTION_TITLE_MIN) })
    expect(min.title.length).toBe(SUGGESTION_TITLE_MIN)
    await c.close()
  })

  it('toggles an upvote and derives the count from the vote rows', async () => {
    const { db: d, client: c } = await createTestDb()
    const u1 = await makeUser(d, 'u1')
    const u2 = await makeUser(d, 'u2')
    const item = await createRoadmapItem(d, { title: 'Votable' })

    expect(await toggleVote(d, { itemId: item.id, userId: u1 })).toEqual({ voted: true, voteCount: 1 })
    expect(await toggleVote(d, { itemId: item.id, userId: u2 })).toEqual({ voted: true, voteCount: 2 })
    // The same user again removes their own vote.
    expect(await toggleVote(d, { itemId: item.id, userId: u1 })).toEqual({ voted: false, voteCount: 1 })
    await c.close()
  })

  it('refuses to vote on a missing or hidden item', async () => {
    const { db: d, client: c } = await createTestDb()
    const u = await makeUser(d, 'u1')
    await expect(toggleVote(d, { itemId: 'nope', userId: u })).rejects.toThrow(NotFoundError)
    const item = await createRoadmapItem(d, { title: 'Spam' })
    await updateRoadmapItem(d, item.id, { moderationStatus: 'REJECTED' })
    await expect(toggleVote(d, { itemId: item.id, userId: u })).rejects.toThrow(NotFoundError)
    await c.close()
  })

  it('folds vote counts and the viewer flag into the list, hiding rejected unless asked', async () => {
    const { db: d, client: c } = await createTestDb()
    const u1 = await makeUser(d, 'u1')
    const u2 = await makeUser(d, 'u2')
    const a = await createRoadmapItem(d, { title: 'A' })
    const b = await createRoadmapItem(d, { title: 'B' })
    await toggleVote(d, { itemId: a.id, userId: u1 })
    await toggleVote(d, { itemId: a.id, userId: u2 })
    await toggleVote(d, { itemId: b.id, userId: u1 })

    const anon = await listRoadmapItems(d)
    const anonA = anon.find((i) => i.id === a.id)!
    expect(anonA.voteCount).toBe(2)
    expect(anonA.viewerHasVoted).toBe(false)

    const asU1 = await listRoadmapItems(d, { viewerId: u1 })
    expect(asU1.find((i) => i.id === a.id)!.viewerHasVoted).toBe(true)
    expect(asU1.find((i) => i.id === b.id)!.viewerHasVoted).toBe(true)

    await updateRoadmapItem(d, b.id, { moderationStatus: 'REJECTED' })
    expect((await listRoadmapItems(d)).find((i) => i.id === b.id)).toBeUndefined()
    expect((await listRoadmapItems(d, { includeHidden: true })).find((i) => i.id === b.id)).toBeDefined()
    await c.close()
  })

  it('promotes a suggestion onto the roadmap and can set moderation state', async () => {
    const { db: d, client: c } = await createTestDb()
    const u = await makeUser(d, 'u1')
    const s = await createSuggestion(d, { authorId: u, title: 'Great idea' })
    const promoted = await updateRoadmapItem(d, s.id, { status: 'PLANNED' })
    expect(promoted.status).toBe('PLANNED')
    expect(promoted.position).toBe(0) // appended into the empty PLANNED column
    const hidden = await updateRoadmapItem(d, s.id, { moderationStatus: 'REJECTED' })
    expect(hidden.moderationStatus).toBe('REJECTED')
    await c.close()
  })
})
