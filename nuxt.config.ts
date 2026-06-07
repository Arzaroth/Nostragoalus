import { NostraTheme } from './lib/theme'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-04',
  devtools: { enabled: true },

  app: {
    head: {
      title: 'Nostragoalus',
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'description', content: 'Nostragoalus - the football oracle. Predict scores, earn points, outsmart your friends.' },
        { property: 'og:title', content: 'Nostragoalus' },
        { property: 'og:description', content: 'The football oracle - predict scores, earn points, climb the leaderboard.' },
        { property: 'og:image', content: '/brand/banner.png' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
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
    '@vueuse/nuxt',
    '@primevue/nuxt-module',
    '@unocss/nuxt',
    '@nuxtjs/i18n',
  ],

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'th', name: 'ไทย (Thai)', file: 'th.json' },
      { code: 'tlh', name: 'tlhIngan Hol (Klingon)', file: 'tlh.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'ng_locale', redirectOn: 'no prefix' },
  },

  css: ['primeicons/primeicons.css', 'leaflet/dist/leaflet.css', '~/assets/css/main.css'],

  primevue: {
    options: {
      ripple: true,
      theme: {
        preset: NostraTheme,
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
    experimental: { tasks: true, websocket: true, openAPI: true },
    openAPI: {
      production: 'runtime',
      meta: {
        title: 'Nostragoalus API',
        description: 'The HTTP API behind the prediction game: fixtures, predictions, leaderboards, teams, live match data. Session-cookie authenticated (better-auth); admin routes need an admin session.',
        version: '1.0',
      },
      route: '/_docs/openapi.json',
      ui: {
        scalar: { route: '/_docs/api' },
        swagger: false,
      },
    },
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
