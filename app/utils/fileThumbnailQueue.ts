// A page of image cards can enter the viewport at once. Limit reads and IPC payloads.
let active = 0
const waiting: Array<() => void> = []
const maxConcurrent = 3

export async function readFileThumbnail(fileId: number, isCurrent: () => boolean) {
  if (active >= maxConcurrent) await new Promise<void>(resolve => waiting.push(resolve))
  else active++
  try {
    if (isCurrent()) return await window.electron.invoke('files:get-image-preview', fileId)
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}
