// A small in-process TTL cache. Several read paths (bracket structure, the
// consensus bot overview, all-time h2h archives, chat typing rosters, link
// unfurls) each hand-rolled the same `Map<K, { at, value }>` + expiry check;
// this collapses them into one so the eviction and null-vs-miss semantics live
// in a single, tested place.
//
// `get`/`set` take an optional `now` so a caller that already threads a clock
// (for deterministic tests, e.g. the h2h and bracket paths) can pass it in;
// callers that don't fall back to the injectable `now` option (default
// `Date.now`). A miss and a cached `null`/`undefined` value are distinct: `get`
// returns `undefined` only when there is no live entry, so a legitimately
// cached nullish value (e.g. "this competition has no bracket") reads back
// intact - probe with `has` if the value type itself includes `undefined`.

export interface TtlCacheOptions<V> {
  // Entry lifetime in ms. A function receives the stored value, so a cache can
  // keep "miss" results for a shorter window than real ones (see chat unfurl).
  ttlMs: number | ((value: V) => number)
  // Cap on live entries; on overflow the oldest by insertion order is dropped
  // (a coarse LRU). Omit for an unbounded cache.
  maxSize?: number
  // Injectable clock, used when `get`/`set` are called without an explicit
  // `now`. Defaults to `Date.now`.
  now?: () => number
}

export interface TtlCache<K, V> {
  get(key: K, now?: number): V | undefined
  has(key: K, now?: number): boolean
  set(key: K, value: V, now?: number): void
  invalidate(key: K): void
  clear(): void
  readonly size: number
}

export function createTtlCache<K, V>(options: TtlCacheOptions<V>): TtlCache<K, V> {
  const clock = options.now ?? Date.now
  const ttlOf = typeof options.ttlMs === 'function' ? options.ttlMs : () => options.ttlMs as number
  const maxSize = options.maxSize
  const store = new Map<K, { at: number; value: V }>()

  // Return the live entry, evicting it if the TTL has elapsed so a stale entry
  // never lingers until the next write.
  function live(key: K, now: number): { at: number; value: V } | undefined {
    const entry = store.get(key)
    if (!entry) return undefined
    if (now - entry.at < ttlOf(entry.value)) return entry
    store.delete(key)
    return undefined
  }

  return {
    get(key, now = clock()) {
      return live(key, now)?.value
    },
    has(key, now = clock()) {
      return live(key, now) !== undefined
    },
    set(key, value, now = clock()) {
      // Bound the map: drop the oldest live key before inserting a new one.
      // size >= maxSize guarantees a first key, so the assertion is safe.
      if (maxSize !== undefined && !store.has(key) && store.size >= maxSize) {
        store.delete(store.keys().next().value!)
      }
      store.set(key, { at: now, value })
    },
    invalidate(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    get size() {
      return store.size
    },
  }
}
