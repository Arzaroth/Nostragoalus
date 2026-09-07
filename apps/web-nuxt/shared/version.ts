// Compare dotted numeric versions ("1.9.0" < "1.10.0"). A non-numeric segment
// (never expected from our changelog or from a client header) falls back to a
// lexical compare of that segment - not of the whole string - so earlier numeric
// segments still order first and the function totally orders rather than
// throwing.
//
// Isomorphic because two callers need it from different layers: the changelog
// badge in `app/utils/changelog.ts` and the client-version floor in
// `server/utils/clients/service.ts`. They had a copy each, disagreeing on
// exactly the non-numeric case above.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '0'
    const sb = pb[i] ?? '0'
    const x = Number(sa)
    const y = Number(sb)
    if (Number.isNaN(x) || Number.isNaN(y)) {
      if (sa === sb) continue
      return sa < sb ? -1 : 1
    }
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
