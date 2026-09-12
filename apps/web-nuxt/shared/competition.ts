// Last-resort competition slug, used only when no competition can be resolved:
// an empty database, or a client rendering before the server's answer lands.
// The real default is admin-set - appSetting `default_competition`, resolved by
// getDefaultCompetitionSlug() in server/utils/competitions/store.ts, which falls
// back to the newest active season. This constant exists so a slug-less link
// still points somewhere rather than at `/undefined`.
export const FALLBACK_COMPETITION = 'world-cup-2026'
