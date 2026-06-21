<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'
import { isUnseen } from '~/utils/changelog'

const { t } = useI18n()
useHead({ title: t('about.title') })
const { isDark } = useTheme()

// Parsed changelog + "since last seen" marker. Snapshot what the user had seen
// BEFORE this visit marks everything read, so the newer entries stay
// highlighted while they read. The better-auth session resolves asynchronously
// on a cold load (no cookie cache), so capture off the user becoming available
// rather than a one-shot onMounted: snapshotting in onMounted would read a null
// marker before the session lands and silently suppress every highlight.
// Client-only and one-shot, so SSR and the first client render agree (both
// unhighlighted) and the highlight pops in once the session resolves.
const { versions: changelog, user, lastSeen, markSeen } = useChangelog()
const seenBefore = ref<string | null>(null)
let captured = false
watch(
  user,
  (u) => {
    if (!u || captured || !import.meta.client) return
    captured = true
    seenBefore.value = lastSeen.value
    void markSeen()
  },
  { immediate: true },
)

function logoSrc(item: StackItem): string {
  const logo = (isDark.value && item.logoDark) || item.logo!
  return logo.startsWith('http') ? logo : `https://cdn.simpleicons.org/${logo}${item.logoColor ? `/${item.logoColor}` : ''}`
}

interface StackItem {
  name: string
  logo?: string // simpleicons slug, or an absolute URL to an official logo
  logoDark?: string // dark-mode variant when the project ships one
  logoColor?: string // simpleicons color override for marks invisible on one theme
  icon?: string // PrimeIcons class for projects without a logo
  desc: string
  url: string
  license: string
  licenseUrl: string
}

