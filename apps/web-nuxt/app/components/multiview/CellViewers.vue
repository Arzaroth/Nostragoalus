<script setup lang="ts">
// Wraps useMatchPresence so its socket (and the `viewing` ping that counts this
// user) exists only while mounted - the tile mounts this for the focused cell
// only, keeping the multiview to one presence connection.
const props = defineProps<{ matchId: string }>()
const { count } = useMatchPresence(() => props.matchId)
</script>

<template>
  <MatchViewers v-if="count > 0" :count="count" />
</template>
