<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{ isAdmin: boolean }>()
const { t } = useI18n()
const queryClient = useQueryClient()
const enabled = computed(() => props.isAdmin)
const meta = useCompetitionMeta()

interface AdminCompetition {
  id: string
  slug: string
  name: string
  provider: string
  externalCompetitionId: string
  seasonHint: string | null
  isActive: boolean
}
interface AdminCompetitions {
  competitions: AdminCompetition[]
  defaultSlug: string
  discoverableProviders: string[]
}
interface Discovered {
  externalCompetitionId: string
  name: string
  seasonHint: string | null
  isTournament: boolean | null
}
interface Probe {
  fixtures: number
  ingestible: number
  dropped: number
  groups: string[]
  stages: string[]
  twoLeggedStages: string[]
  hasBracket: boolean
  supported: boolean
  blockers: string[]
}

const { data, isPending } = useQuery({
  queryKey: ['admin-competitions'],
  enabled,
  queryFn: () => $fetch<AdminCompetitions>('/api/admin/competitions'),
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })

// Adding or archiving moves the slug set that competition.global.ts 404s
// against, and the list behind the public switcher. Both are cached for the
// session - the meta once during SSR, the list by vue-query - so without this a
// create followed by a click through to the new competition 404s until reload.
async function refreshAll() {
  await invalidate()
  await queryClient.invalidateQueries({ queryKey: ['competitions'] })
  const fresh = await $fetch<{ competitions: Competition[]; defaultSlug: string }>('/api/competitions')
  meta.value = { slugs: fresh.competitions.map((c) => c.slug), defaultSlug: fresh.defaultSlug }
}

const err = ref('')
const fail = (e: any, fallback: string) => {
  err.value = e?.data?.message || e?.statusMessage || e?.message || t(fallback)
}

/* ---- default competition ---- */

const selectedDefault = ref('')
watch(
  () => data.value,
  (cfg) => {
    // Seeded once, not on every refetch: a background refetch (vue-query refetches
    // on window focus, and every mutation invalidates) would otherwise discard a
    // selection the admin had not saved yet.
    if (cfg && !selectedDefault.value) selectedDefault.value = cfg.defaultSlug
  },
  { immediate: true },
)
const defaultDirty = computed(() => !!data.value && selectedDefault.value !== data.value.defaultSlug)
const savedDefault = ref(false)

const saveDefault = useMutation({
  mutationFn: () =>
    $fetch<{ defaultSlug: string }>('/api/admin/competitions/default', {
      method: 'PUT',
      body: { competition: selectedDefault.value },
    }),
  onSuccess: async (res) => {
    err.value = ''
    savedDefault.value = true
    // Every slug-less link in this session reads the SSR-seeded copy.
    await refreshAll()
  },
  onError: (e) => {
    savedDefault.value = false
    fail(e, 'admin.competitions.saveFailed')
  },
})

/* ---- archive / restore ---- */

const setActive = useMutation({
  mutationFn: (v: { slug: string; isActive: boolean }) => {
    // Widened to string on purpose: Nuxt's typed $fetch tries to match a
    // template-literal path against every route and blows the type stack.
    const url: string = `/api/admin/competitions/${encodeURIComponent(v.slug)}/active`
    return $fetch<{ slug: string; isActive: boolean }>(url, { method: 'PUT', body: { isActive: v.isActive } })
  },
  onSuccess: async () => {
    err.value = ''
    await refreshAll()
  },
  onError: (e) => fail(e, 'admin.competitions.archiveFailed'),
})

/* ---- add a competition: discover -> probe -> create ---- */

const adding = ref(false)
const provider = ref('')
const catalog = ref<Discovered[] | null>(null)
const chosen = ref('')
const probe = ref<Probe | null>(null)
const draftSlug = ref('')
const draftName = ref('')

watch(
  () => data.value?.discoverableProviders,
  (list) => {
    if (list?.length && !provider.value) provider.value = list[0]!
  },
  { immediate: true },
)

const chosenEntry = computed(() => catalog.value?.find((c) => c.externalCompetitionId === chosen.value) ?? null)
const takenSlugs = computed(() => new Set((data.value?.competitions ?? []).map((c) => c.slug)))

// A stable, URL-safe suggestion the admin can still overwrite. The slug is
// permanent once created, so it is offered rather than imposed.
function suggestSlug(name: string, season: string | null): string {
  const base = slugify(name)
  return season ? `${base}-${season}` : base
}

