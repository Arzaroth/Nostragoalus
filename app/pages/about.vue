<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'
import changelogRaw from '../../CHANGELOG.md?raw'

const { t } = useI18n()
const { isDark } = useTheme()

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
      { name: 'Nuxt', logo: 'nuxt', desc: 'Vue meta-framework: SSR, routing, server in one', url: 'https://nuxt.com', license: 'MIT', licenseUrl: 'https://github.com/nuxt/nuxt/blob/main/LICENSE' },
      { name: 'Vue 3', logo: 'vuedotjs', desc: 'The reactive UI framework underneath it all', url: 'https://vuejs.org', license: 'MIT', licenseUrl: 'https://github.com/vuejs/core/blob/main/LICENSE' },
      { name: 'TypeScript', logo: 'typescript', desc: 'Typed JavaScript, end to end', url: 'https://www.typescriptlang.org', license: 'Apache-2.0', licenseUrl: 'https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt' },
      { name: 'PrimeVue', logo: 'primevue', desc: 'The component library (inputs, tables, tooltips…)', url: 'https://primevue.org', license: 'MIT', licenseUrl: 'https://github.com/primefaces/primevue/blob/master/LICENSE.md' },
      { name: 'UnoCSS', logo: 'unocss', logoColor: '8b8b8b', desc: 'Atomic CSS engine for the utility classes', url: 'https://unocss.dev', license: 'MIT', licenseUrl: 'https://github.com/unocss/unocss/blob/main/LICENSE' },
      { name: 'TanStack Query', logo: 'https://tanstack.com/favicon-32x32.png', desc: 'Server-state caching, mutations, invalidation', url: 'https://tanstack.com/query', license: 'MIT', licenseUrl: 'https://github.com/TanStack/query/blob/main/LICENSE' },
      { name: 'TanStack Hotkeys', logo: 'https://tanstack.com/favicon-32x32.png', desc: 'Keyboard shortcuts (the fixtures search hotkey)', url: 'https://tanstack.com/hotkeys', license: 'MIT', licenseUrl: 'https://github.com/TanStack/hotkeys/blob/main/LICENSE' },
      { name: 'Motion for Vue', logo: 'https://motion.dev/favicon.svg', desc: 'The scroll-driven banner choreography', url: 'https://motion.dev', license: 'MIT', licenseUrl: 'https://github.com/motiondivision/motion/blob/main/LICENSE.md' },
      { name: 'VueUse', logo: 'vueuse', desc: 'Composition utilities: clipboard, QR, timers, media queries', url: 'https://vueuse.org', license: 'MIT', licenseUrl: 'https://github.com/vueuse/vueuse/blob/main/LICENSE' },
      { name: 'Nuxt I18n', logo: 'https://i18n.nuxtjs.org/icon.svg', desc: 'The four-language catalog (vue-i18n under the hood)', url: 'https://i18n.nuxtjs.org', license: 'MIT', licenseUrl: 'https://github.com/nuxt-modules/i18n/blob/main/LICENSE' },
      { name: 'Leaflet', logo: 'leaflet', desc: 'The interactive world map', url: 'https://leafletjs.com', license: 'BSD-2-Clause', licenseUrl: 'https://github.com/Leaflet/Leaflet/blob/main/LICENSE' },
    ],
  },
  {
    group: 'Backend',
    items: [
      { name: 'Nitro / h3', logo: 'https://nitro.build/icon.svg', desc: 'The server engine: API routes, tasks, WebSockets', url: 'https://nitro.build', license: 'MIT', licenseUrl: 'https://github.com/nitrojs/nitro/blob/main/LICENSE' },
      { name: 'Drizzle ORM', logo: 'drizzle', desc: 'Typed SQL, schema and migrations', url: 'https://orm.drizzle.team', license: 'Apache-2.0', licenseUrl: 'https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE' },
      { name: 'PostgreSQL', logo: 'postgresql', desc: 'The database', url: 'https://www.postgresql.org', license: 'PostgreSQL', licenseUrl: 'https://www.postgresql.org/about/licence/' },
      { name: 'node-postgres', logo: 'https://node-postgres.com/favicon.ico', desc: 'The pg driver wiring Drizzle to the database', url: 'https://node-postgres.com', license: 'MIT', licenseUrl: 'https://github.com/brianc/node-postgres/blob/master/LICENSE' },
      { name: 'better-auth', logo: 'betterauth', logoColor: '8b8b8b', desc: 'Auth: sessions, 2FA, passkeys, SSO, admin', url: 'https://better-auth.com', license: 'MIT', licenseUrl: 'https://github.com/better-auth/better-auth/blob/main/LICENSE.md' },
      { name: 'Nodemailer', logo: 'https://nodemailer.com/img/favicon.ico', desc: 'SMTP delivery for email codes', url: 'https://nodemailer.com', license: 'MIT-0', licenseUrl: 'https://github.com/nodemailer/nodemailer/blob/master/LICENSE' },
      { name: 'node-qrcode', icon: 'pi pi-qrcode', desc: 'The 2FA enrollment QR codes', url: 'https://github.com/soldair/node-qrcode', license: 'MIT', licenseUrl: 'https://github.com/soldair/node-qrcode/blob/master/license' },
    ],
  },
  {
    group: 'Tooling & infrastructure',
    items: [
      { name: 'Node.js', logo: 'nodedotjs', desc: 'The runtime', url: 'https://nodejs.org', license: 'MIT', licenseUrl: 'https://github.com/nodejs/node/blob/main/LICENSE' },
      { name: 'pnpm', logo: 'pnpm', desc: 'Package management', url: 'https://pnpm.io', license: 'MIT', licenseUrl: 'https://github.com/pnpm/pnpm/blob/main/LICENSE' },
      { name: 'Vite', logo: 'vite', desc: 'Dev server and bundling under Nuxt', url: 'https://vite.dev', license: 'MIT', licenseUrl: 'https://github.com/vitejs/vite/blob/main/LICENSE' },
      { name: 'Vitest', logo: 'vitest', desc: 'The test runner behind the 98% coverage gate', url: 'https://vitest.dev', license: 'MIT', licenseUrl: 'https://github.com/vitest-dev/vitest/blob/main/LICENSE' },
      { name: 'Docker', logo: 'docker', desc: 'Containers for the app, database and mail catcher', url: 'https://www.docker.com', license: 'Apache-2.0', licenseUrl: 'https://github.com/moby/moby/blob/master/LICENSE' },
      { name: 'maildev', logo: 'https://maildev.github.io/maildev/favicon.ico', desc: 'Local SMTP catcher for dev email flows', url: 'https://maildev.github.io/maildev/', license: 'MIT', licenseUrl: 'https://github.com/maildev/maildev/blob/master/LICENSE' },
      { name: 'mise', logo: 'https://mise.jdx.dev/logo-light.svg', logoDark: 'https://mise.jdx.dev/logo-dark.svg', desc: 'Task shortcuts for the compose stacks', url: 'https://mise.jdx.dev', license: 'MIT', licenseUrl: 'https://github.com/jdx/mise/blob/main/LICENSE' },
      { name: 'PGlite', logo: 'postgresql', desc: 'In-memory Postgres powering hermetic tests', url: 'https://pglite.dev', license: 'Apache-2.0', licenseUrl: 'https://github.com/electric-sql/pglite/blob/main/LICENSE' },
      { name: 'Bun', logo: 'https://bun.com/logo.svg', desc: 'Alternative runtime - the production bundle runs on it too', url: 'https://bun.sh', license: 'MIT', licenseUrl: 'https://github.com/oven-sh/bun/blob/main/LICENSE.md' },
    ],
  },
]

