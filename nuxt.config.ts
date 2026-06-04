import Aura from '@primeuix/themes/aura'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-04',
  devtools: { enabled: true },

  modules: [
    '@primevue/nuxt-module',
    '@unocss/nuxt',
  ],

  css: ['primeicons/primeicons.css', '~/assets/css/main.css'],

  primevue: {
    options: {
      ripple: true,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primevue',
            order: 'reset, primevue',
          },
        },
      },
    },
  },

  nitro: {
    preset: 'node-server',
    experimental: { tasks: true },
    scheduledTasks: {
      // Live score polling self-gates on the live window, so off-window ticks make no API calls.
      '*/2 * * * *': ['scores:poll'],
      // Hourly fixture/bracket refresh.
      '0 * * * *': ['fixtures:refresh'],
      // Lock predictions at kickoff and score finished matches.
      '*/5 * * * *': ['matches:finalize'],
    },
  },

  runtimeConfig: {
    databaseUrl: '',
    betterAuthSecret: '',
    matchProvider: 'football-data',
    footballDataToken: '',
    apiFootballKey: '',
    wcSeason: '2026',
    cronEnabled: 'true',
    adminEmails: '',
    public: {
      authUrl: '',
      appName: 'Mon Petit Prono',
    },
  },

  typescript: {
    strict: true,
  },
})
