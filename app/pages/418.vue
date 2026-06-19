<script setup lang="ts">
// Diagnostic route: deliberately raises a 418 so the teapot error page can be
// viewed (and the error handler exercised) on demand. fatal:true renders the
// full-page error UI rather than an inline boundary.
const { t } = useI18n()
throw createError({ statusCode: 418, statusMessage: t('err.teapot'), fatal: true })
</script>

<template>
  <div />
</template>
