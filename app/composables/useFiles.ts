import type {
    ChatMessage,
    IndexedFolder,
    LocalFile
} from '../types/file'

export const useFiles = () => {
    const files = useState<LocalFile[]>('files', () => [
        {
            id: 1,
            name: 'Service_Level_Agreement_2026.pdf',
            path: '/Users/alex/Documents/Contracts/Service_Level_Agreement_2026.pdf',
            extension: 'pdf',
            size: '2.4 MB',
            mtime: '2026-03-12',
            tags: ['contracts', 'finance', '2026'],
            snippet:
                'The total agreed contract sum is $45,000 payable across three milestones with a hard completion deadline of December 15, 2026.',
            summary:
                'Formal SLA outlining payment terms ($45k in 3 milestones) and final project delivery deadline for Q4 2026.',
            note: 'Verify milestone #2 with finance team.'
        },

        {
            id: 2,
            name: 'System_Architecture_LocalMind.md',
            path: '/Users/alex/Projects/LocalMind/docs/System_Architecture_LocalMind.md',
            extension: 'md',
            size: '142 KB',
            mtime: '2026-04-01',
            tags: ['architecture', 'electron', 'nuxt'],
            snippet:
                'SQLite FTS5 engine handles initial tokenization with unicode61 tokenizer while local Ollama instance processes semantic embeddings.',
            summary:
                'Technical design document detailing Electron IPC bridge, SQLite FTS5 configuration, and Nuxt 3 frontend setup.',
            note: 'Need to optimize Worker Thread memory limits.'
        },

        {
            id: 3,
            name: 'Q1_Financial_Report_Final.docx',
            path: '/Users/alex/Documents/Finance/Q1_Financial_Report_Final.docx',
            extension: 'docx',
            size: '1.1 MB',
            mtime: '2026-03-28',
            tags: ['finance', 'report'],
            snippet:
                'Q1 net profit increased by 18% year-over-year. Key cost drivers include cloud infrastructure and software licenses.',
            summary:
                'Quarterly financial analysis showing positive profit growth despite increased operational overhead.',
            note: ''
        },

        {
            id: 4,
            name: 'Meeting_Notes_Client_Kickoff.txt',
            path: '/Users/alex/Documents/Notes/Meeting_Notes_Client_Kickoff.txt',
            extension: 'txt',
            size: '18 KB',
            mtime: '2026-02-14',
            tags: ['meeting', 'client'],
            snippet:
                'Client requested strict offline compliance. All sensitive note processing must remain strictly on-device without cloud API dependency.',
            summary:
                'Kickoff notes emphasizing offline security requirements and local LLM execution.',
            note: ''
        },

        {
            id: 5,
            name: 'Invoice_Scan_Vendor_982.png',
            path: '/Users/alex/Downloads/Invoice_Scan_Vendor_982.png',
            extension: 'png',
            size: '3.8 MB',
            mtime: '2026-01-20',
            tags: ['ocr', 'invoice'],
            snippet:
                'OCR Extraction: Total Due: $1,250.00 | Vendor: Apex Hardware Ltd | Status: Pending Approval',
            summary:
                'Scanned image invoice processed via local Tesseract OCR.',
            note: ''
        }
    ])

    const folders = ref<IndexedFolder[]>([
        {
            name: 'Documents',
            path: '/Users/alex/Documents',
            count: 840
        },
        {
            name: 'Projects & Contracts',
            path: '/Users/alex/Projects',
            count: 320
        },
        {
            name: 'Downloads Archive',
            path: '/Users/alex/Downloads',
            count: 260
        }
    ])

    const searchQuery = ref('')
    const selectedType = ref<string | null>(null)
    const selectedFolder = ref<string | null>(null)
    const sortBy = ref('relevance')

    const activeFile = ref<LocalFile | null>(files.value[0] ?? null)

    const filteredFiles = computed(() => {
        const query = searchQuery.value
            .toLowerCase()
            .trim()

        const result = files.value.filter((file) => {
            const matchesQuery =
                !query ||
                file.name.toLowerCase().includes(query) ||
                file.snippet.toLowerCase().includes(query) ||
                file.tags.some(tag =>
                    tag.toLowerCase().includes(query)
                )

            const matchesType =
                !selectedType.value ||
                file.extension === selectedType.value

            const matchesFolder =
                !selectedFolder.value ||
                file.path.includes(selectedFolder.value)

            return matchesQuery && matchesType && matchesFolder
        })

        return [...result].sort((a, b) => {
            switch (sortBy.value) {
                case 'date':
                    return (
                        new Date(b.mtime).getTime() -
                        new Date(a.mtime).getTime()
                    )

                case 'name':
                    return a.name.localeCompare(b.name)

                default:
                    return 0
            }
        })
    })

    const selectFile = (file: LocalFile) => {
        activeFile.value = file
    }

    const getFileTypeCount = (extension: string) => {
        return files.value.filter(
            file => file.extension === extension
        ).length
    }

    return {
        files,
        folders,

        searchQuery,
        selectedType,
        selectedFolder,
        sortBy,

        activeFile,
        filteredFiles,

        selectFile,
        getFileTypeCount
    }
}