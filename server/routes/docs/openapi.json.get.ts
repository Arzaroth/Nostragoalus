import responseSchemas from '../../utils/docs/response-schemas.json'

// The public API spec: Nitro's generated document, stripped of framework
// internals (__nuxt_error, _i18n, docs routes...) so only /api/* remains.
// GET responses get real schemas + examples, sampled from the live API
// (scripts/gen-api-schemas.mjs regenerates them).
export default defineEventHandler(async (event) => {
  const spec = await event.$fetch<Record<string, any>>('/_docs/openapi.json')
  const paths: Record<string, any> = {}
  for (const [path, ops] of Object.entries<any>(spec.paths ?? {})) {
    if (!path.startsWith('/api/')) continue
    const sampled = (responseSchemas as Record<string, { schema: unknown; example: unknown }>)[path]
    const ok = ops?.get?.responses?.['200']
    if (sampled && ok && !ok.content) {
      ok.content = { 'application/json': { schema: sampled.schema, example: sampled.example } }
    }
    paths[path] = ops
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
