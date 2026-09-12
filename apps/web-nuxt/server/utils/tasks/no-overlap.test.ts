import { describe, it, expect, beforeEach } from 'vitest'
import { clearInFlightTasks, withoutOverlap } from './no-overlap'

beforeEach(() => {
  clearInFlightTasks()
})

describe('withoutOverlap', () => {
  it('runs the task and returns its result', async () => {
    expect(await withoutOverlap('t', async () => ({ result: 42 }))).toEqual({ result: 42 })
  })

  // The reason this exists: nitro does not pass croner's `protect`, so a tick
  // that outlasts its interval would otherwise run concurrently with the next.
  it('skips a second run while the first is still in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let runs = 0

    const first = withoutOverlap('t', async () => {
      runs += 1
      await gate
      return { result: 'first' }
    })
    const second = await withoutOverlap('t', async () => {
      runs += 1
      return { result: 'second' }
    })

    expect(second).toEqual({ result: 'busy' })
    expect(runs).toBe(1)

    release()
    expect(await first).toEqual({ result: 'first' })
  })

  it('lets the next run through once the first finishes', async () => {
    await withoutOverlap('t', async () => ({ result: 1 }))
    expect(await withoutOverlap('t', async () => ({ result: 2 }))).toEqual({ result: 2 })
  })

  // A thrown task must not wedge the name forever.
  it('releases the slot when the task throws', async () => {
    await expect(
      withoutOverlap('t', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await withoutOverlap('t', async () => ({ result: 'after' }))).toEqual({ result: 'after' })
  })

  it('tracks each task name separately', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const a = withoutOverlap('a', async () => {
      await gate
      return { result: 'a' }
    })
    expect(await withoutOverlap('b', async () => ({ result: 'b' }))).toEqual({ result: 'b' })
    release()
    await a
  })
})
