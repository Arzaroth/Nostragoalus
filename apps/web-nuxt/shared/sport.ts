// What a competition is played at. Mirrors the `sport` pg enum. Drives the
// provider family, the ranking source behind champion tiers, the scoring preset
// and the theme.
export const SPORTS = ['FOOTBALL', 'RUGBY_UNION'] as const
export type Sport = (typeof SPORTS)[number]

// The sub-feed a provider splits its sport into, when it does. World Rugby
// carries men's / women's / age-grade union and sevens as separate catalogs, so
// a competition has to name one; every football provider has exactly one feed.
export const PROVIDER_SPORTS: Partial<Record<string, readonly { value: string; label: string }[]>> = {
  worldrugby: [
    { value: 'mru', label: "Men's rugby union" },
    { value: 'wru', label: "Women's rugby union" },
    { value: 'jmu', label: "Men's U20" },
    { value: 'jwu', label: "Women's U20" },
    { value: 'mrs', label: "Men's sevens" },
    { value: 'wrs', label: "Women's sevens" },
  ],
}

// The sport a provider's competitions are played at. A provider serves exactly
// one, so this is a lookup rather than something an admin picks and can get
// wrong.
export const PROVIDER_SPORT_KIND: Record<string, Sport> = {
  fifa: 'FOOTBALL',
  uefa: 'FOOTBALL',
  espn: 'FOOTBALL',
  'football-data': 'FOOTBALL',
  fixture: 'FOOTBALL',
  worldrugby: 'RUGBY_UNION',
}

export function sportForProvider(provider: string): Sport {
  return PROVIDER_SPORT_KIND[provider] ?? 'FOOTBALL'
}
