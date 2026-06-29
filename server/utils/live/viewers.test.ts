import { describe, it, expect, afterEach } from 'vitest'
import { __resetViewers, removeViewer, setViewing, viewerCount, viewersOf } from './viewers'

afterEach(() => __resetViewers())

describe('match viewer rooms', () => {
  it('counts a socket into a match and reports it as changed', () => {
    const a = {}
    expect(setViewing(a, ['m1'])).toEqual(['m1'])
    expect(viewerCount('m1')).toBe(1)
    expect(viewersOf('m1')).toEqual([a])
  })

  it('de-dupes the same socket: re-reporting the same match does not double-count', () => {
    const a = {}
    setViewing(a, ['m1'])
    // A second identical report (a reconnect re-sending `viewing`) changes nothing.
    expect(setViewing(a, ['m1'])).toEqual([])
    expect(viewerCount('m1')).toBe(1)
  })

  it('counts distinct sockets independently', () => {
    const a = {}
    const b = {}
    setViewing(a, ['m1'])
    expect(setViewing(b, ['m1'])).toEqual(['m1'])
    expect(viewerCount('m1')).toBe(2)
    expect(viewersOf('m1')).toEqual([a, b])
  })

  it('moving a socket to another match decrements the old and increments the new', () => {
    const a = {}
    const b = {}
    setViewing(a, ['m1'])
    setViewing(b, ['m1'])
    // b leaves m1 for m2: both rooms change.
    expect(setViewing(b, ['m2']).sort()).toEqual(['m1', 'm2'])
    expect(viewerCount('m1')).toBe(1)
    expect(viewerCount('m2')).toBe(1)
    expect(viewersOf('m1')).toEqual([a])
    expect(viewersOf('m2')).toEqual([b])
  })

  it('an empty report clears the socket from its room', () => {
    const a = {}
    setViewing(a, ['m1'])
    expect(setViewing(a, [])).toEqual(['m1'])
    expect(viewerCount('m1')).toBe(0)
    expect(viewersOf('m1')).toEqual([])
  })

  it('count goes to 0 and the room is dropped when the last viewer disconnects', () => {
    const a = {}
    const b = {}
    setViewing(a, ['m1'])
    setViewing(b, ['m1'])
    expect(removeViewer(a)).toEqual(['m1'])
    expect(viewerCount('m1')).toBe(1)
    expect(removeViewer(b)).toEqual(['m1'])
    expect(viewerCount('m1')).toBe(0)
    expect(viewersOf('m1')).toEqual([])
  })

  it('disconnect drops the socket from every room it was in', () => {
    const a = {}
    setViewing(a, ['m1', 'm2'])
    expect(viewerCount('m1')).toBe(1)
    expect(viewerCount('m2')).toBe(1)
    expect(removeViewer(a).sort()).toEqual(['m1', 'm2'])
    expect(viewerCount('m1')).toBe(0)
    expect(viewerCount('m2')).toBe(0)
  })

  it('removing an unknown socket is a no-op', () => {
    expect(removeViewer({})).toEqual([])
  })

  it('viewerCount is 0 for a match nobody is watching', () => {
    expect(viewerCount('ghost')).toBe(0)
    expect(viewersOf('ghost')).toEqual([])
  })
})
