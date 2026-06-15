import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { usePushNotifications } from './usePushNotifications'

describe('usePushNotifications', () => {
  it('reports unsupported without a VAPID key, and subscribe/unsubscribe are safe no-ops', async () => {
    let api!: ReturnType<typeof usePushNotifications>
    const wrapper = await mountSuspended({
      setup() {
        api = usePushNotifications()
        return () => null
      },
    })
    // No vapidPublicKey configured in the test runtime -> unsupported.
    expect(api.supported.value).toBe(false)
    await api.subscribe()
    await api.unsubscribe()
    expect(api.subscribed.value).toBe(false)
    wrapper.unmount()
  })
})
