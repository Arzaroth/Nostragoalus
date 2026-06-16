import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useHideOnScroll } from './useHideOnScroll'

describe('useHideOnScroll', () => {
  it('hides the panel on window scroll only while open', () => {
    const hide = vi.fn()
    const panel = ref<{ hide: () => void }>({ hide })
    let api!: ReturnType<typeof useHideOnScroll>
    const scope = effectScope()
    scope.run(() => {
      api = useHideOnScroll(panel)
    })

    window.dispatchEvent(new Event('scroll'))
    expect(hide).not.toHaveBeenCalled()

    api.onShow()
    window.dispatchEvent(new Event('scroll'))
    expect(hide).toHaveBeenCalledTimes(1)

    api.onHide()
    window.dispatchEvent(new Event('scroll'))
    expect(hide).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('drops the listener when the owning scope is disposed', () => {
    const hide = vi.fn()
    const panel = ref<{ hide: () => void }>({ hide })
    let api!: ReturnType<typeof useHideOnScroll>
    const scope = effectScope()
    scope.run(() => {
      api = useHideOnScroll(panel)
    })

    api.onShow()
    scope.stop()
    window.dispatchEvent(new Event('scroll'))
    expect(hide).not.toHaveBeenCalled()
  })
})
