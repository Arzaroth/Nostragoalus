import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { NotFoundError, ValidationError } from '../errors'
import {
  ROADMAP_STATUSES,
  createRoadmapItem,
  deleteRoadmapItem,
  listRoadmapItems,
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

  it('exposes the three statuses', () => {
    expect(ROADMAP_STATUSES).toEqual(['PLANNED', 'IN_PROGRESS', 'SHIPPED'])
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

  it('lists items ordered by position then creation', async () => {
    const items = await listRoadmapItems(db)
    expect(items.length).toBeGreaterThanOrEqual(4)
    const positions = items.map((i) => i.position)
    expect(positions).toEqual([...positions].sort((x, y) => x - y))
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
})
