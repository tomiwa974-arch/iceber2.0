import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import { useEffect, useState } from 'react'
import { apiRequest } from '~/lib/restaurant_store'
import CopyButton from '~/components/copy_button'
export default function SecurityAdmin() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryRemaining: number } | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [setup, setSetup] = useState<{ image: string; secret: string } | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  async function load() {
    setStatus(await apiRequest('/api/admin/security'))
  }
  useEffect(() => {
    const controller = new AbortController()
    void apiRequest<{ enabled: boolean; recoveryRemaining: number }>('/api/admin/security', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setStatus(result)
          setLoadError('')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError('Could not load security settings.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  async function act(action: string) {
    if (busy || !status) return
    setBusy(true)
    setMessage('')
    try {
      if (action === 'password' && newPassword !== confirmation)
        throw new Error('New passwords must match.')
      const result = await apiRequest<{
        image?: string
        secret?: string
        codes?: string[]
        message?: string
      }>('/api/admin/security', {
        method: 'POST',
        body: JSON.stringify({
          action,
          password,
          code,
          ...(action === 'password' ? { newPassword } : {}),
        }),
      })
      if (result.secret && result.image) setSetup({ secret: result.secret, image: result.image })
      if (result.codes) {
        setCodes(result.codes)
        setSetup(null)
        setMessage(
          'Two-factor authentication enabled. Save your recovery codes now. Each works once.'
        )
      }
      if (result.message) setMessage(result.message)
      if (action !== 'begin') {
        setPassword('')
        setCode('')
        setNewPassword('')
        setConfirmation('')
      }
      if (action === 'disable') {
        setCodes([])
        setSetup(null)
      }
      await load()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  if (loading && !status) return <LoadingSkeleton label="Loading administrator security..." />
  if (!status)
    return (
      <div role="alert">
        {loadError}
        <button
          className="ml-3 underline"
          onClick={() => {
            setLoadError('')
            setLoading(true)
            setReload((value) => value + 1)
          }}
        >
          Retry security settings
        </button>
      </div>
    )
  return (
    <section className="max-w-2xl space-y-5 rounded-xl bg-white p-6">
      <h2 className="text-xl font-semibold">Administrator security</h2>
      <p>
        Two-factor authentication:{' '}
        <strong>{status ? (status.enabled ? 'Enabled' : 'Not enabled') : 'Loading...'}</strong>
        {status?.enabled && ` (${status.recoveryRemaining} recovery codes left)`}
      </p>
      <p className="text-sm">
        Use an authenticator app such as Google Authenticator, Microsoft Authenticator, or
        1Password. Setup only becomes active after you confirm a code. Keep recovery codes somewhere
        safe outside this website.
      </p>
      <label className="block">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded border p-3"
        />
      </label>
      {(status?.enabled || setup) && (
        <label className="block">
          {setup ? 'Six-digit code from your app' : 'Authenticator or recovery code'}
          <input
            autoComplete="one-time-code"
            maxLength={40}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 block w-full rounded border p-3"
          />
        </label>
      )}
      {!status?.enabled && (
        <AsyncButton
          pending={Boolean(busy)}
          className="underline"
          disabled={busy || !password || !status}
          onClick={() => act('begin')}
        >
          Set up two-factor authentication
        </AsyncButton>
      )}
      {setup && (
        <div className="space-y-3">
          <img src={setup.image} className="h-64 w-64" alt="Scan with your authenticator app" />
          <p className="break-all">Manual setup key: {setup.secret}</p>
          <AsyncButton
            pending={Boolean(busy)}
            className="underline"
            disabled={busy || !code || !password}
            onClick={() => act('enable')}
          >
            Confirm and enable
          </AsyncButton>
        </div>
      )}
      {codes.length > 0 && (
        <div className="space-y-3 rounded border p-4">
          <p>Recovery codes are shown only now. Save them before leaving this page.</p>
          <pre className="whitespace-pre-wrap">{codes.join('\n')}</pre>
          <CopyButton label="Copy recovery codes" text={codes.join('\n')} />
          <button className="ml-4 underline" onClick={() => setCodes([])}>
            I saved them; hide codes
          </button>
        </div>
      )}
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Change password</h3>
        <p className="text-sm">
          12–128 characters, including uppercase, lowercase, a number and a symbol.
        </p>
        <label className="block">
          New password
          <input
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 block w-full rounded border p-3"
          />
        </label>
        <label className="block">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="mt-1 block w-full rounded border p-3"
          />
        </label>
        <AsyncButton
          pending={Boolean(busy)}
          className="underline"
          disabled={busy || !password || !newPassword}
          onClick={() => act('password')}
        >
          Change password and sign out other sessions
        </AsyncButton>
      </div>
      <AsyncButton
        pending={Boolean(busy)}
        className="block underline"
        disabled={busy || !password}
        onClick={() => act('revoke')}
      >
        Sign out my other sessions
      </AsyncButton>
      {status?.enabled && (
        <AsyncButton
          pending={Boolean(busy)}
          className="block text-red-700 underline"
          disabled={busy || !password || !code}
          onClick={() => act('disable')}
        >
          Disable two-factor authentication
        </AsyncButton>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
