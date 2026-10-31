import AsyncButton from '~/components/async_button'
import { useState } from 'react'
import { apiRequest } from '~/lib/restaurant_store'

export default function VerifyEmail({
  email,
  onVerified,
  reservationId,
}: {
  email: string
  reservationId?: string
  onVerified: (token: string) => void
}) {
  const [id, setId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [verified, setVerified] = useState(false)
  async function act(check: boolean) {
    if (busy) return
    setChecking(check)
    setBusy(true)
    setMessage('')
    try {
      if (check) {
        const result = await apiRequest<{ token: string }>('/api/email-verification/verify', {
          method: 'POST',
          body: JSON.stringify({ email, id, code }),
        })
        onVerified(result.token)
        setVerified(true)
        setMessage('Email verified. Continue within 10 minutes.')
      } else {
        const result = await apiRequest<{ id: string }>('/api/email-verification/request', {
          method: 'POST',
          body: JSON.stringify({
            email,
            purpose: reservationId ? 'cancel' : 'booking',
            reservationId,
          }),
        })
        setId(result.id)
        setMessage(
          'Check your inbox and spam folder for your six-digit code. It expires in 10 minutes.'
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-gray-200 p-4 text-sm">
      <p>
        {reservationId
          ? 'Verify your email with a fresh code to authorize this cancellation.'
          : 'Verify your email before payment so we can send your booking details.'}
      </p>
      {!verified && (
        <AsyncButton
          pending={Boolean(busy)}
          type="button"
          disabled={busy || !email}
          onClick={() => act(false)}
          className="underline disabled:opacity-50"
        >
          {busy && !checking ? 'Sending code...' : id ? 'Send a new code' : 'Send email code'}
        </AsyncButton>
      )}
      {id && !verified && (
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Email verification code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            className="rounded border p-2"
          />
          <AsyncButton
            pending={Boolean(busy)}
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => act(true)}
            className="underline disabled:opacity-50"
          >
            {busy && checking ? 'Verifying email...' : 'Verify email'}
          </AsyncButton>
        </div>
      )}
      <p role="status">
        {busy ? (checking ? 'Checking your code...' : 'Requesting an email code...') : message}
      </p>
    </div>
  )
}
