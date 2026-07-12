// One gate for every scheduled task: the NUXT_CRON_ENABLED kill switch stops
// cron ticks, while a manual admin trigger (payload.force) always runs.
// String(): nitro coerces NUXT_CRON_ENABLED=true to a boolean via destr.
export function cronDisabled(cronEnabled: unknown, payload?: { force?: unknown }): boolean {
  return String(cronEnabled) !== 'true' && payload?.force !== true
}
