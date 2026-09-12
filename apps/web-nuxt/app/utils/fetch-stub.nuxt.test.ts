import { describe, it, expect, afterEach, vi } from 'vitest'

// Guards the VITEST-only `fetch.mjs` template override in nuxt.config.ts.
//
// Nuxt auto-imports `$fetch` from a template that snapshots `globalThis.$fetch`
// at module-eval time. Under vitest that snapshot is taken before any test runs,
// so a `vi.stubGlobal('$fetch', ...)` would never reach the code under test and
// every component test that asserts on a stubbed response would be asserting on
// the real auto-import instead - passing, but testing nothing.
//
// The override replaces that template with a proxy that resolves the global per
// call. Nothing else proves it is still in place: the config now throws if the
// template disappears, but a change to the proxy body itself would be silent.
// This spec is the other half of that guard.

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the $fetch auto-import under vitest', () => {
  it('resolves the global per call, so vi.stubGlobal reaches the code under test', async () => {
    const calls: unknown[][] = []
    vi.stubGlobal('$fetch', async (...args: unknown[]) => {
      calls.push(args)
      return { stubbed: true }
    })

    // Imported the way application code gets it - the auto-import, not globalThis.
    const { $fetch } = await import('#build/fetch.mjs')
    const res = await $fetch('/api/anything', { query: { a: 1 } })

    expect(res).toEqual({ stubbed: true })
    expect(calls).toEqual([['/api/anything', { query: { a: 1 } }]])
  })

  // The proxy also forwards property access, which is what `$fetch.raw(...)`
  // and `$fetch.create(...)` rely on.
  it('forwards property access to the stubbed global', async () => {
    const raw = vi.fn(async () => ({ _data: 'ok' }))
    vi.stubGlobal('$fetch', Object.assign(async () => ({}), { raw }))

    const { $fetch } = await import('#build/fetch.mjs')
    await ($fetch as unknown as { raw: typeof raw }).raw('/api/anything')

    expect(raw).toHaveBeenCalledWith('/api/anything')
  })

  // A later stub must win: the whole failure mode this guards against is a
  // value captured once at module-eval time.
  it('picks up a stub replaced between calls', async () => {
    const { $fetch } = await import('#build/fetch.mjs')

    vi.stubGlobal('$fetch', async () => 'first')
    expect(await $fetch('/api/x')).toBe('first')

    vi.stubGlobal('$fetch', async () => 'second')
    expect(await $fetch('/api/x')).toBe('second')
  })
})
