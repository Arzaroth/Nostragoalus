<script setup lang="ts">
const route = useRoute()
await navigateTo(`/${route.params.competition}/matches`, { replace: true })
</script>

<template>
  <div />
</template>
