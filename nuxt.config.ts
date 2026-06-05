import Aura from '@primeuix/themes/aura'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-04',
  devtools: { enabled: true },

  app: {
    head: {
      title: 'Nostragoalus',
      htmlAttrs: { lang: 'en' },
      // Apply the saved/preferred theme before paint to avoid a flash.
      script: [
        {
          innerHTML:
            "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('app-dark')}catch(e){}",
          tagPosition: 'head',
        },
      ],
    },
  },

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
    experimental: { tasks: true, websocket: true },
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
    matchProvider: 'fifa',
    fifaSeasonId: '285023',
    footballDataToken: '',
    apiFootballKey: '',
    wcSeason: '2026',
    cronEnabled: 'true',
    adminEmails: '',
    public: {
      authUrl: '',
      appName: 'Nostragoalus',
    },
  },

  typescript: {
    strict: true,
  },
})