const discover = useMutation({
  mutationFn: () => $fetch<{ competitions: Discovered[] }>('/api/admin/competitions/discover', { params: { provider: provider.value } }),
  onSuccess: (res) => {
    err.value = ''
    catalog.value = res.competitions
    chosen.value = ''
    probe.value = null
  },
  onError: (e) => fail(e, 'admin.competitions.discoverFailed'),
})

const runProbe = useMutation({
  mutationFn: () =>
    $fetch<Probe>('/api/admin/competitions/probe', {
      params: {
        provider: provider.value,
        externalCompetitionId: chosen.value,
        ...(chosenEntry.value?.seasonHint ? { seasonHint: chosenEntry.value.seasonHint } : {}),
      },
    }),
  onSuccess: (res) => {
    err.value = ''
    probe.value = res
    const entry = chosenEntry.value
    if (entry) {
      draftName.value = entry.name
      draftSlug.value = suggestSlug(entry.name, entry.seasonHint)
    }
  },
  onError: (e) => {
    probe.value = null
    fail(e, 'admin.competitions.probeFailed')
  },
})

const create = useMutation({
  mutationFn: () =>
    $fetch<AdminCompetition>('/api/admin/competitions', {
      method: 'POST',
      body: {
        slug: draftSlug.value.trim(),
        name: draftName.value.trim(),
        provider: provider.value,
        externalCompetitionId: chosen.value,
        seasonHint: chosenEntry.value?.seasonHint ?? null,
      },
    }),
  onSuccess: async () => {
    err.value = ''
    adding.value = false
    catalog.value = null
    chosen.value = ''
    probe.value = null
    await refreshAll()
  },
  onError: (e) => fail(e, 'admin.competitions.createFailed'),
})

const slugTaken = computed(() => takenSlugs.value.has(draftSlug.value.trim()))
const canCreate = computed(
  () => !!probe.value?.supported && !!draftSlug.value.trim() && !!draftName.value.trim() && !slugTaken.value,
)
</script>

