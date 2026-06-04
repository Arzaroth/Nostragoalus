import { createProvider } from './factory'
import type { MatchDataProvider } from './types'

let cached: MatchDataProvider | null = null

export function getProvider(): MatchDataProvider {
  if (!cached) {
    const config = useRuntimeConfig()
    cached = createProvider({
      provider: config.matchProvider,
      footballDataToken: config.footballDataToken,
      apiFootballKey: config.apiFootballKey,
    })
  }
  return cached
}

export function resetProviderCache(): void {
  cached = null
}
