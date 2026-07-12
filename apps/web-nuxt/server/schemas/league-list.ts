import { z } from 'zod'

// Shared response shapes for the league list/create/join/browse/invite routes
// (server/api/leagues/*). Lives under server/schemas (out of the coverage gate)
// like the sibling schema files; the handler-return typecheck (see
// server/utils/validated-handler.ts + read-handler.ts) proves each route's return
// still matches. Only the enums shared by 2+ of those routes live here; a
// single-route shape stays a const in its route file. The competition reference
// is imported from ./competition (competitionRefSchema).

export const leagueVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC'])
export const leagueModeSchema = z.enum(['NORMAL', 'EASY', 'HARD', 'HARDCORE'])
export const leagueRoleSchema = z.enum(['OWNER', 'MODERATOR', 'MEMBER'])
