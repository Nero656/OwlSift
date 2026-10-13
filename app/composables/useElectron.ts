// app/composables/useElectron.ts
import { computed, ref, onUnmounted } from 'vue'
import type { FileSearchResult } from '~/types/electron'

export function useElectron() {
    const isElectron = computed(() => {
        return typeof window !== 'undefined' && Boolean(window.api)
    })

    const searchFiles = async (query: string): Promise<FileSearchResult[]> => {
        if (!isElectron.value) {
            console.warn('[useElectron] searchFiles вызван вне контекста Electron')
            return []
        }
        return await window.api.searchFiles(query)
    }

    const selectDirectory = async (): Promise<string | null> => {
        if (!isElectron.value) {
            console.warn('[useElectron] selectDirectory вызван вне контекста Electron')
            return null
        }
        return await window.api.selectDirectory()
    }

    const onIndexingProgress = (callback: (progress: number) => void) => {
        if (!isElectron.value) return

        const unsubscribe = window.api.onIndexingProgress(callback)

        onUnmounted(() => {
            unsubscribe()
        })
    }

    return {
        isElectron,
        searchFiles,
        selectDirectory,
        onIndexingProgress
    }
}

export function useFileSearch() {
    const { searchFiles } = useElectron()

    const query = ref('')
    const selectedType = ref('all')
    const selectedFile = ref<any>(null)
    const isDrawerOpen = ref(false)
    const filteredFiles = ref<FileSearchResult[]>([])

    async function handleSearch() {
        filteredFiles.value = await searchFiles(query.value)
    }

    function openAiDrawer(file: any) {
        selectedFile.value = file
        isDrawerOpen.value = true
    }

    return {
        query,
        selectedType,
        selectedFile,
        isDrawerOpen,
        filteredFiles,
        openAiDrawer,
        handleSearch
    }
}