
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import fontUrl from '~/assets/fonts/DejaVuSans.ttf?url'

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export async function createDocumentBlob(extension: string, text: string, mime: string): Promise<Blob> {
  if (extension === 'docx') {
    const paragraphs = text.split('\n').map(line => '<w:p><w:r><w:t xml:space="preserve">' + xml(line) + '</w:t></w:r></w:p>').join('')
    const data = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'),
    })
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: mime })
  }
  if (extension === 'odt') {
    const data = zipSync({
      mimetype: [strToU8(mime), { level: 0 }],
      'META-INF/manifest.xml': strToU8('<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'),
      'content.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text>' + text.split('\n').map(line => '<text:p>' + xml(line) + '</text:p>').join('') + '</office:text></office:body></office:document-content>'),
    })
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: mime })
  }
  if (extension === 'pdf') {
    const { PDFDocument } = await import('pdf-lib')
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const response = await fetch(fontUrl)
    if (!response.ok) throw new Error('Could not load PDF font')
    const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true })
    const supported = new Set(font.getCharacterSet())
    const printable = Array.from(text).map(char => char === '\n' || supported.has(char.codePointAt(0)!) ? char : ' ').join('')
    let page = pdf.addPage([595.28, 841.89]), y = 790
    for (const paragraph of printable.split('\n')) {
      let line = ''
      const draw = () => {
        if (y < 50) { page = pdf.addPage([595.28, 841.89]); y = 790 }
        page.drawText(line, { x: 50, y, font, size: 11 })
        y -= 17
        line = ''
      }
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(line + char, 11) > 495) draw()
        line += char
      }
      draw()
    }
    return new Blob([await pdf.save() as Uint8Array<ArrayBuffer>], { type: mime })
  }
  if (extension === 'rtf') {
    let body = ''
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i), char = text[i]
      body += char === '\n' ? '\\par\n' : code > 127 ? '\\u' + (code > 32767 ? code - 65536 : code) + '?' : ['\\', '{', '}'].includes(char!) ? '\\' + char : char
    }
    return new Blob(['{\\rtf1\\ansi\\deff0\\uc1 ' + body + '}'], { type: mime })
  }
  return new Blob([text], { type: mime })
}

export async function extractDocumentText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'docx' || ext === 'odt') {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: item => item.name === (ext === 'docx' ? 'word/document.xml' : 'content.xml') && item.originalSize < 10 * 1024 * 1024 })
    const bytes = archive[ext === 'docx' ? 'word/document.xml' : 'content.xml']
    if (!bytes) throw new Error('Document text not found')
    const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml')
    return Array.from(doc.getElementsByTagNameNS('*', 'p')).map(node => node.textContent).join('\n').slice(0, 120000)
  }
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const document = await task.promise
    try {
      let text = ''
      for (let i = 1; i <= Math.min(document.numPages, 100) && text.length < 120000; i++) {
        const content = await (await document.getPage(i)).getTextContent()
        text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n'
      }
      return text.slice(0, 120000)
    } finally { await task.destroy() }
  }
  return await file.text()
}

export async function storeDocumentBlob(path: string, blob?: Blob): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('localmind-documents', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('blobs')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('blobs', blob ? 'readwrite' : 'readonly')
      const operation = blob ? tx.objectStore('blobs').put(blob, path) : tx.objectStore('blobs').get(path)
      let result: Blob | undefined
      operation.onsuccess = () => { result = blob ?? operation.result }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}

export async function removeDocumentBlob(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('localmind-documents', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('blobs')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('blobs', 'readwrite')
      tx.objectStore('blobs').delete(path)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}
