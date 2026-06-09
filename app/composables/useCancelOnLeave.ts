interface CancellableFetch {
  status: Ref<string>
  clear: () => void
}

// Nuxt's useFetch does not abort an in-flight request when the page unmounts
// (teardown only clears the cached data); clear() is the public API that does
// abort the underlying controller. Register the page's fetch handles and any
// still-pending request is cancelled on navigation.
export function useCancelOnLeave(...handles: CancellableFetch[]) {
  onScopeDispose(() => {
    for (const h of handles) {
      if (h.status.value === 'pending') h.clear()
    }
  })
}
