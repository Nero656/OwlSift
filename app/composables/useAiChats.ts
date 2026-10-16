import type { Ref } from 'vue'
import type { ChatMessage } from '~/types/file'
import { contextKey } from '~/utils/aiContext'

interface ChatSession { paths: string[]; createdAt: number }
export interface AiChatListItem { key: string; title: string; preview: string; fileCount: number; updatedAt: number }
const sessionStorageKey = 'owlsift-chat-sessions'
const pathsFromKey = (key: string): string[] => {
  if (key.startsWith('file:')) return [key.slice(5)]
  if (key.startsWith('group:')) {
    try { const paths: unknown = JSON.parse(key.slice(6)); return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [] } catch { return [] }
  }
  return []
}
const samePaths = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

export function useAiChats(attachedIds: Ref<number[]>) {
  const { files } = useFiles()
  const { t } = useLanguage()
  const conversations = useState<Record<string, ChatMessage[]>>('ai-conversations', () => ({}))
  const sessions = useState<Record<string, ChatSession>>('ai-chat-sessions', () => ({}))
  const activeChatId = useState<string | null>('ai-active-chat', () => null)
  const loaded = useState('ai-chat-sessions-loaded', () => false)
  let restoring = false
  if (import.meta.client && !loaded.value) {
    try {
      const stored = JSON.parse(localStorage.getItem(sessionStorageKey) ?? '{}')
      if (stored && typeof stored === 'object' && stored.sessions && typeof stored.sessions === 'object') {
        for (const [key, value] of Object.entries(stored.sessions)) {
          const session = value as Partial<ChatSession> | null
          if ((key === 'general' || /^(chat|file|group):/.test(key)) && session && Array.isArray(session.paths) && session.paths.every(path => typeof path === 'string') && Number.isFinite(session.createdAt)) {
            sessions.value[key] = { paths: session.paths, createdAt: session.createdAt! }
          }
        }
      }
      if (typeof stored?.activeChatId === 'string' && Object.hasOwn(sessions.value, stored.activeChatId)) activeChatId.value = stored.activeChatId
    } catch { /* Existing message histories remain available if session metadata is invalid. */ }
    loaded.value = true
  }
  const getSession = (key: string): ChatSession => Object.hasOwn(sessions.value, key) ? sessions.value[key]! : { paths: pathsFromKey(key), createdAt: 0 }
  const restoreAttachments = (key: string) => {
    restoring = true
    attachedIds.value = files.value.filter(file => getSession(key).paths.includes(file.path)).map(file => file.id)
    restoring = false
  }
  const selectChat = (key: string) => {
    if (!Object.hasOwn(sessions.value, key) && !Object.hasOwn(conversations.value, key)) return
    if (!Object.hasOwn(sessions.value, key)) sessions.value[key] = getSession(key)
    activeChatId.value = key
    restoreAttachments(key)
  }
  const newChat = () => {
    const id = 'chat:' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
    sessions.value[id] = { paths: [], createdAt: Date.now() }
    activeChatId.value = id
    restoring = true
    attachedIds.value = []
    restoring = false
    return id
  }
  // Preserve an explicit document selection supplied by the workspace page.
  const incoming = files.value.filter(file => attachedIds.value.includes(file.id))
  if (incoming.length && (!activeChatId.value || !samePaths(getSession(activeChatId.value).paths, incoming.map(file => file.path)))) {
    activeChatId.value = contextKey(incoming)
    sessions.value[activeChatId.value] = { paths: incoming.map(file => file.path), createdAt: Date.now() }
  }
  if (!activeChatId.value) activeChatId.value = 'general'
  if (!Object.hasOwn(sessions.value, activeChatId.value)) sessions.value[activeChatId.value] = getSession(activeChatId.value)
  if (!incoming.length) restoreAttachments(activeChatId.value)

  watch(attachedIds, () => {
    if (restoring || !activeChatId.value) return
    const current = getSession(activeChatId.value)
    sessions.value[activeChatId.value] = { ...current, paths: files.value.filter(file => attachedIds.value.includes(file.id)).map(file => file.path) }
  }, { flush: 'sync' })
  watch(files, () => { if (activeChatId.value) restoreAttachments(activeChatId.value) })
  watch([sessions, activeChatId], () => {
    if (!import.meta.client || !loaded.value) return
    try { localStorage.setItem(sessionStorageKey, JSON.stringify({ sessions: sessions.value, activeChatId: activeChatId.value })) } catch { /* Retain sessions in memory when storage is full. */ }
  }, { deep: true, immediate: true })

  const chats = computed<AiChatListItem[]>(() => [...new Set([...Object.keys(conversations.value), ...Object.keys(sessions.value)])].map(key => {
    const messages = conversations.value[key] ?? []
    const session = getSession(key)
    const firstQuestion = messages.find(message => message.sender === 'user')?.text
    const names = session.paths.map(path => path.replace(/\\/g, '/').split('/').pop()).filter(Boolean).join(', ')
    const preview = messages.at(-1)?.text.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || names || t('emptyChat')
    return {
      key, title: firstQuestion?.replace(/\s+/g, ' ').trim().slice(0, 70) || names || (key === 'general' ? t('generalChat') : t('newChat')),
      preview, fileCount: session.paths.length,
      updatedAt: messages.at(-1)?.createdAt ?? session.createdAt,
    }
  }).sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key)))
  return { activeChatId, chats, newChat, selectChat }
}
