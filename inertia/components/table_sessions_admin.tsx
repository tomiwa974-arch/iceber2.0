import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import { useEffect, useState } from 'react'
import { apiRequest } from '~/lib/restaurant_store'
import CopyButton from '~/components/copy_button'
type Table = { id: string; name: string; code: string | null; expires: number | null }
export default function TableSessionsAdmin() {
  const [tables, setTables] = useState<Table[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [qr, setQr] = useState<{ image: string; url: string } | null>(null)
  async function load() {
    const result = await apiRequest<{ tables: Table[] }>('/api/admin/table-sessions')
    setTables(result.tables)
  }
  useEffect(() => {
    const controller = new AbortController()
    void apiRequest<{ tables: Table[] }>('/api/admin/table-sessions', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setTables(result.tables)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load table sessions.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  async function act(id: string, close = false) {
    if (busy) return
    setBusy(true)
    setError('')
    setQr(null)
    try {
      await apiRequest(`/api/admin/table-sessions/${id}`, {
        method: close ? 'DELETE' : 'POST',
        ...(!close ? { body: JSON.stringify({ minutes: 120 }) } : {}),
      })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="mb-6 rounded-xl border bg-white p-5">
      <summary className="cursor-pointer font-semibold">Table ordering codes</summary>
      <p className="my-3 text-sm">
        When guests sit down, open their table session and show its QR code or give them the code.
        Codes last two hours. Close the session when guests leave; a new session replaces the old
        code. Staff should confirm orders before preparing food.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading && <LoadingSkeleton label="Loading table ordering sessions..." />}
      {!loading && !error && tables.length === 0 && (
        <p>No tables configured. Add tables in reservation settings first.</p>
      )}
      {error && !loading && (
        <button
          type="button"
          className="underline"
          onClick={() => {
            setError('')
            setLoading(true)
            setReload((value) => value + 1)
          }}
        >
          Reload table sessions
        </button>
      )}
      {tables.map((table) => (
        <div key={table.id} className="flex flex-wrap items-center gap-3 border-t py-3">
          <strong>{table.name}</strong>
          {table.code ? (
            <>
              <code>{table.code.match(/.{1,4}/g)?.join('-')}</code>
              <CopyButton label="Copy table code" text={table.code} />
              <AsyncButton
                pending={Boolean(busy)}
                disabled={busy}
                className="underline"
                onClick={async () => {
                  if (busy) return
                  setBusy(true)
                  setQr(null)
                  setError('')
                  try {
                    setQr(await apiRequest(`/api/admin/table-sessions/${table.id}/qr`))
                  } catch {
                    setError('Could not create QR code.')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Show QR
              </AsyncButton>
              <AsyncButton
                pending={Boolean(busy)}
                disabled={busy}
                className="underline"
                onClick={() => act(table.id, true)}
              >
                Close session
              </AsyncButton>
            </>
          ) : (
            <span>Closed</span>
          )}
          <AsyncButton
            pending={Boolean(busy)}
            disabled={busy}
            className="underline"
            onClick={() => act(table.id)}
          >
            Start new 2-hour session
          </AsyncButton>
        </div>
      ))}
      {qr && (
        <div className="mt-4">
          <img src={qr.image} alt="Scan to order at this table" className="h-64 w-64" />
          <p className="text-sm">
            Scan using the guest&apos;s phone. Localhost links only work on this computer; use the
            public website address once hosted.
          </p>
          <CopyButton label="Copy ordering link" text={qr.url} />
        </div>
      )}
    </details>
  )
}
