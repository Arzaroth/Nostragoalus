import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LeagueJoinDialog from './LeagueJoinDialog.vue'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  document.body.innerHTML = ''
  fetchMock = vi.fn(async () => ({ league: { id: 'l1', name: 'Bureau', competition: { slug: 'wc' } } }))
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  const wrapper = await mountSuspended(LeagueJoinDialog, { props: { visible: true } })
  await nextTick()
  const input = document.body.querySelector<HTMLInputElement>('#league-join-code')
  const form = document.body.querySelector<HTMLFormElement>('form')
  expect(input).toBeTruthy()
  expect(form).toBeTruthy()
  return { wrapper, input: input!, form: form! }
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('LeagueJoinDialog', () => {
  it('posts the code and emits joined on success', async () => {
    const { wrapper, input, form } = await setup()
    type(input, 'abcd2345')
    await nextTick()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/leagues/join', expect.objectContaining({ method: 'POST', body: { code: 'abcd2345' } }))
      expect(wrapper.emitted('joined')).toBeTruthy()
    })
    expect((wrapper.emitted('joined')![0]![0] as { id: string }).id).toBe('l1')
  })

  it('shows the invalid-code error on 404 and already-member on 409', async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 404 })
    const { wrapper, input, form } = await setup()
    type(input, 'WRONG999')
    await nextTick()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain('No league matches this code.'))
    expect(wrapper.emitted('joined')).toBeFalsy()

    fetchMock.mockRejectedValueOnce({ statusCode: 409 })
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain("You're already in this league."))
  })
})
