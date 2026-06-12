<script setup lang="ts">
import licenseRaw from '../../LICENSE?raw'
import mitRaw from '../../LICENSE-MIT?raw'
import wtfplRaw from '../../LICENSE-WTFPL?raw'
</script>

<template>
  <PublicShell>
    <div class="max-w-2xl mx-auto w-full flex flex-col gap-6">
      <h1 class="text-3xl font-bold">License</h1>
      <pre class="ng-card rounded-2xl border p-6 text-sm whitespace-pre-wrap" style="background: var(--p-content-background)">{{ licenseRaw }}</pre>
      <div>
        <h2 class="text-xl font-bold mb-3">MIT License</h2>
        <pre class="ng-card rounded-2xl border p-6 text-sm whitespace-pre-wrap" style="background: var(--p-content-background)">{{ mitRaw }}</pre>
      </div>
      <div>
        <h2 class="text-xl font-bold mb-3">WTFPL, Version 2</h2>
        <pre class="ng-card rounded-2xl border p-6 text-sm whitespace-pre-wrap" style="background: var(--p-content-background)">{{ wtfplRaw }}</pre>
      </div>
    </div>
  </PublicShell>
</template>
