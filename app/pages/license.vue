<script setup lang="ts">
import licenseRaw from '../../LICENSE?raw'
</script>

<template>
  <PublicShell>
    <div class="max-w-2xl mx-auto w-full">
      <h1 class="text-3xl font-bold mb-6">License</h1>
      <pre class="ng-card rounded-2xl border p-6 text-sm whitespace-pre-wrap" style="background: var(--p-content-background)">{{ licenseRaw }}</pre>
    </div>
  </PublicShell>
</template>
