import { describe, it, expect, afterEach } from 'vitest'
import {
  __resetVoiceRooms,
  isInRoom,
  joinRoom,
  leaveRoom,
  roomOf,
  rosterOf,
  tokenInRoom,
  tokensInRoom,
} from './voice-rooms'

afterEach(() => __resetVoiceRooms())

describe('voice rooms', () => {
  it('adds a user to a room and reports the roster', () => {
    const a = {}
    expect(joinRoom(a, 'dm:t1', 'user-a')).toEqual({ roster: ['user-a'], evicted: null })
    expect(rosterOf('dm:t1')).toEqual(['user-a'])
    expect(isInRoom('dm:t1', 'user-a')).toBe(true)
    expect(tokenInRoom('dm:t1', 'user-a')).toBe(a)
    expect(tokensInRoom('dm:t1')).toEqual([a])
  })

  it('builds a mesh roster as members join', () => {
    joinRoom({}, 'league:l1', 'user-a')
    expect(joinRoom({}, 'league:l1', 'user-b').roster.sort()).toEqual(['user-a', 'user-b'])
    expect(joinRoom({}, 'league:l1', 'user-c').roster.sort()).toEqual(['user-a', 'user-b', 'user-c'])
    expect(rosterOf('league:l1').sort()).toEqual(['user-a', 'user-b', 'user-c'])
  })

  it('re-joining the same room from the same socket is a no-op with no eviction', () => {
    const a = {}
    joinRoom(a, 'dm:t1', 'user-a')
    expect(joinRoom(a, 'dm:t1', 'user-a')).toEqual({ roster: ['user-a'], evicted: null })
  })

  it('a second tab of the same user takes over: the old socket is evicted', () => {
    const tab1 = {}
    const tab2 = {}
    joinRoom(tab1, 'league:l1', 'user-a')
    const res = joinRoom(tab2, 'league:l1', 'user-a')
    expect(res.evicted).toBe(tab1)
    expect(res.roster).toEqual(['user-a'])
    // The room now points at the new tab, and the user still counts once.
    expect(tokenInRoom('league:l1', 'user-a')).toBe(tab2)
    expect(rosterOf('league:l1')).toEqual(['user-a'])
    expect(roomOf(tab1)).toBeNull()
  })

  it('the evicted old tab leaving does not drop the new tab', () => {
    const tab1 = {}
    const tab2 = {}
    joinRoom(tab1, 'league:l1', 'user-a')
    joinRoom(tab2, 'league:l1', 'user-a')
    // The old tab's socket closes after being displaced.
    expect(leaveRoom(tab1)).toBeNull()
    expect(isInRoom('league:l1', 'user-a')).toBe(true)
    expect(tokenInRoom('league:l1', 'user-a')).toBe(tab2)
  })

  it('a socket in one room joining another leaves the first', () => {
    const a = {}
    joinRoom(a, 'dm:t1', 'user-a')
    const res = joinRoom(a, 'league:l1', 'user-a')
    expect(res.roster).toEqual(['user-a'])
    expect(rosterOf('dm:t1')).toEqual([])
    expect(isInRoom('dm:t1', 'user-a')).toBe(false)
    expect(isInRoom('league:l1', 'user-a')).toBe(true)
  })

  it('leaving returns the room, user and the remaining roster', () => {
    joinRoom({}, 'league:l1', 'user-a')
    const b = {}
    joinRoom(b, 'league:l1', 'user-b')
    expect(leaveRoom(b)).toEqual({ roomKey: 'league:l1', userId: 'user-b', roster: ['user-a'] })
    expect(rosterOf('league:l1')).toEqual(['user-a'])
  })

  it('the room is dropped when the last member leaves', () => {
    const a = {}
    joinRoom(a, 'dm:t1', 'user-a')
    expect(leaveRoom(a)).toEqual({ roomKey: 'dm:t1', userId: 'user-a', roster: [] })
    expect(rosterOf('dm:t1')).toEqual([])
    expect(tokensInRoom('dm:t1')).toEqual([])
  })

  it('leaving an unknown socket is a no-op', () => {
    expect(leaveRoom({})).toBeNull()
  })

  it('reports emptiness for a room nobody is in', () => {
    expect(rosterOf('ghost')).toEqual([])
    expect(isInRoom('ghost', 'user-a')).toBe(false)
    expect(tokenInRoom('ghost', 'user-a')).toBeUndefined()
    expect(tokensInRoom('ghost')).toEqual([])
  })

  it('roomOf reports the room a socket is the endpoint for', () => {
    const a = {}
    expect(roomOf(a)).toBeNull()
    joinRoom(a, 'league:l1:match:m9', 'user-a')
    expect(roomOf(a)).toEqual({ roomKey: 'league:l1:match:m9', userId: 'user-a' })
  })

  it('keeps distinct user sockets separate for targeted relay', () => {
    const a = {}
    const b = {}
    joinRoom(a, 'league:l1', 'user-a')
    joinRoom(b, 'league:l1', 'user-b')
    expect(tokenInRoom('league:l1', 'user-a')).toBe(a)
    expect(tokenInRoom('league:l1', 'user-b')).toBe(b)
  })
})
