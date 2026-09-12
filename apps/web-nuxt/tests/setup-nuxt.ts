import { afterEach } from 'vitest'

// Drain pending macrotasks between component tests.
//
// PrimeVue's tooltip directive schedules its own removal instead of doing it
// synchronously: `unmounted()` calls `hide(el, 0)`, and because `hideDelay` is
// defined (0, not undefined) that takes the `setTimeout` branch rather than
// calling `tooltipRemoval` directly:
//
//   hide(el, hideDelay) {
//     if (hideDelay !== undefined) {
//       el.$_ptooltipHideTimer = setTimeout(() => this.tooltipRemoval(el), hideDelay)
//     } else { this.tooltipRemoval(el) }
//   }
//
// `tooltipRemoval` reaches `document.getElementById`. If the run finishes and
// vitest tears the JSDOM environment down before that 0ms macrotask fires, it
// throws `ReferenceError: document is not defined`, unattached to any test, and
// vitest exits 1 on the unhandled error with every test green. It is
// load-dependent, which is why it surfaced as a release flake (it failed the
// v4.8.0 release) rather than as a reproducible failure.
//
// Unmounting does not avoid it - unmounting is what schedules the timer. The fix
// is to let the queued removal run while `document` is still there.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})
