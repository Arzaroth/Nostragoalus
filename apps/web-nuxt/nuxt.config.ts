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
    // Security response headers on every route (Nitro/Nuxt sets none by default).
    // nosniff also covers the user-uploaded media routes (avatar/reward), whose
    // content-type is attacker-derived. frame-ancestors + X-Frame-Options block
    // clickjacking of this session-cookie app. HSTS is ignored over plain http so
    // it's safe to send unconditionally. A full script-src/style-src CSP is
    // deliberately deferred (see TODO.md): the inline theme-bootstrap script and
    // Nuxt's inlined hydration payload need per-inline hashing/nonces and real
    // browser tuning, and a broken CSP is worse than none.
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
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
    // Locales come from apps/web-nuxt/i18n/locales, a symlink to the top-level
    // shared/i18n-json (langDir/restructureDir stay default).
    locales: [
      { code: 'en', name: 'English', file: 'en.json', language: 'en' },
      { code: 'fr', name: 'Français', file: 'fr.json', language: 'fr' },
      { code: 'th', name: 'ไทย (Thai)', file: 'th.json', language: 'th' },
      { code: 'tlh', name: 'tlhIngan Hol (Klingon)', file: 'tlh.json', language: 'tlh' },
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
    // Voice-chat TURN relay (self-hosted coturn, use-auth-secret mode). The
    // secret mints ephemeral per-call credentials server-side and never reaches
    // the browser; host is the coturn hostname; realm is its configured realm.
    // All unset = STUN-only (calls behind symmetric NAT will fail).
    turnSecret: '',
    turnHost: '',
    turnRealm: '',
    // TURN listening ports the browser dials (configurable to avoid a clash with
    // another service on the host, e.g. a netbird relay on 3478). Default IANA.
    turnPort: '3478',
    turnTlsPort: '5349',
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

  // Pre-bundle the client deps Vite would otherwise discover on the first route
  // that imports them and respond to with a full page reload. That mid-session
  // reload drops any in-flight request (a sign-up POST, a verify-email
  // navigation), which is a real first-load hazard and made the browser e2e flaky.
  vite: {
    optimizeDeps: {
      include: [
        '@better-auth/api-key/client',
        '@better-auth/passkey/client',
        '@better-auth/sso/client',
        '@tanstack/vue-hotkeys',
        '@tanstack/vue-query',
        'better-auth/client/plugins',
        'better-auth/vue',
        'motion-v',
        'libsodium-wrappers-sumo',
      ],
    },
  },

  typescript: {
    strict: true,
  },
})