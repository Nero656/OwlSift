import type { LanguageKey } from './useLanguage'
import { getScanErrorKey } from '../utils/scanMessages'
import type { DocumentScanRequest, DocumentScanStatus } from '../../src/types/documentScan'

let browserScan: AbortController | undefined
let refreshInFlight: Promise<void> | undefined

export function useDocumentScanActivity() {
  const status = useState<DocumentScanStatus | null>('document-scan-status', () => null)
  const startingOrRunning = useState('documents-scanning', () => false)
  const isScanning = computed(() => startingOrRunning.value || status.value?.running === true)
  return { status, startingOrRunning, isScanning }
}

export function useDocumentScan() {
  const { addFolder, loadIndex } = useFiles()
  const { settings } = useSettings()
  const { t, formatNumber } = useLanguage()
  const toast = useToast()
  const { status, startingOrRunning, isScanning } = useDocumentScanActivity()
  const completedScanCount = useState('document-completed-scan-count', () => 0)
  const isStopping = useState('documents-scan-stopping', () => false)
  const outcome = useState<{ indexedCount: number; skippedCount: number; stopped: boolean } | null>('document-scan-outcome', () => null)
  const errorKey = useState<LanguageKey | null>('document-scan-error-key', () => null)
  const error = computed(() => errorKey.value ? t(errorKey.value) : '')
  const summaryFor = (result: { indexedCount: number; skippedCount: number }) =>
    t('osDocumentsUpdated') + ' ' + formatNumber(result.indexedCount) + ' · ' + t('scanDocumentsSkipped') + ' ' + formatNumber(result.skippedCount)
  const notice = computed(() => {
    const result = outcome.value
    if (!result) return ''
    return result.stopped ? t('scanStopped') + ' ' + summaryFor(result) : summaryFor(result)
  })
  const lastRunningStatus = useState<DocumentScanStatus | null>('document-scan-last-running', () => null)
  const scanProgress = computed(() => isScanning.value ? lastRunningStatus.value : null)
  const resumableScan = computed(() => status.value?.resumable ? status.value : null)
  const percentage = computed(() => {
    const scan = scanProgress.value
    if (scan?.scanTotal == null) return null
    if (scan.scanTotal === 0) return 100
    return Math.floor(100 * scan.scanProcessed / scan.scanTotal)
  })

  function refreshScanStatus(): Promise<void> {
    if (!window.electron) return Promise.resolve()
    refreshInFlight ??= window.electron.invoke('files:document-scan-status')
      .then(value => {
        status.value = value
        if (value?.running) lastRunningStatus.value = value
      })
      .catch(cause => { console.error('Could not load scan progress:', cause) })
      .finally(() => { refreshInFlight = undefined })
    return refreshInFlight
  }

  async function startScan(request: DocumentScanRequest) {
    if (isScanning.value) return
    startingOrRunning.value = true
    isStopping.value = false
    outcome.value = null
    errorKey.value = null
    lastRunningStatus.value = null
    try {
      let result
      if (window.electron) {
        await window.electron.invoke('files:set-system-visibility', settings.value.showSystemFiles)
        if (isStopping.value) { outcome.value = { indexedCount: 0, skippedCount: 0, stopped: true }; return }
        result = await window.electron.invoke('files:scan-os-documents', request)
      } else {
        browserScan = new AbortController()
        result = await addFolder({ extensions: request.extensions, signal: browserScan.signal })
      }
      if (result) {
        const stopped = 'cancelled' in result && result.cancelled
        if (window.electron && !stopped) {
          try { await loadIndex() }
          catch (cause) {
            console.error('Could not reload the scan results:', cause)
            errorKey.value = 'documentsLoadError'
          }
        }
        outcome.value = { indexedCount: result.indexedCount, skippedCount: result.skippedCount, stopped }
        if (!stopped && !errorKey.value) {
          completedScanCount.value++
          toast.add({ title: t('scanComplete'), description: summaryFor(result), color: 'success', icon: 'lucide:circle-check' })
        }
      }
    } catch (cause) {
      console.error('Could not scan documents:', cause)
      errorKey.value = getScanErrorKey(cause)
    } finally {
      // Discard an in-flight poll before asking for the final checkpoint.
      await refreshInFlight
      await refreshScanStatus()
      browserScan = undefined
      startingOrRunning.value = false
      isStopping.value = false
    }
  }

  async function stopScan() {
    if (!isScanning.value || isStopping.value) return
    isStopping.value = true
    browserScan?.abort()
    if (!window.electron) return
    try { await window.electron.invoke('files:stop-document-scan') }
    catch (cause) {
      console.error('Could not stop document scan:', cause)
      errorKey.value = 'scanStopError'
      isStopping.value = false
    }
  }

  return { isScanning, completedScanCount, isStopping, scanProgress, resumableScan, percentage, notice, error, startScan, stopScan, refreshScanStatus }
}
