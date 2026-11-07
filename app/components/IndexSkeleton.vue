<script setup lang="ts">
const { t } = useLanguage()
</script>

<template>
  <div class="space-y-3" role="status" aria-busy="true">
    <span class="sr-only">{{ t('sqliteChecking') }}</span>
    <USkeleton v-for="row in 3" :key="row" class="h-16 w-full rounded-xl motion-reduce:animate-none" />
  </div>
</template>
