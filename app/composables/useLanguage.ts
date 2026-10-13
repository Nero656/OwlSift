import { onMounted } from 'vue'

export type AppLanguage = 'ru' | 'en'

const messages = {
  en: {
    search: 'Search & Index', workspaces: 'Workspaces', aiAssistant: 'AI Assistant', notesTags: 'Notes & Tags', settings: 'Settings',
    searchPlaceholder: 'Search filenames, full content, or AI tags...', indexed: 'Indexed', files: 'files', addFolder: 'Add Folder',
    language: 'Language', languageDescription: 'Choose the language used across the application.', russian: 'Русский', english: 'English',
    noMatchingFiles: 'No matching files found', adjustQuery: 'Try adjusting your query or resetting format filters.', aiSummary: 'AI Summary',
    sqliteConnected: 'Connected', sqliteDisconnected: 'Disconnected', sqliteChecking: 'Checking…', sqliteUnavailable: 'Unavailable',
    indexedFiles: 'indexed files', fts5Ready: 'ready', fts5Unavailable: 'unavailable', desktopOnly: 'Available in the desktop application',
    dbUnavailable: 'Database connection is unavailable', checkingDb: 'Checking database connection…',
    localRag: 'Local RAG Context', file: 'File', selectFile: 'Select a file from the search results to start AI analysis.',
    summaryNotes: 'Summary & Notes', suggestedActions: 'Suggested Actions', promptTerms: 'Summarize key contract terms',
    promptPrices: 'Find prices and payment deadlines', promptTakeaways: 'What are the main takeaways?', analyzing: 'Analyzing document vector context...',
    askFile: 'Ask a question about this file...', selectFileToAsk: 'Select a file to ask questions...', executiveSummary: 'Executive Summary',
    generateSummary: 'Click "AI Summary" to generate a breakdown of this file.', attachedNote: 'Attached Note', addNote: 'Add personal notes or annotations for this document...',
    fileTags: 'File Tags', addTag: 'Add Tag', noActiveFile: 'No active file selected.',
    sortLabel: 'Sort', sortRelevance: 'Relevance', sortDate: 'Date', sortName: 'Name', sortTag: 'Tag',
    filterTag: 'Tag filter', allTags: 'All tags', listView: 'List', gridView: 'Grid', openFolder: 'Open folder', noIndexedFolders: 'No indexed folders yet. Add a folder to start indexing.',
    tagPlaceholder: 'Enter a tag', saveTag: 'Add', cancel: 'Cancel', tagError: 'Could not save this tag.',
    notesTitle: 'Notes & Tags', notesDescription: 'Keep notes and organize indexed files with tags.', notesSearch: 'Search files, notes, and tags...',
    notesEmpty: 'No indexed files yet. Add a folder to get started.', notesNoMatch: 'No files match your search.', notesSelectFile: 'Select a file to view its note and tags.',
    notePlaceholder: 'Write a note about this file...', removeTag: 'Remove tag', noteSaveError: 'Could not save the note.',
    hidePreview: 'Hide file preview', showPreview: 'Show file preview', collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar',
    openFile: 'Open file', deleteFile: 'Delete file', deleteDialogTitle: 'Delete file?', deleteDialogMessage: 'Choose how you want to remove this file.',
    showInFolder: 'Show in folder',
    deleteMode: 'Delete method', moveToTrash: 'Move to Trash', deletePermanently: 'Delete permanently', confirmDelete: 'Delete', permanentDeleteWarning: 'This permanently deletes the file from disk and cannot be undone.',
    fileOpenError: 'Could not open the file.', fileLocationError: 'Could not show the file in its folder.', fileDeleteError: 'Could not delete the file.',
  },
  ru: {
    search: 'Поиск и индекс', workspaces: 'Рабочие папки', aiAssistant: 'ИИ-ассистент', notesTags: 'Заметки и теги', settings: 'Настройки',
    searchPlaceholder: 'Поиск по именам, содержимому и тегам ИИ...', indexed: 'В индексе', files: 'файлов', addFolder: 'Добавить папку',
    language: 'Язык', languageDescription: 'Выберите язык интерфейса приложения.', russian: 'Русский', english: 'Английский',
    noMatchingFiles: 'Файлы не найдены', adjustQuery: 'Измените запрос или сбросьте фильтры формата.', aiSummary: 'Краткое содержание ИИ',
    sqliteConnected: 'Подключена', sqliteDisconnected: 'Нет подключения', sqliteChecking: 'Проверка…', sqliteUnavailable: 'Недоступна',
    indexedFiles: 'файлов в индексе', fts5Ready: 'готов', fts5Unavailable: 'недоступен', desktopOnly: 'Доступно в настольном приложении',
    dbUnavailable: 'Нет подключения к базе данных', checkingDb: 'Проверка подключения к базе данных…',
    localRag: 'Локальный контекст RAG', file: 'Файл', selectFile: 'Выберите файл из результатов поиска, чтобы начать анализ.',
    summaryNotes: 'Содержание и заметки', suggestedActions: 'Примеры запросов', promptTerms: 'Ключевые условия договора',
    promptPrices: 'Цены и сроки оплаты', promptTakeaways: 'Главные выводы документа', analyzing: 'Анализ контекста документа…',
    askFile: 'Задайте вопрос по этому файлу...', selectFileToAsk: 'Сначала выберите файл...', executiveSummary: 'Краткое содержание',
    generateSummary: 'Нажмите «Краткое содержание ИИ», чтобы получить обзор файла.', attachedNote: 'Заметка', addNote: 'Добавьте заметку к документу...',
    fileTags: 'Теги файла', addTag: 'Добавить тег', noActiveFile: 'Файл не выбран.',
    sortLabel: 'Сортировка', sortRelevance: 'По релевантности', sortDate: 'По дате', sortName: 'По имени', sortTag: 'По тегу',
    filterTag: 'Фильтр по тегу', allTags: 'Все теги', listView: 'Список', gridView: 'Сетка', openFolder: 'Открыть папку', noIndexedFolders: 'Нет проиндексированных папок. Добавьте папку, чтобы начать индексирование.',
    tagPlaceholder: 'Введите тег', saveTag: 'Добавить', cancel: 'Отмена', tagError: 'Не удалось сохранить тег.',
    notesTitle: 'Заметки и теги', notesDescription: 'Добавляйте заметки и упорядочивайте файлы с помощью тегов.', notesSearch: 'Поиск по файлам, заметкам и тегам...',
    notesEmpty: 'Файлов в индексе пока нет. Добавьте папку, чтобы начать.', notesNoMatch: 'По вашему запросу ничего не найдено.', notesSelectFile: 'Выберите файл, чтобы увидеть заметку и теги.',
    notePlaceholder: 'Оставьте заметку об этом файле...', removeTag: 'Удалить тег', noteSaveError: 'Не удалось сохранить заметку.',
    hidePreview: 'Скрыть предпросмотр файла', showPreview: 'Показать предпросмотр файла', collapseSidebar: 'Свернуть боковую панель', expandSidebar: 'Развернуть боковую панель',
    openFile: 'Открыть файл', deleteFile: 'Удалить файл', deleteDialogTitle: 'Удалить файл?', deleteDialogMessage: 'Выберите, как удалить этот файл.',
    showInFolder: 'Показать в папке',
    deleteMode: 'Способ удаления', moveToTrash: 'Переместить в корзину', deletePermanently: 'Удалить полностью', confirmDelete: 'Удалить', permanentDeleteWarning: 'Файл будет удалён с диска без возможности восстановления.',
    fileOpenError: 'Не удалось открыть файл.', fileLocationError: 'Не удалось показать файл в папке.', fileDeleteError: 'Не удалось удалить файл.',
  },
} as const

export type LanguageKey = keyof typeof messages.en

export function useLanguage() {
  const language = useState<AppLanguage>('app-language', () => 'en')

  onMounted(() => {
    const saved = localStorage.getItem('app-language')
    if (saved === 'ru' || saved === 'en') language.value = saved
    document.documentElement.lang = language.value
  })

  const setLanguage = (value: AppLanguage) => {
    language.value = value
    localStorage.setItem('app-language', value)
    document.documentElement.lang = value
  }

  const t = (key: LanguageKey) => messages[language.value][key]

  return { language, setLanguage, t }
}
