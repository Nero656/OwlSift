<script setup lang="ts">
import qrCode from '~/assets/images/support-qr.svg'

defineProps<{ compact?: boolean }>()
const { t } = useLanguage()
const dialog = ref<HTMLDialogElement | null>(null)
const openError = ref('')
const donationUrl = 'https://www.donationalerts.com/r/nero_656'
const openDialog = () => {
  openError.value = ''
  dialog.value?.showModal()
}
const openDonation = async (event: MouseEvent) => {
  if (!window.electron) return
  event.preventDefault()
  try { await window.electron.invoke('app:open-donation') }
  catch { openError.value = t('donationOpenError') }
}
</script>

<template>
  <div class="px-3 pb-2" :class="compact ? 'flex justify-center' : ''">
    <button type="button" class="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 p-2.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400"
      :class="compact ? '' : 'w-full'" :title="t('supportDeveloper')" :aria-label="t('supportDeveloper')" @click="openDialog">
      <Icon name="lucide:heart" size="16" />
      <span v-if="!compact">{{ t('supportDeveloper') }}</span>
    </button>
    <Teleport to="body">
      <dialog ref="dialog" aria-labelledby="support-title"
        class="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-2xl backdrop:bg-black/60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        @click="($event.target === dialog) && dialog?.close()">
        <div class="flex items-start justify-between gap-3">
          <h2 id="support-title" class="text-base font-semibold">{{ t('supportDeveloper') }}</h2>
          <button type="button" class="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" :aria-label="t('closeDialog')" @click="dialog?.close()">
            <Icon name="lucide:x" size="18" />
          </button>
        </div>
        <p class="mt-3 text-sm text-gray-500">{{ t('supportDescription') }}</p>
        <img :src="qrCode" :alt="t('supportDeveloper') + ' — DonationAlerts QR'" width="240" height="240" class="mx-auto my-5 h-60 w-60 max-w-full rounded-xl bg-white">
        <a :href="donationUrl" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700" @click="openDonation">
          <Icon name="lucide:external-link" size="16" />{{ t('openDonation') }}
        </a>
        <p v-if="openError" role="alert" class="mt-2 text-xs text-rose-500">{{ openError }}</p>
        <p class="mt-3 break-all text-center text-xs text-gray-500">{{ donationUrl }}</p>
      </dialog>
    </Teleport>
  </div>
</template>
