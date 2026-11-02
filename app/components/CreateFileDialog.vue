<script setup lang="ts">
import { creatableFileTypes, defaultFileTemplate } from '~/composables/useFileTypes'

const { folders, isCreateFileOpen, fileDialogFolder, createBrowserFile, createVirtualFolder, selectFile } = useFiles()
const { t } = useLanguage()

const fileName = ref('untitled')
const fileType = ref('md')
const content = ref(defaultFileTemplate('md', 'untitled'))
const targetPath = ref<string | null>(null)
const error = ref('')
const isSaving = ref(false)
const customContent = ref(false)

watch(isCreateFileOpen, (open) => {
  if (!open) return
  error.value = ''
  isSaving.value = false
  customContent.value = false
  fileName.value = 'untitled'
  fileType.value = 'md'
  content.value = defaultFileTemplate('md', 'untitled')
  targetPath.value = fileDialogFolder.value ?? folders.value[0]?.path ?? null
})

watch([fileName, fileType], () => {
  if (!customContent.value) content.value = defaultFileTemplate(fileType.value, fileName.value || 'untitled')
})

const close = () => {
  if (!isSaving.value) isCreateFileOpen.value = false
}

const submit = async () => {
  if (isSaving.value) return
  isSaving.value = true
  error.value = ''
  try {
    let folderPath = targetPath.value
    if (!folderPath) {
      const folder = createVirtualFolder('Workspace')
      folderPath = folder.path
    }
    const file = await createBrowserFile(fileName.value, fileType.value, content.value, folderPath)
    if (file) selectFile(file)
    isCreateFileOpen.value = false
  } catch (reason) {
    console.error('Could not create file:', reason)
    error.value = t('fileCreateError')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isCreateFileOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/60 p-4 backdrop-blur-sm"
      @click.self="close"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-file-title"
        class="max-h-[90vh] overflow-y-auto w-full max-w-lg rounded-2xl border border-surface-200 bg-white p-5 shadow-2xl dark:border-surface-700 dark:bg-surface-900"
      >
        <h2 id="create-file-title" class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('createFileTitle') }}</h2>

        <label class="mt-4 block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('targetFolder') }}
          <AppDropdown v-model="targetPath" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" :placeholder="t('noFoldersHint')" class="mt-1 w-full" />
        </label>

        <label class="mt-3 block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileName') }}
          <input v-model="fileName" class="mt-1 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800">
        </label>

        <fieldset class="mt-4">
          <legend class="text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileType') }}</legend>
          <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            <button
              v-for="type in creatableFileTypes"
              :key="type.extension"
              type="button"
              class="rounded-xl border px-2 py-2 text-xs transition"
              :class="fileType === type.extension ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-surface-200 text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800'"
              @click="fileType = type.extension"
            >
              <span class="block font-semibold">.{{ type.extension }}</span>
              <span class="mt-0.5 block text-[10px] opacity-70">{{ type.label }}</span>
            </button>
          </div>
        </fieldset>

        <label class="mt-4 block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileContent') }}
          <textarea
            v-model="content"
            rows="6"
            class="mt-1 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-xs dark:border-surface-700 dark:bg-surface-800"
            @input="customContent = true"
          />
        </label>

        <p v-if="error" class="mt-3 text-xs text-rose-500" role="alert">{{ error }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-surface-200 px-3.5 py-2 text-xs text-surface-600 dark:border-surface-700 dark:text-surface-300" :disabled="isSaving" @click="close">{{ t('cancel') }}</button>
          <button type="button" class="rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="isSaving || !fileName.trim()" @click="submit">{{ t('create') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
