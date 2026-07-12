import { describe, it, expect } from 'vitest'
import { TASKS, findTask, scheduledTasksMap } from './registry'

describe('task registry', () => {
  it('finds tasks by name', () => {
    expect(findTask('scores:poll')?.cron).toBe('*/2 * * * *')
    expect(findTask('odds:backfill')?.cron).toBeNull()
    expect(findTask('nope')).toBeUndefined()
  })

  it('builds the cron map, grouping shared schedules and dropping manual tasks', () => {
    const map = scheduledTasksMap()
    // every scheduled task appears under its cron; manual (cron null) does not.
    const scheduled = TASKS.filter((t) => t.cron)
    expect(Object.values(map).flat().sort()).toEqual(scheduled.map((t) => t.name).sort())
    expect(Object.values(map).flat()).not.toContain('odds:backfill')
    expect(map['*/2 * * * *']).toEqual(['scores:poll'])
  })

  it('groups tasks that share a cron expression', () => {
    const map = scheduledTasksMap([
      { name: 'a', cron: '* * * * *', fireAndForget: false },
      { name: 'b', cron: '* * * * *', fireAndForget: false },
    ])
    expect(map['* * * * *']).toEqual(['a', 'b'])
  })
})
