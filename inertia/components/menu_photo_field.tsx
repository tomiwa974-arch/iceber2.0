import AsyncButton from '~/components/async_button'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, ImageOff, LoaderCircle, Trash2 } from 'lucide-react'
import { prepareMenuPhoto } from '~/lib/menu_photo'

type Props = {
  label?: string
  value: string
  onChange: (image: string) => void
  onBusyChange: (busy: boolean) => void
}

export default function MenuPhotoField({
  label = 'Menu photo',
  value,
  onChange,
  onBusyChange,
}: Props) {
  const id = useId()
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failedSource, setFailedSource] = useState<string | null>(null)

  useEffect(
    () => () => {
      pending.current?.abort()
      onBusyChange(false)
    },
    [onBusyChange]
  )

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    onBusyChange(true)
    setError('')
    try {
      const image = await prepareMenuPhoto(file, controller.signal)
      if (controller.signal.aborted) return
      setFailedSource(null)
      onChange(image)
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Could not prepare the photo. Try again.')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
        onBusyChange(false)
      }
    }
  }

  return (
    <div className="ad-wide ad-menu-photo">
      <span className="ad-photo-title">{label}</span>
      <div className="ad-photo-preview">
        {value && failedSource !== value ? (
          <img src={value} alt="Item photo preview" onError={() => setFailedSource(value)} />
        ) : (
          <div className="ad-photo-empty">
            {value ? <ImageOff size={28} /> : <ImagePlus size={28} />}
            <p>{value ? 'This photo could not be displayed.' : 'Add a photo of this item'}</p>
          </div>
        )}
        {value && (
          <AsyncButton
            pending={Boolean(busy)}
            type="button"
            className="ad-secondary ad-photo-remove"
            disabled={busy}
            onClick={() => {
              onChange('')
              setError('')
            }}
          >
            <Trash2 size={15} /> Remove photo
          </AsyncButton>
        )}
      </div>
      <label htmlFor={`${id}-file`}>
        <span>{value ? 'Replace photo from your device' : 'Upload photo from your device'}</span>
        <input
          id={`${id}-file`}
          type="file"
          aria-label="Upload photo"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          onChange={choosePhoto}
        />
      </label>
      <p id={`${id}-help`} className="ad-photo-help">
        Only upload photos you own or have permission to use. Keep the licence and any required
        attribution. JPEG, PNG, or WebP, up to 10 MB. Photos are resized and uploaded to the server
        when you save the item.
      </p>
      {busy && (
        <p className="ad-photo-progress" role="status">
          <LoaderCircle size={15} className="ad-photo-spinner" /> Preparing photo…
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ad-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
