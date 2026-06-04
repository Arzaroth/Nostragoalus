export default defineNuxtConfig({
  compatibilityDate: '2026-06-04',
  devtools: { enabled: true },

  nitro: {
    preset: 'node-server',
  },

  runtimeConfig: {
    databaseUrl: '',
    betterAuthSecret: '',
    matchProvider: 'football-data',
    footballDataToken: '',
    apiFootballKey: '',
    wcSeason: '2026',
    cronEnabled: 'true',
    public: {
      authUrl: '',
      appName: 'Mon Petit Prono',
    },
  },

  typescript: {
    strict: true,
  },
})
