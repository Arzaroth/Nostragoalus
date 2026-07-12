// Map a Nitro file-routing path (relative to server/api) to its OpenAPI
// { path, method }. Mirrors Nitro's conventions: a trailing .get/.post/... is
// the method, `[id]` is a path param, `[...slug]` a catch-all, and an `index`
// leaf collapses to its directory. Pure so the spec emitter can be tested
// without a filesystem.
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

export interface RouteId {
  path: string
  // null when the filename carries no method suffix (Nitro then matches any
  // method); the emitter resolves it from the handler kind.
  method: string | null
}

export function filePathToRoute(relFromApi: string): RouteId {
  const noExt = relFromApi.replace(/\.ts$/, '')
  const segments = noExt.split('/')
  const last = segments.pop() as string

  // Split the method suffix off the leaf: `joker.put` -> name `joker`, PUT.
  const dotParts = last.split('.')
  let method: string | null = null
  if (dotParts.length > 1 && METHODS.has(dotParts[dotParts.length - 1])) {
    method = dotParts.pop() as string
  }
  const leaf = dotParts.join('.')

  // `index` collapses to the directory; otherwise the leaf is a segment.
  if (leaf !== 'index') segments.push(leaf)

  const parts = segments.map((s) =>
    s
      .replace(/^\[\.\.\.(.+)\]$/, '{$1}') // [...slug] catch-all
      .replace(/^\[(.+)\]$/, '{$1}'), // [id] param
  )

  return { path: `/api/${parts.join('/')}`.replace(/\/$/, ''), method }
}
