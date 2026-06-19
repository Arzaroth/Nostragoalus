import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { LedgerEntry } from '../../shared/commitment'
import Verify from './verify.vue'

const entries = ref<LedgerEntry[]>([])
const result = ref<{ ok: boolean; count: number; head: string; failedSeq?: number; reason?: string }>({
  ok: true,
  count: 0,
  head: 'h',
})
const openedCount = ref(0)
const isPending = ref(false)
const refetch = vi.fn()

mockNuxtImport('useLedgerVerification', () => () => ({
  data: ref({ entries: entries.value, head: { seq: 2, headHash: 'h' }, result: result.value, openedCount: openedCount.value }),
  isPending,
  isError: ref(false),
  isFetching: ref(false),
  refetch,
}))

afterEach(() => vi.clearAllMocks())

function entry(seq: number, opened: boolean): LedgerEntry {
  return {
    seq,
    prevHash: 'p',
    commitment: 'c'.repeat(64),
    entryHash: 'e',
    subject: 's'.repeat(64),
    matchId: 'm',
    createdAt: '2026-06-19T00:00:00.000Z',
    opened,
    ...(opened ? { homeGoals: 2, awayGoals: 1, salt: 'salt' } : {}),
  }
}

describe('verify page', () => {
  it('shows the intact badge and lists sealed vs opened entries', async () => {
    entries.value = [entry(1, true), entry(2, false)]
    result.value = { ok: true, count: 2, head: 'h' }
    openedCount.value = 1
    const wrapper = await mountSuspended(Verify)
    const text = wrapper.text()
    expect(text).toContain('Chain intact')
    expect(text).toContain('2 - 1')
    expect(text).toContain('Sealed')
    wrapper.unmount()
  })

  it('shows the broken badge with the failure reason', async () => {
    entries.value = [entry(1, true)]
    result.value = { ok: false, count: 1, head: 'h', failedSeq: 1, reason: 'commitment' }
    openedCount.value = 1
    const wrapper = await mountSuspended(Verify)
    const text = wrapper.text()
    expect(text).toContain('Chain broken')
    expect(text).toContain('#1')
    wrapper.unmount()
  })
})
