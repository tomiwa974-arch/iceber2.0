const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxFileBytes = 10 * 1024 * 1024
const maxStoredLength = 750_000

const abortError = () => new DOMException('Photo processing cancelled.', 'AbortError')

function readPhoto(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const reader = new FileReader()
    const abort = () => reader.abort()
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    reader.onload = () => {
      cleanup()
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('This photo could not be read. Please choose another file.'))
    }
    reader.onerror = () => {
      cleanup()
      reject(new Error('This photo could not be read. Please choose another file.'))
    }
    reader.onabort = () => {
      cleanup()
      reject(abortError())
    }
    reader.readAsDataURL(file)
  })
}

function decodePhoto(source: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const photo = new Image()
    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      photo.onload = null
      photo.onerror = null
    }
    const abort = () => {
      cleanup()
      photo.src = ''
      reject(abortError())
    }
    signal.addEventListener('abort', abort, { once: true })
    photo.onload = () => {
      cleanup()
      resolve(photo)
    }
    photo.onerror = () => {
      cleanup()
      reject(new Error('This file is not a readable photo. Try a JPEG, PNG, or WebP image.'))
    }
    photo.src = source
  })
}

/** Resize menu photos before upload to reduce bandwidth and disk usage. */
export async function prepareMenuPhoto(file: File, signal: AbortSignal): Promise<string> {
  if (!acceptedTypes.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo.')
  }
  if (file.size > maxFileBytes) {
    throw new Error('This photo is larger than 10 MB. Choose a smaller file and try again.')
  }
  const source = await readPhoto(file, signal)
  const photo = await decodePhoto(source, signal)
  if (!photo.naturalWidth || !photo.naturalHeight) {
    throw new Error('This photo has no usable image dimensions. Please choose another file.')
  }
  if (photo.naturalWidth * photo.naturalHeight > 40_000_000) {
    throw new Error('This photo is too large to process. Resize it below 40 megapixels first.')
  }
  if (signal.aborted) throw abortError()

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Your browser could not prepare this photo. Try another photo or browser.')

  try {
    for (const maxEdge of [1600, 1280, 1024]) {
      const scale = Math.min(1, maxEdge / Math.max(photo.naturalWidth, photo.naturalHeight))
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale))
      context.drawImage(photo, 0, 0, canvas.width, canvas.height)
      const encoded = canvas.toDataURL('image/webp', 0.85)
      if (encoded.startsWith('data:image/') && encoded.length <= maxStoredLength) return encoded
    }
  } catch {
    throw new Error('Your browser could not prepare this photo. Try another photo or browser.')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
  throw new Error(
    'This photo is still too large after resizing. Choose a simpler or smaller image.'
  )
}
