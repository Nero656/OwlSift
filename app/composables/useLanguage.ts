import { onMounted } from 'vue'

export type AppLanguage = 'ru' | 'en'

const messages = {
  en: {
    supportDeveloper: 'Support the developer', supportDescription: 'Scan the QR code or open DonationAlerts to support LocalMind.', openDonation: 'Open payment page', closeDialog: 'Close', donationOpenError: 'Could not open the browser. Use the link below.',
    generationPreparing: 'Preparing file context', generationConnecting: 'Sending request to the model', generationWaiting: 'Server connected. Waiting for response', generationProcessing: 'Model is processing the request', generationReceiving: 'Receiving response', generationRetrying: 'Empty response. Retrying', generationProxy: 'Connecting through the application server', generationCharacters: 'characters received',
    dropFiles: 'Drop files here to add them', dropImporting: 'Adding files…', dropAdded: 'Files added:', dropSkipped: 'Skipped (unavailable files or folder limit):', dropDirectories: 'Drop files rather than folders.',
    documentGroup: 'Documents for analysis', addDocuments: 'Add documents', selectedDocuments: 'Selected documents:', allowFileCreation: 'Allow the model to create files', outputFolder: 'Save generated documents to', createdDocuments: 'Created documents', invalidOutput: 'The model returned an invalid document description.', tooManyOutputs: 'The model requested more than 5 output files.', documentImportError: 'Some documents could not be imported.',
    selectDocument: 'Select document', selectPage: 'Select this page', clearSelection: 'Clear selection', analyzeSelection: 'Analyze selected documents', chooseDocuments: 'Choose documents from a folder', attachSelected: 'Attach selected', folderDocuments: 'Folder documents', importFromComputer: 'Import from computer',
    globalAuthError: 'The server rejected the API key (401 / invalid_api_key). Enter a valid key issued by the provider of the configured endpoint. A key from another service will not work.', globalAccessError: 'The server denied access (403). Check the API key permissions and model availability.', globalProviderKeyHint: 'Use a key from the provider of this API address. OpenAI keys work with api.openai.com; keys from another service require that service’s endpoint. Current server:',
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
    generateSummary: 'Click "AI Summary" to generate a breakdown of this file.', summaryPrompt: 'Create a concise summary of this file in the interface language. List the main points, important facts, names, dates, amounts, and conclusions. Do not invent details that are absent from the file.', generatingSummary: 'Generating summary...', regenerateSummary: 'Generate again', cancelRequest: 'Cancel request', askAgain: 'Ask again', attachedNote: 'Attached Note', addNote: 'Add personal notes or annotations for this document...',
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
    removeFromIndex: 'Remove from LocalMind', removeFromIndexTitle: 'Remove from LocalMind?', removeFromIndexMessage: 'The file will be hidden from this app. The original file on disk will remain untouched.',
    removeFolderTitle: 'Remove folder from LocalMind?', removeFolderMessage: 'This folder and its indexed files will be hidden in the app. Nothing will be deleted from disk.',
    folderIndexLimit: 'Current maximum for one indexed folder, including subfolders:', folderLimitReached: 'Folder limit reached. Skipped files:',
    folderFilesIndexed: 'Files indexed:', folderNoFilesIndexed: 'No files were indexed. Check that the folder contains accessible files.', folderIndexError: 'Could not add files. Check the database connection and folder permissions.',
    folderRemoveError: 'Could not remove the folder from LocalMind.',
    folderLimitSetting: 'Maximum files per folder', folderLimitSettingDescription: 'Applies while indexing, including files in subfolders.',
    showingFiles: 'Showing', ofFiles: 'of', perPage: 'Per page', previousPage: 'Previous', nextPage: 'Next', page: 'Page',
    fileOpenError: 'Could not open the file.', fileLocationError: 'Could not show the file in its folder.', fileDeleteError: 'Could not delete the file.',
    interfaceTitle: 'Interface', settingsSaved: 'Settings saved in this browser', resetInterface: 'Reset interface settings',
    theme: 'Theme', darkTheme: 'Dark', lightTheme: 'Light', defaultFileView: 'Default file view',
    compactSidebar: 'Collapse sidebar', compactSidebarDescription: 'Show only navigation icons.',
    showThumbnails: 'Show file thumbnails', showThumbnailsDescription: 'Display image previews on file cards.',
    modelProviderTitle: 'AI model provider', modelProvider: 'Provider', localModelOption: 'Local model (LM Studio)', globalModelOption: 'Global model (OpenAI-compatible API)', globalModelDescription: 'Connect to a hosted OpenAI-compatible API.', apiKey: 'API key', globalApiHint: 'The API key is saved in this browser. Prompts and attached file context are sent to the configured endpoint. The endpoint must allow browser requests (CORS).',
    localModelTitle: 'Local AI model', localModelDescription: 'Connect to the LM Studio local server running on this computer.',
    modelEndpoint: 'Server address', connectLmStudio: 'Connect to LM Studio', connectToChooseModel: 'Connect first to choose a model.', noModelsFound: 'No models found', connectModelBeforeChat: 'Connect to the model server and choose a model before sending a message.', modelName: 'Model name', selectModel: 'Select a model', systemPrompt: 'System prompt', testConnection: 'Test connection',
    connectionOk: 'Connected. Models found:', connectionFailed: 'Could not reach the model.', pickModel: 'Available models',
    addFile: 'Add file', createFile: 'Create file', createFileTitle: 'Create a file', fileName: 'File name', fileType: 'File type',
    fileContent: 'Initial content', targetFolder: 'Folder', noFoldersHint: 'A workspace folder will be created automatically.',
    fileCreateError: 'Could not create the file.', fileAddError: 'Could not add the file.', create: 'Create',
    aiAssistantTitle: 'AI assistant', aiAssistantDescription: 'Chat with the selected model. Optionally attach an indexed file as context.',
    askAnything: 'Ask the model...', modelDisabled: 'The model is turned off in Settings.',
    modelReady: 'AI model ready', modelNotConfigured: 'Configure a model in Settings.', modelRequestError: 'Could not reach the selected model. Check the endpoint, model name, API key, and CORS settings.', emptyModelResponse: 'The model returned an empty response twice. Try again or increase the generation limit in LM Studio.', globalCreditsError: 'The API account has no credits left. Add credits in your provider billing settings or choose another endpoint.',
    chatModel: 'Model', attachFile: 'File context', noFileContext: 'No file attached', clearChat: 'Clear chat',
    ollamaHint: 'Start Local Server in LM Studio, then connect. Default address: http://127.0.0.1:1234/v1.',
    browserStorage: 'Browser storage', browserIndexReady: 'Files and settings are stored in this browser.',
    addFileToFolder: 'Add one file', writeToDisk: 'Also save a copy through the browser file picker',
    settingsDescription: 'Interface and AI model settings are saved in this browser.',
  },
  ru: {
    supportDeveloper: 'Поддержать разработчика', supportDescription: 'Отсканируйте QR-код или откройте DonationAlerts, чтобы поддержать LocalMind.', openDonation: 'Перейти к оплате', closeDialog: 'Закрыть', donationOpenError: 'Не удалось открыть браузер. Используйте ссылку ниже.',
    generationPreparing: 'Подготовка контекста файла', generationConnecting: 'Отправка запроса модели', generationWaiting: 'Сервер подключён. Ожидание ответа', generationProcessing: 'Модель обрабатывает запрос', generationReceiving: 'Получение ответа', generationRetrying: 'Пустой ответ. Повторный запрос', generationProxy: 'Подключение через сервер приложения', generationCharacters: 'символов получено',
    dropFiles: 'Перетащите файлы сюда для добавления', dropImporting: 'Добавление файлов…', dropAdded: 'Добавлено файлов:', dropSkipped: 'Пропущено (недоступные файлы или лимит папки):', dropDirectories: 'Перетащите файлы, а не папки.',
    documentGroup: 'Документы для анализа', addDocuments: 'Добавить документы', selectedDocuments: 'Выбрано документов:', allowFileCreation: 'Разрешить модели создавать файлы', outputFolder: 'Папка для созданных документов', createdDocuments: 'Созданные документы', invalidOutput: 'Модель вернула некорректное описание документа.', tooManyOutputs: 'Модель запросила создание более 5 файлов.', documentImportError: 'Часть документов не удалось добавить.',
    selectDocument: 'Выбрать документ', selectPage: 'Выбрать на странице', clearSelection: 'Снять выделение', analyzeSelection: 'Анализировать выбранные', chooseDocuments: 'Выбрать документы из папки', attachSelected: 'Прикрепить выбранные', folderDocuments: 'Документы папки', importFromComputer: 'Добавить с компьютера',
    globalAuthError: 'Сервер отклонил API-ключ (401 / invalid_api_key). Укажите действующий ключ провайдера, которому принадлежит адрес API. Ключ от другого сервиса не подойдёт.', globalAccessError: 'Сервер запретил доступ (403). Проверьте права API-ключа и доступность модели.', globalProviderKeyHint: 'Используйте ключ провайдера указанного API. Ключ OpenAI подходит для api.openai.com; для ключа другого сервиса нужен адрес этого сервиса. Текущий сервер:',
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
    generateSummary: 'Нажмите «Краткое содержание ИИ», чтобы получить обзор файла.', summaryPrompt: 'Составь краткое содержание этого файла на русском языке. Перечисли основные мысли, важные факты, имена, даты, суммы и выводы. Не придумывай сведения, которых нет в файле.', generatingSummary: 'Создание краткого содержания...', regenerateSummary: 'Сформировать заново', cancelRequest: 'Отменить запрос', askAgain: 'Задать вопрос заново', attachedNote: 'Заметка', addNote: 'Добавьте заметку к документу...',
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
    removeFromIndex: 'Убрать из LocalMind', removeFromIndexTitle: 'Убрать файл из LocalMind?', removeFromIndexMessage: 'Файл будет скрыт в приложении. Исходный файл на диске останется нетронутым.',
    removeFolderTitle: 'Убрать папку из LocalMind?', removeFolderMessage: 'Папка и проиндексированные файлы будут скрыты в приложении. С диска ничего удалено не будет.',
    folderIndexLimit: 'Текущий максимум для одной папки, включая вложенные папки:', folderLimitReached: 'Достигнут лимит папки. Пропущено файлов:',
    folderFilesIndexed: 'Добавлено файлов:', folderNoFilesIndexed: 'Файлы не добавлены. Проверьте, что в папке есть доступные файлы.', folderIndexError: 'Не удалось добавить файлы. Проверьте подключение к базе и права доступа к папке.',
    folderRemoveError: 'Не удалось убрать папку из LocalMind.',
    folderLimitSetting: 'Максимум файлов в папке', folderLimitSettingDescription: 'Применяется при индексации, включая файлы во вложенных папках.',
    showingFiles: 'Показаны', ofFiles: 'из', perPage: 'На странице', previousPage: 'Назад', nextPage: 'Далее', page: 'Страница',
    fileOpenError: 'Не удалось открыть файл.', fileLocationError: 'Не удалось показать файл в папке.', fileDeleteError: 'Не удалось удалить файл.',
    interfaceTitle: 'Интерфейс', settingsSaved: 'Настройки сохранены в браузере', resetInterface: 'Сбросить настройки интерфейса',
    theme: 'Тема', darkTheme: 'Тёмная', lightTheme: 'Светлая', defaultFileView: 'Вид файлов по умолчанию',
    compactSidebar: 'Сворачивать боковую панель', compactSidebarDescription: 'Показывать только иконки навигации.',
    showThumbnails: 'Показывать миниатюры файлов', showThumbnailsDescription: 'Показывать изображения на карточках графических файлов.',
    modelProviderTitle: 'Провайдер ИИ-модели', modelProvider: 'Провайдер', localModelOption: 'Локальная модель (LM Studio)', globalModelOption: 'Глобальная модель (OpenAI-совместимый API)', globalModelDescription: 'Подключение к удалённому OpenAI-совместимому API.', apiKey: 'API-ключ', globalApiHint: 'API-ключ сохраняется в этом браузере. Запросы и контекст прикреплённых файлов отправляются на указанный адрес. Сервер должен разрешать запросы из браузера (CORS).',
    localModelTitle: 'Локальная ИИ-модель', localModelDescription: 'Подключение к локальному серверу LM Studio на этом компьютере.',
    modelEndpoint: 'Адрес сервера', connectLmStudio: 'Подключиться к LM Studio', connectToChooseModel: 'Сначала подключитесь, чтобы выбрать модель.', noModelsFound: 'Модели не найдены', connectModelBeforeChat: 'Подключитесь к серверу модели и выберите модель перед отправкой сообщения.', modelName: 'Название модели', selectModel: 'Выберите модель', systemPrompt: 'Системная инструкция', testConnection: 'Проверить подключение',
    connectionOk: 'Подключено. Найдены модели:', connectionFailed: 'Не удалось подключиться к модели.', pickModel: 'Доступные модели',
    addFile: 'Добавить файл', createFile: 'Создать файл', createFileTitle: 'Создать файл', fileName: 'Имя файла', fileType: 'Тип файла',
    fileContent: 'Начальное содержимое', targetFolder: 'Папка', noFoldersHint: 'Рабочая папка будет создана автоматически.',
    fileCreateError: 'Не удалось создать файл.', fileAddError: 'Не удалось добавить файл.', create: 'Создать',
    aiAssistantTitle: 'ИИ-ассистент', aiAssistantDescription: 'Чат с выбранной моделью. При желании прикрепите файл из индекса как контекст.',
    askAnything: 'Спросите модель...', modelDisabled: 'Модель выключена в настройках.',
    modelReady: 'ИИ-модель готова', modelNotConfigured: 'Настройте модель в параметрах.', modelRequestError: 'Не удалось подключиться к выбранной модели. Проверьте адрес, название модели, API-ключ и настройки CORS.', emptyModelResponse: 'Модель дважды вернула пустой ответ. Повторите запрос или увеличьте лимит генерации в LM Studio.', globalCreditsError: 'На API-аккаунте закончились кредиты. Пополните баланс у провайдера или выберите другой endpoint.',
    chatModel: 'Модель', attachFile: 'Контекст файла', noFileContext: 'Файл не прикреплён', clearChat: 'Очистить чат',
    ollamaHint: 'Запустите Local Server в LM Studio, затем выполните подключение. Адрес по умолчанию: http://127.0.0.1:1234/v1.',
    browserStorage: 'Хранилище браузера', browserIndexReady: 'Файлы и настройки сохраняются в этом браузере.',
    addFileToFolder: 'Добавить один файл', writeToDisk: 'Также сохранить копию через системный диалог',
    settingsDescription: 'Настройки интерфейса и ИИ-моделей сохраняются в этом браузере.',
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