const stack: { group: string; items: StackItem[] }[] = [
  {
    group: 'Frontend',
    items: [
      { name: 'Nuxt', logo: 'nuxt', desc: 'The intuitive Vue framework', url: 'https://nuxt.com', license: 'MIT', licenseUrl: 'https://github.com/nuxt/nuxt/blob/main/LICENSE' },
      { name: 'Vue 3', logo: 'vuedotjs', desc: 'The progressive JavaScript framework', url: 'https://vuejs.org', license: 'MIT', licenseUrl: 'https://github.com/vuejs/core/blob/main/LICENSE' },
      { name: 'TypeScript', logo: 'typescript', desc: 'JavaScript with syntax for types', url: 'https://www.typescriptlang.org', license: 'Apache-2.0', licenseUrl: 'https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt' },
      { name: 'PrimeVue', logo: 'primevue', desc: 'The most complete UI component suite for Vue', url: 'https://primevue.org', license: 'MIT', licenseUrl: 'https://github.com/primefaces/primevue/blob/master/LICENSE.md' },
      { name: 'UnoCSS', logo: 'unocss', logoColor: '8b8b8b', desc: 'The instant on-demand atomic CSS engine', url: 'https://unocss.dev', license: 'MIT', licenseUrl: 'https://github.com/unocss/unocss/blob/main/LICENSE' },
      { name: 'TanStack Query', logo: 'https://tanstack.com/favicon-32x32.png', desc: 'Powerful asynchronous state management', url: 'https://tanstack.com/query', license: 'MIT', licenseUrl: 'https://github.com/TanStack/query/blob/main/LICENSE' },
      { name: 'TanStack Hotkeys', logo: 'https://tanstack.com/favicon-32x32.png', desc: 'Keyboard shortcut management', url: 'https://tanstack.com/hotkeys', license: 'MIT', licenseUrl: 'https://github.com/TanStack/hotkeys/blob/main/LICENSE' },
      { name: 'Motion for Vue', logo: 'https://motion.dev/favicon.svg', desc: 'A modern animation library for Vue', url: 'https://motion.dev', license: 'MIT', licenseUrl: 'https://github.com/motiondivision/motion/blob/main/LICENSE.md' },
      { name: 'VueUse', logo: 'vueuse', desc: 'Collection of essential Vue composition utilities', url: 'https://vueuse.org', license: 'MIT', licenseUrl: 'https://github.com/vueuse/vueuse/blob/main/LICENSE' },
      { name: 'Nuxt I18n', logo: 'https://i18n.nuxtjs.org/icon.svg', desc: 'Internationalization for Nuxt', url: 'https://i18n.nuxtjs.org', license: 'MIT', licenseUrl: 'https://github.com/nuxt-modules/i18n/blob/main/LICENSE' },
      { name: 'Leaflet', logo: 'leaflet', desc: 'An open-source library for mobile-friendly interactive maps', url: 'https://leafletjs.com', license: 'BSD-2-Clause', licenseUrl: 'https://github.com/Leaflet/Leaflet/blob/main/LICENSE' },
      { name: 'marked', logo: 'markdown', desc: 'A markdown parser and compiler built for speed', url: 'https://marked.js.org', license: 'MIT', licenseUrl: 'https://github.com/markedjs/marked/blob/master/LICENSE.md' },
      { name: 'DOMPurify', logo: 'https://cure53.de/favicon.ico', desc: 'A DOM-only, super-fast, uber-tolerant XSS sanitizer for HTML, MathML and SVG', url: 'https://cure53.de/purify', license: 'Apache-2.0 OR MPL-2.0', licenseUrl: 'https://github.com/cure53/DOMPurify/blob/main/LICENSE' },
      { name: 'Vite PWA', logo: 'https://vite-pwa-org.netlify.app/favicon.svg', desc: 'Zero-config PWA framework-agnostic plugin for Vite', url: 'https://vite-pwa-org.netlify.app', license: 'MIT', licenseUrl: 'https://github.com/vite-pwa/vite-plugin-pwa/blob/main/LICENSE' },
      { name: 'web-push', logo: 'nodedotjs', desc: 'Web Push library for Node.js', url: 'https://github.com/web-push-libs/web-push', license: 'MPL-2.0', licenseUrl: 'https://github.com/web-push-libs/web-push/blob/master/LICENSE' },
    ],
  },
  {
    group: 'Backend',
    items: [
      { name: 'Nitro / h3', logo: 'https://nitro.build/icon.svg', desc: 'The next-generation server toolkit', url: 'https://nitro.build', license: 'MIT', licenseUrl: 'https://github.com/nitrojs/nitro/blob/main/LICENSE' },
      { name: 'Drizzle ORM', logo: 'drizzle', desc: 'A TypeScript ORM that feels like SQL', url: 'https://orm.drizzle.team', license: 'Apache-2.0', licenseUrl: 'https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE' },
      { name: 'PostgreSQL', logo: 'postgresql', desc: "The world's most advanced open-source relational database", url: 'https://www.postgresql.org', license: 'PostgreSQL', licenseUrl: 'https://www.postgresql.org/about/licence/' },
      { name: 'node-postgres', logo: 'https://node-postgres.com/favicon.ico', desc: 'PostgreSQL client for Node.js', url: 'https://node-postgres.com', license: 'MIT', licenseUrl: 'https://github.com/brianc/node-postgres/blob/master/LICENSE' },
      { name: 'better-auth', logo: 'betterauth', logoColor: '8b8b8b', desc: 'Comprehensive authentication framework for TypeScript', url: 'https://better-auth.com', license: 'MIT', licenseUrl: 'https://github.com/better-auth/better-auth/blob/main/LICENSE.md' },
      { name: 'Nodemailer', logo: 'https://nodemailer.com/img/favicon.ico', desc: 'Send emails from Node.js', url: 'https://nodemailer.com', license: 'MIT-0', licenseUrl: 'https://github.com/nodemailer/nodemailer/blob/master/LICENSE' },
      { name: 'node-qrcode', icon: 'pi pi-qrcode', desc: 'QR code generator for JavaScript', url: 'https://github.com/soldair/node-qrcode', license: 'MIT', licenseUrl: 'https://github.com/soldair/node-qrcode/blob/master/license' },
      { name: 'Croner', icon: 'pi pi-clock', desc: 'Trigger functions and evaluate cron expressions, dependency-free', url: 'https://croner.56k.guru', license: 'MIT', licenseUrl: 'https://github.com/Hexagon/croner/blob/master/LICENSE' },
      { name: 'Satori', icon: 'pi pi-palette', desc: 'Enlightened library to convert HTML and CSS to SVG', url: 'https://github.com/vercel/satori', license: 'MPL-2.0', licenseUrl: 'https://github.com/vercel/satori/blob/main/LICENSE' },
      { name: 'resvg-js', icon: 'pi pi-image', desc: 'A high-performance SVG renderer and toolkit, powered by Rust', url: 'https://github.com/yisibl/resvg-js', license: 'MPL-2.0', licenseUrl: 'https://github.com/yisibl/resvg-js/blob/main/LICENSE' },
    ],
  },
  {
    group: 'Tooling & infrastructure',
    items: [
      { name: 'Node.js', logo: 'nodedotjs', desc: "JavaScript runtime built on Chrome's V8 engine", url: 'https://nodejs.org', license: 'MIT', licenseUrl: 'https://github.com/nodejs/node/blob/main/LICENSE' },
      { name: 'pnpm', logo: 'pnpm', desc: 'Fast, disk-space-efficient package manager', url: 'https://pnpm.io', license: 'MIT', licenseUrl: 'https://github.com/pnpm/pnpm/blob/main/LICENSE' },
      { name: 'Vite', logo: 'vite', desc: 'Next-generation frontend tooling', url: 'https://vite.dev', license: 'MIT', licenseUrl: 'https://github.com/vitejs/vite/blob/main/LICENSE' },
      { name: 'Vitest', logo: 'vitest', desc: 'A Vite-native test framework', url: 'https://vitest.dev', license: 'MIT', licenseUrl: 'https://github.com/vitest-dev/vitest/blob/main/LICENSE' },
      { name: 'Docker', logo: 'docker', desc: 'Build, ship, and run applications in containers', url: 'https://www.docker.com', license: 'Apache-2.0', licenseUrl: 'https://github.com/moby/moby/blob/master/LICENSE' },
      { name: 'maildev', logo: 'https://maildev.github.io/maildev/favicon.ico', desc: 'SMTP server and web UI for testing emails in development', url: 'https://maildev.github.io/maildev/', license: 'MIT', licenseUrl: 'https://github.com/maildev/maildev/blob/master/LICENSE' },
      { name: 'mise', logo: 'https://mise.jdx.dev/logo-light.svg', logoDark: 'https://mise.jdx.dev/logo-dark.svg', desc: 'Dev tools, env vars, and task runner', url: 'https://mise.jdx.dev', license: 'MIT', licenseUrl: 'https://github.com/jdx/mise/blob/main/LICENSE' },
      { name: 'PGlite', logo: 'postgresql', desc: 'A lightweight WASM Postgres build', url: 'https://pglite.dev', license: 'Apache-2.0', licenseUrl: 'https://github.com/electric-sql/pglite/blob/main/LICENSE' },
      { name: 'Bun', logo: 'https://bun.com/logo.svg', desc: 'A fast all-in-one JavaScript runtime', url: 'https://bun.sh', license: 'MIT', licenseUrl: 'https://github.com/oven-sh/bun/blob/main/LICENSE.md' },
    ],
  },
]

