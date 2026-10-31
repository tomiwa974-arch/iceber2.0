import AsyncButton from '~/components/async_button'
import { useState } from 'react'

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <AsyncButton
        pending={busy}
        type="button"
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        onClick={async () => {
          if (busy) return
          setBusy(true)
          setMessage('')
          try {
            await navigator.clipboard.writeText(text)
            setMessage('Copied')
          } catch {
            setMessage('Copy unavailable. Select and copy the text below.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {label}
      </AsyncButton>
      <span role="status" className="text-xs">
        {message}
      </span>
      {message.startsWith('Copy unavailable') && (
        <textarea
          aria-label={label}
          readOnly
          value={text}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full border p-2"
        />
      )}
    </span>
  )
}
