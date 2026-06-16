interface Hideable {
  hide?: () => void
}

// PrimeVue's Popover anchors to the trigger's document position when it opens
// and only rebinds its auto-hide to scrollable *element* ancestors - never the
// document. Our page scrolls on the window with a position:sticky header, so the
// panel both fails to follow the trigger and never closes: it visibly detaches
// mid-page. Bind a window-scroll listener while the panel is open (wire onShow /
// onHide to the Popover's show/hide events) and close it on page scroll, which
// is the expected overlay behaviour anyway. Inner-list scroll does not bubble to
// the window, so scrolling the notifications themselves keeps the panel open.
export function useHideOnScroll(panel: Ref<Hideable | undefined>) {
  function onScroll() {
    panel.value?.hide?.()
  }
  function onShow() {
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  function onHide() {
    window.removeEventListener('scroll', onScroll)
  }
  onScopeDispose(onHide)
  return { onShow, onHide }
}
