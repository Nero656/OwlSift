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
    <button type="button" class="flex items-center justify-center gap-2 rounded-xl bg-primary-500/10 p-2.5 text-xs font-medium text-primary-700 transition hover:bg-primary-500/20 dark:text-primary-400"
      :class="compact ? '' : 'w-full'" :title="t('supportDeveloper')" :aria-label="t('supportDeveloper')" @click="openDialog">
      <Icon name="lucide:heart" size="16" />
      <span v-if="!compact">{{ t('supportDeveloper') }}</span>
    </button>
    <Teleport to="body">
      <dialog ref="dialog" aria-labelledby="support-title"
        class="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-surface-200 bg-white p-5 text-surface-900 shadow-2xl backdrop:bg-black/60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
        @click="($event.target === dialog) && dialog?.close()">
        <div class="flex items-start justify-between gap-3">
          <h2 id="support-title" class="text-base font-semibold">{{ t('supportDeveloper') }}</h2>
          <button type="button" class="rounded-lg p-1 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('closeDialog')" @click="dialog?.close()">
            <Icon name="lucide:x" size="18" />
          </button>
        </div>
        <p class="mt-3 text-sm text-surface-500">{{ t('supportDescription') }}</p>
        <img :src="qrCode" :alt="t('supportDeveloper') + ' — DonationAlerts QR'" width="240" height="240" class="mx-auto my-5 h-60 w-60 max-w-full rounded-xl bg-white">
        <a :href="donationUrl" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700" @click="openDonation">
          <Icon name="lucide:external-link" size="16" />{{ t('openDonation') }}
        </a>
        <p v-if="openError" role="alert" class="mt-2 text-xs text-rose-500">{{ openError }}</p>
        <p class="mt-3 break-all text-center text-xs text-surface-500">{{ donationUrl }}</p>
      </dialog>
    </Teleport>
  </div>
</template>