// Render the inline markdown our changelog bullets use (bold / `code` / italic
// / links) with marked, then sanitize (marked's recommended defense). Links
// open in a new tab.
marked.use({
  renderer: {
    link({ href, text }) {
      return `<a href="${href}" target="_blank" rel="noopener" class="underline">${text}</a>`
    },
  },
})
const renderInline = (md: string): string =>
  DOMPurify.sanitize(marked.parseInline(md) as string, { ADD_ATTR: ['target'] })
</script>

<template>
  <PublicShell>
    <div class="max-w-4xl mx-auto flex flex-col gap-12">
    <div>
      <h1 class="text-3xl font-bold flex items-center gap-3"><img src="/brand/mark.svg" alt="" class="w-10 h-10" >{{ t('about.title') }}</h1>
      <p class="mt-3 max-w-2xl" style="color: var(--p-text-muted-color)">{{ t('about.intro') }}</p>
    </div>

    <!-- AI acknowledgement -->
    <section class="ng-card rounded-2xl border p-6" style="background: var(--p-content-background)">
      <h2 class="font-semibold text-lg flex items-center gap-2"><i class="pi pi-sparkles" style="color: var(--p-primary-color)" /> {{ t('about.aiTitle') }}</h2>
      <p class="text-sm mt-2" style="color: var(--p-text-muted-color)">{{ t('about.aiText') }}</p>
      <a href="https://git.arzaroth.com/Arzaroth/Nostragoalus" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-3 text-sm hover:underline" style="color: var(--p-primary-color)"><i class="pi pi-code" /> {{ t('about.sourceCta') }}</a>
    </section>

    <!-- Tech stack -->
    <section>
      <h2 class="font-semibold text-xl mb-1">{{ t('about.stackTitle') }}</h2>
      <p class="text-sm mb-5" style="color: var(--p-text-muted-color)">{{ t('about.stackSub') }}</p>
      <div v-for="g in stack" :key="g.group" class="mb-6">
        <h3 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ g.group }}</h3>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <!-- Card is a plain div: the project link is a stretched anchor over the
               whole card, the license badge a second anchor on top. Two sibling
               anchors, never nested (nesting corrupts the parse + leaks styles). -->
          <div
            v-for="item in g.items"
            :key="item.name"
            class="ng-card relative rounded-xl border p-4 flex flex-col gap-1 hover:!border-[var(--p-primary-color)] transition-colors"
            style="background: var(--p-content-background)"
          >
            <span class="font-semibold flex items-center justify-between gap-2">
              <span class="flex items-center gap-2 min-w-0">
                <img v-if="item.logo" :src="logoSrc(item)" class="w-5 h-5 shrink-0" alt="" loading="lazy" onerror="this.style.display='none'" >
                <i v-else-if="item.icon" :class="item.icon" class="text-lg shrink-0" style="color: var(--p-text-muted-color)" />
                <a :href="item.url" target="_blank" rel="noopener" class="truncate after:absolute after:inset-0 after:content-['']">{{ item.name }}</a>
              </span>
              <a :href="item.licenseUrl" target="_blank" rel="noopener" class="relative text-[10px] font-mono px-1.5 py-0.5 rounded border hover:underline shrink-0" style="color: var(--p-text-muted-color); border-color: var(--p-content-border-color)">{{ item.license }}</a>
            </span>
            <span class="text-xs" style="color: var(--p-text-muted-color)">{{ item.desc }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Data sources -->
    <section class="ng-card rounded-2xl border p-6" style="background: var(--p-content-background)">
      <h2 class="font-semibold text-lg">{{ t('about.dataTitle') }}</h2>
      <p class="text-sm mt-2" style="color: var(--p-text-muted-color)">{{ t('about.dataText') }}</p>
      <div class="flex flex-wrap gap-2 mt-3 text-xs">
        <a href="https://www.fifa.com" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full border hover:underline" style="border-color: var(--p-content-border-color)">FIFA</a>
        <a href="https://www.uefa.com" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full border hover:underline" style="border-color: var(--p-content-border-color)">UEFA</a>
        <a href="https://www.sofascore.com" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full border hover:underline" style="border-color: var(--p-content-border-color)">Sofascore (odds)</a>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full border hover:underline" style="border-color: var(--p-content-border-color)">OpenStreetMap (ODbL)</a>
      </div>
    </section>

    <!-- Changelog -->
    <section id="changelog" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem)">
      <h2 class="font-semibold text-xl mb-5">{{ t('about.changelogTitle') }}</h2>
      <div class="flex flex-col gap-6">
        <div
          v-for="v in changelog"
          :id="`v${v.version}`"
          :key="v.version"
          class="ng-card rounded-2xl border p-5 transition-colors"
          :class="{ 'ng-changelog-new': isUnseen(v.version, seenBefore) }"
          style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem); background: var(--p-content-background)"
        >
          <div class="flex items-baseline gap-3 mb-3">
            <span class="font-bold text-lg" style="color: var(--p-primary-color)">{{ v.version }}</span>
            <span class="text-xs" style="color: var(--p-text-muted-color)">{{ v.date }}</span>
            <span
              v-if="isUnseen(v.version, seenBefore)"
              class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
              style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
            >{{ t('about.newBadge') }}</span>
          </div>
          <div v-for="s in v.sections" :key="s.title" class="mb-2">
            <div class="text-xs uppercase tracking-wider font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ s.title }}</div>
            <ul class="text-sm flex flex-col gap-1 list-disc pl-5 [&_code]:bg-[var(--p-content-border-color)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em]">
              <li v-for="(item, i) in s.items" :key="i" v-html="renderInline(item)" />
            </ul>
          </div>
        </div>
      </div>
    </section>
    </div>
  </PublicShell>
</template>

<style scoped>
/* Entries newer than the user's last visit: a primary-colored left accent +
   a tinted border, so the delta reads at a glance. */
.ng-changelog-new {
  border-color: color-mix(in srgb, var(--p-primary-color) 45%, var(--p-content-border-color));
  box-shadow: inset 3px 0 0 0 var(--p-primary-color);
}
</style>
