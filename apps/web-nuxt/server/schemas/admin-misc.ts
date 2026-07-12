import { z } from 'zod'

// Shared response shapes for the misc admin routes (api-keys, odds, scoring,
// matches media, settings). Lives under server/schemas (out of the coverage
// gate) so the route files stay thin; each schema mirrors the service return
// it validates, and the handler-return typecheck (server/utils/validated-handler.ts)
// proves every route still matches.

// One competition's odds-provider config (server/utils/odds/provider-config.ts
// CompetitionOddsRow): returned as a row by the list read and singly by the
// set-provider mutation.
export const competitionOddsRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  oddsProvider: z.string().nullable(),
  oddsProviderRef: z.string().nullable(),
})
