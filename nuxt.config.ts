import { NostraTheme } from './lib/theme'
import pkg from './package.json'
import { scheduledTasksMap } from './server/utils/tasks/registry'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-04',
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },

  app: {
    head: {
      title: 'Nostragoalus',
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
    '@vite-pwa/nuxt',
  ],

  // Surface new deploys: poll the build manifest so the update banner can
  // offer a reload instead of users riding a stale bundle all tournament.
  experimental: {
    checkOutdatedBuildInterval: 10 * 60 * 1000,
  },

  // Scheduled tasks + scoring fold into the admin page's rail; keep the old paths working.
  routeRules: {
    '/admin/cron': { redirect: '/admin?section=cron' },
    '/admin/scoring': { redirect: '/admin?section=scoring' },
    // Public, unauthenticated landing widget: cache the two aggregate counts so a
    // visitor flood can't turn it into a per-hit double table scan.
    '/api/stats': { cache: { maxAge: 60 } },
  },

  pwa: {
    // injectManifest: we own the service worker (service-worker/sw.ts) so it can
    // handle `push` / `notificationclick` on top of the Workbox precache. The
    // precache + update behaviour is unchanged from the old generateSW setup.
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    // 'prompt': the update banner controls when the new SW takes over - an
    // auto-activating SW would swap assets mid-prediction. The SW honours the
    // SKIP_WAITING message the banner posts.
    registerType: 'prompt',
    manifest: {
      name: 'Nostragoalus',
      short_name: 'Nostragoalus',
      description: 'The football oracle - predict scores, earn points, climb the leaderboard.',
      theme_color: '#4f46e5',
      background_color: '#1e1b4b',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      // SSR app: navigations always hit the server (sessions, live data); the SW
      // only precaches the build's static assets, no navigation route.
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      // The konami pony art is a rarely-used easter egg; load it on demand
      // instead of bloating every visitor's precache.
      globIgnores: ['**/skins/**'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    },
    client: {
      // Re-check the SW hourly so long-lived tabs/installed apps see deploys.
      periodicSyncForUpdates: 3600,
    },
    devOptions: { enabled: false, type: 'module' },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'th', name: 'ไทย (Thai)', file: 'th.json' },
      { code: 'tlh', name: 'tlhIngan Hol (Klingon)', file: 'tlh.json' },
      { code: 'ar', name: 'العربية (Arabic)', file: 'ar.json', dir: 'rtl', language: 'ar' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'ng_locale', redirectOn: 'no prefix' },
  },

  css: ['primeicons/primeicons.css', 'leaflet/dist/leaflet.css', '~/assets/css/main.css', '~/assets/css/skins.css'],

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
    // Built from the task registry (server/utils/tasks/registry.ts), the single
    // source of truth shared with the admin cron view.
    scheduledTasks: scheduledTasksMap(),
  },

  runtimeConfig: {
    databaseUrl: '',
    betterAuthSecret: '',
    footballDataToken: '',
    apiFootballKey: '',
    cronEnabled: 'true',
    adminEmails: '',
    // Web push (VAPID). The private key signs pushes server-side; the public key
    // is handed to the browser to create a subscription. Subject is a mailto:
    // contact the push service can reach. Push is disabled when these are unset.
    vapidPrivateKey: '',
    vapidSubject: '',
    // Image storage backend. driver 'fs' (default) writes under storageFsRoot;
    // driver 's3' talks to any S3-compatible endpoint (the deploy runs rustfs).
    storageDriver: 'fs',
    storageFsRoot: '',
    storageS3Endpoint: '',
    storageS3Region: '',
    storageS3Bucket: '',
    storageS3AccessKeyId: '',
    storageS3SecretAccessKey: '',
    public: {
      authUrl: '',
      appName: 'Nostragoalus',
      version: pkg.version,
      vapidPublicKey: '',
    },
  },

  typescript: {
    strict: true,
  },
})