<template>
  <section v-if="isAdmin" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6 flex flex-col gap-6">
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.intro') }}</p>

      <div v-if="isPending" class="text-sm" style="color: var(--p-text-muted-color)">…</div>

      <template v-else-if="data">
        <!-- Default competition -->
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.defaultLabel') }}</span>
            <select
              v-model="selectedDefault"
              class="rounded-lg border px-2 py-1.5 text-sm w-64"
              style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
            >
              <option v-for="c in data.competitions.filter((x) => x.isActive)" :key="c.id" :value="c.slug">{{ c.name }} ({{ c.slug }})</option>
            </select>
          </label>
          <button
            type="button"
            :disabled="!defaultDirty || saveDefault.isPending.value"
            class="px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
            style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
            @click="saveDefault.mutate()"
          >
            {{ t('admin.competitions.save') }}
          </button>
          <span v-if="savedDefault && !defaultDirty" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.saved') }}</span>
        </div>

        <!-- The competitions themselves -->
        <table class="w-full text-sm">
          <thead>
            <tr style="color: var(--p-text-muted-color)" class="text-start">
              <th class="py-1 text-start">{{ t('admin.competitions.colCompetition') }}</th>
              <th class="text-start">{{ t('admin.competitions.colSource') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in data.competitions" :key="c.id" class="border-t align-top" style="border-color: var(--p-content-border-color)">
              <td class="py-2 pe-3">
                <div class="font-medium" :class="{ 'opacity-60': !c.isActive }">
                  {{ c.name }}
                  <span v-if="!c.isActive" class="text-xs font-normal">({{ t('admin.competitions.archived') }})</span>
                  <span v-if="c.slug === data.defaultSlug" class="text-xs font-normal">- {{ t('admin.competitions.isDefault') }}</span>
                </div>
                <code class="text-xs" style="color: var(--p-text-muted-color)">{{ c.slug }}</code>
              </td>
              <td class="pe-3 text-xs" style="color: var(--p-text-muted-color)">
                {{ c.provider }} / {{ c.externalCompetitionId }}<span v-if="c.seasonHint"> / {{ c.seasonHint }}</span>
              </td>
              <td class="text-end">
                <button
                  type="button"
                  :disabled="setActive.isPending.value || (c.isActive && c.slug === data.defaultSlug)"
                  class="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
                  style="border-color: var(--p-content-border-color)"
                  @click="setActive.mutate({ slug: c.slug, isActive: !c.isActive })"
                >
                  {{ c.isActive ? t('admin.competitions.archive') : t('admin.competitions.restore') }}
                </button>
                <!-- Spelled out, not a tooltip: a disabled button shows none. -->
                <div v-if="c.isActive && c.slug === data.defaultSlug" class="text-xs mt-1" style="color: var(--p-text-muted-color)">
                  {{ t('admin.competitions.cantArchiveDefault') }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Add a competition -->
        <div class="border-t pt-4" style="border-color: var(--p-content-border-color)">
          <button
            v-if="!adding"
            type="button"
            class="px-3 py-1.5 rounded-lg font-semibold text-sm"
            style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
            @click="adding = true"
          >
            {{ t('admin.competitions.add') }}
          </button>

          <div v-else class="flex flex-col gap-3">
            <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.addIntro') }}</p>

            <div class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.colProvider') }}</span>
                <select
                  v-model="provider"
                  class="rounded-lg border px-2 py-1.5 text-sm w-40"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                >
                  <option v-for="p in data.discoverableProviders" :key="p" :value="p">{{ p }}</option>
                </select>
              </label>
              <button
                type="button"
                :disabled="!provider || discover.isPending.value"
                class="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
                style="border-color: var(--p-content-border-color)"
                @click="discover.mutate()"
              >
                {{ discover.isPending.value ? t('admin.competitions.discovering') : t('admin.competitions.discover') }}
              </button>
            </div>

            <div v-if="catalog" class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.colCompetition') }}</span>
                <select
                  v-model="chosen"
                  class="rounded-lg border px-2 py-1.5 text-sm w-80"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                  @change="probe = null"
                >
                  <option value="">{{ t('admin.competitions.choose') }}</option>
                  <option v-for="c in catalog" :key="c.externalCompetitionId" :value="c.externalCompetitionId">
                    {{ c.name }}<span v-if="c.seasonHint"> ({{ c.seasonHint }})</span>
                  </option>
                </select>
              </label>
              <button
                type="button"
                :disabled="!chosen || runProbe.isPending.value"
                class="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
                style="border-color: var(--p-content-border-color)"
                @click="runProbe.mutate()"
              >
                {{ runProbe.isPending.value ? t('admin.competitions.probing') : t('admin.competitions.probe') }}
              </button>
            </div>

            <!-- The verdict: what would actually land, before anything is saved -->
            <div
              v-if="probe"
              class="rounded-xl border p-3 text-sm flex flex-col gap-1"
              :style="{ borderColor: probe.supported ? 'var(--ng-success)' : 'var(--ng-danger)' }"
            >
              <div class="font-semibold" :style="{ color: probe.supported ? 'var(--ng-success)' : 'var(--ng-danger)' }">
                {{ probe.supported ? t('admin.competitions.probeOk') : t('admin.competitions.probeBad') }}
              </div>
              <div class="text-xs" style="color: var(--p-text-muted-color)">
                {{ t('admin.competitions.probeCounts', { fixtures: probe.fixtures, ingestible: probe.ingestible }) }}
                <span v-if="probe.groups.length"> · {{ t('admin.competitions.probeGroups', { n: probe.groups.length }) }}</span>
                <span v-if="probe.stages.length"> · {{ probe.stages.join(', ') }}</span>
                <span v-if="probe.hasBracket"> · {{ t('admin.competitions.probeBracket') }}</span>
              </div>
              <ul v-if="probe.blockers.length" class="text-xs list-disc ms-4">
                <li v-for="b in probe.blockers" :key="b">
                  {{ t(`admin.competitions.blocker_${b}`) }}
                  <span v-if="b === 'two_legged_knockout'"> ({{ probe.twoLeggedStages.join(', ') }})</span>
                </li>
              </ul>
            </div>

            <div v-if="probe?.supported" class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.nameLabel') }}</span>
                <input
                  v-model="draftName"
                  type="text"
                  maxlength="120"
                  class="rounded-lg border px-2 py-1.5 text-sm w-64"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                >
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.slugLabel') }}</span>
                <input
                  v-model="draftSlug"
                  type="text"
                  maxlength="64"
                  class="rounded-lg border px-2 py-1.5 text-sm w-64"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                >
              </label>
              <button
                type="button"
                :disabled="!canCreate || create.isPending.value"
                class="px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
                @click="create.mutate()"
              >
                {{ t('admin.competitions.create') }}
              </button>
              <span v-if="slugTaken" class="text-xs" style="color: var(--ng-danger)">{{ t('admin.competitions.slugTaken') }}</span>
              <span v-else class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.slugPermanent') }}</span>
            </div>

            <button type="button" class="text-xs underline self-start" style="color: var(--p-text-muted-color)" @click="adding = false">
              {{ t('admin.competitions.cancel') }}
            </button>
          </div>
        </div>
      </template>

      <span v-if="err" class="text-xs" style="color: var(--ng-danger)">{{ err }}</span>
    </div>
  </section>
</template>
