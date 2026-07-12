<script setup lang="ts">
// Diagnostic route: deliberately raises a 500 so the red-card error page can be
// viewed (and the error handler exercised) on demand. fatal:true renders the
// full-page error UI rather than an inline boundary.
const { t } = useI18n()
throw createError({ statusCode: 500, statusMessage: t('err.serverError'), fatal: true })
</script>

<template>
  <div />
</template>
