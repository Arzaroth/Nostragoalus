// The public API spec: Nitro's generated document, stripped of framework
// internals (__nuxt_error, _i18n, docs routes...) so only /api/* remains.
export default defineEventHandler(async (event) => {
  const spec = await event.$fetch<Record<string, any>>('/_docs/openapi.json')
  const paths: Record<string, unknown> = {}
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    if (path.startsWith('/api/')) paths[path] = ops
  }
  // Admin endpoints sink to the bottom of the sidebar.
  const tags = [
    { name: 'Competitions' },
    { name: 'Matches' },
    { name: 'Teams' },
    { name: 'Predictions' },
    { name: 'Leaderboard' },
    { name: 'Users' },
    { name: 'Account' },
    { name: 'Auth' },
    { name: 'Admin (internal)', description: 'Internal endpoints behind an admin session - not part of the public surface.' },
  ]
  return { ...spec, paths, tags }
})