// Minimal keepachangelog parser: versions -> categories -> bullets.
interface ChangelogVersion {
  version: string
  date: string
  sections: { title: string; items: string[] }[]
}
const changelog = computed<ChangelogVersion[]>(() => {
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | null = null
  let section: { title: string; items: string[] } | null = null
  for (const line of changelogRaw.split('\n')) {
    const v = /^## \[([^\]]+)\](?: - (.+))?/.exec(line)
    if (v) {
      current = { version: v[1], date: v[2] ?? '', sections: [] }
      section = null
      if (v[1].toLowerCase() !== 'unreleased') versions.push(current)
      continue
    }
    const s = /^### (.+)/.exec(line)
    if (s && current) {
      section = { title: s[1], items: [] }
      current.sections.push(section)
      continue
    }
    const b = /^- (.+)/.exec(line)
    if (b && section) section.items.push(b[1])
  }
  return versions
})

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
    <section>
      <h2 class="font-semibold text-xl mb-5">{{ t('about.changelogTitle') }}</h2>
      <div class="flex flex-col gap-6">
        <div v-for="v in changelog" :id="`v${v.version}`" :key="v.version" class="ng-card rounded-2xl border p-5" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem); background: var(--p-content-background)">
          <div class="flex items-baseline gap-3 mb-3">
            <span class="font-bold text-lg" style="color: var(--p-primary-color)">{{ v.version }}</span>
            <span class="text-xs" style="color: var(--p-text-muted-color)">{{ v.date }}</span>
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
