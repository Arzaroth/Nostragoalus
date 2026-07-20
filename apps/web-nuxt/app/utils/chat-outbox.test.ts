import { describe, expect, it } from 'vitest'
import { failedFrom, makePendingMessage, settlePending } from './chat-outbox'
import type { DecryptedMessage } from '~/composables/useLeagueChat'

function row(id: string): DecryptedMessage {
  return { ...makePendingMessage('me', id, {}), id, pending: undefined }
}

describe('makePendingMessage', () => {
  it('is a visible own message marked pending, with a unique local id', () => {
    const a = makePendingMessage('me', 'hello', { matchId: 'M', parentId: 'P', threadId: 'T', images: 2 })
    const b = makePendingMessage('me', 'hello', {})
    expect(a).toMatchObject({
      userId: 'me',
      text: 'hello',
      matchId: 'M',
      parentId: 'P',
      threadId: 'T',
      pending: true,
      pendingImages: 2,
      moderation: 'VISIBLE',
      attachments: [],
      threadCount: 0,
    })
    expect(a.id).toMatch(/^local-\d+$/)
    expect(b.id).not.toBe(a.id)
    expect(b).toMatchObject({ matchId: null, parentId: null, threadId: null, pendingImages: 0 })
  })
})

describe('settlePending', () => {
  it('replaces the stand-in in place, keeping the surrounding order', () => {
    const local = makePendingMessage('me', 'hi', {})
    const list = [row('a'), local, row('b')]
    expect(settlePending(list, local.id, row('real')).map((m) => m.id)).toEqual(['a', 'real', 'b'])
  })

  it('appends the row when a reload wiped the stand-in mid-flight', () => {
    expect(settlePending([row('a')], 'local-999', row('real')).map((m) => m.id)).toEqual(['a', 'real'])
  })

  it('drops the stand-in when the live echo already landed the row', () => {
    const local = makePendingMessage('me', 'hi', {})
    const list = [local, row('real')]
    expect(settlePending(list, local.id, row('real')).map((m) => m.id)).toEqual(['real'])
  })

  it('just removes the stand-in when there is no row to show', () => {
    const local = makePendingMessage('me', 'hi', {})
    expect(settlePending([row('a'), local], local.id, null).map((m) => m.id)).toEqual(['a'])
  })
})

describe('failedFrom', () => {
  it('turns a stand-in into a failed bubble carrying its own replay payload', () => {
    const local = makePendingMessage('me', 'hi', { threadId: 'T' })
    const failed = failedFrom(local, 'hi', { threadId: 'T', mentions: ['u1'] })
    expect(failed).toMatchObject({
      id: local.id,
      pending: false,
      failed: true,
      retry: { text: 'hi', opts: { threadId: 'T', mentions: ['u1'] } },
    })
  })
})
