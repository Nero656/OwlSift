<template>
  <div style="padding:2rem;font-family:system-ui">
    <h1>AI Client</h1>
    <NuxtLink to="/settings">Настройки</NuxtLink>

    <div class="m-2">
      <UAlert :title="'Preference: '+$colorMode.preference + ' detected'"
              variant="subtle"
              v-if="$colorMode.preference === 'system'"/>


      <UAlert :title="'Preference: '+$colorMode.preference + ' forced'"
              variant="subtle"
              v-if="$colorMode.preference !== 'system'"
      />
    </div>

    <div class="flex justify-center gap-2.5 mt-5">
      <button
          v-for="theme of ['system', 'light', 'dark', 'sepia']"
          :key="theme"
          class="relative top-0 cursor-pointer p-2 bg-white dark:bg-gray-800 sepia:bg-[#eae0c9] border-2 border-gray-200 dark:border-gray-700 sepia:border-[#ded0bf] rounded-md transition-all duration-100 ease-in-out hover:-top-1 flex"
          :class="{
          'border-red-600! dark:border-red-400! sepia:border-[#6b4c2a]! -top-1!': !$colorMode.unknown && theme === $colorMode.preference,
          'text-red-600 dark:text-red-400 sepia:text-[#6b4c2a]': !$colorMode.unknown && theme === $colorMode.value,
        }"
          @click="$colorMode.preference = theme"
      >
        <UIcon
            :name="iconName(theme)"
            class="size-6"
        />
      </button>sadsad
    </div>

  </div>
</template>

<script setup>
function iconName(theme) {
  if (theme === 'system') return 'i-ph-laptop'
  if (theme === 'light') return 'i-ph-sun'
  if (theme === 'dark') return 'i-ph-moon'
  return 'i-ph-coffee'
}
</script>

<style>
body {
  background-color: #fff;
  color: rgba(0, 0, 0, 0.8);
}

.dark body {
  background-color: #091a28;
  color: #ebf4f1;
}

.sepia body {
  background-color: #f1e7d0;
  color: #433422;
}
</style>