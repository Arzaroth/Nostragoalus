import type { RouterConfig } from '@nuxt/schema'

// Vue Router's hash scroll ignores CSS scroll-margin-top, so an anchor lands
// under the sticky header. Offset hash navigation by the header height (the
// layout publishes --ng-header-h) plus a small gap. Other navigations keep the
// default behavior (restore saved position, else top).
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) {
      const headerVar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ng-header-h'), 10)
      const top = (Number.isFinite(headerVar) ? headerVar : 64) + 16
      return { el: to.hash, top, behavior: 'smooth' }
    }
    if (savedPosition) return savedPosition
    // A query-only change on the same page (e.g. switching tabs on the match
    // view) shouldn't yank the user back to the top - stay where they are.
    if (to.path === from.path) return false
    return { top: 0 }
  },
}
