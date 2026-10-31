import AsyncButton from '~/components/async_button'
import VerifyEmail from '~/components/verify_email'
import { useState, type FormEvent } from 'react'
import { apiRequest } from '~/lib/restaurant_store'

type Booking = {
  cancellation: {
    canCancel: boolean
    refundAmount: number
    feeAmount: number
    feePercent: number
    paidAmount: number
  }
  refund: { status: string; amount: number; feeAmount: number; note: string } | null
  id: string
  date: string
  time: string
  guests: string
  status: string
  tableName?: string
  endTime?: string
}

export default function ManageReservation({ recentReference }: { recentReference: string }) {
  const [id, setId] = useState(recentReference)
  const [email, setEmail] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [reason, setReason] = useState('')
  const [booking, setBooking] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent, cancel = false) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<{ reservation: Booking }>(
        `/api/reservations/${cancel ? 'cancel' : 'lookup'}`,
        {
          method: 'POST',
          body: JSON.stringify({
            id,
            email,
            ...(cancel
              ? {
                  reason,
                  verificationToken,
                  expectedRefundAmount: booking?.cancellation.refundAmount,
                }
              : {}),
          }),
        }
      )
      setBooking(result.reservation)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details
      className="mt-8 bg-white rounded-2xl shadow-lg p-8"
      onToggle={(event) => {
        if (!event.currentTarget.open || id) return
        try {
          setId(localStorage.getItem('iceberg-last-reservation') ?? '')
        } catch {
          /* Storage can be disabled. */
        }
      }}
    >
      <summary className="cursor-pointer font-semibold">Find or cancel a reservation</summary>
      <p className="my-4 text-gray-600">
        No account needed. Use the reference shown after booking and the same email address.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          Booking reference
          <input
            required
            maxLength={36}
            value={id}
            onChange={(e) => {
              setId(e.target.value)
              setBooking(null)
              setVerificationToken('')
            }}
            className="block w-full border rounded-lg p-3"
          />
        </label>
        <label className="block">
          Booking email
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setBooking(null)
              setVerificationToken('')
            }}
            className="block w-full border rounded-lg p-3"
          />
        </label>
        <AsyncButton pending={Boolean(busy)} disabled={busy} className="underline" type="submit">
          {busy ? 'Please wait…' : 'Find reservation'}
        </AsyncButton>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      {booking && (
        <div className="mt-5" aria-live="polite">
          <p>
            {booking.tableName ?? 'Table to be assigned'} · {booking.date} at {booking.time}–
            {booking.endTime} WAT · {booking.guests} guests ·{' '}
            <strong>
              {booking.status === 'Confirmed' ? 'Confirmed · arrived' : booking.status}
            </strong>
          </p>
          {booking.cancellation.canCancel && (
            <form onSubmit={(e) => submit(e, true)} className="mt-4 space-y-4">
              {booking.cancellation.paidAmount > 0 && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm">
                  <p>
                    Cancellation fee ({booking.cancellation.feePercent}%): NGN{' '}
                    {(booking.cancellation.feeAmount / 100).toLocaleString()}
                  </p>
                  <p className="mt-2 font-semibold">
                    Refund to request: NGN{' '}
                    {(booking.cancellation.refundAmount / 100).toLocaleString()}
                  </p>
                  <p className="mt-2">
                    Full refund at least two hours before your booking. Within two hours and until
                    the 30-minute arrival deadline, a 25% fee applies. No refund after that deadline
                    or after check-in. Refund processing is handled by your payment provider and
                    your bank.
                  </p>
                </div>
              )}
              <VerifyEmail
                key={`${id}:${email}`}
                email={email}
                reservationId={id}
                onVerified={setVerificationToken}
              />
              <label className="block">
                Why are you cancelling?
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="block w-full border rounded-lg p-3"
                />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" required />I agree to cancel and accept the displayed
                cancellation fee and refund amount.
              </label>
              <AsyncButton
                pending={Boolean(busy)}
                disabled={busy || !verificationToken}
                className="bg-red-700 text-white rounded-full px-6 py-3"
              >
                Confirm cancellation
              </AsyncButton>
            </form>
          )}
          {booking.status === 'Cancelled' && (
            <p className="mt-3">This reservation is cancelled. You can make a new booking above.</p>
          )}
          {booking.status === 'Expired' && (
            <p className="mt-3">
              The 30-minute arrival deadline has passed. This no-show reservation is not eligible
              for a refund.
            </p>
          )}
          {booking.refund && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm" aria-live="polite">
              <p>
                Refund: NGN {(booking.refund.amount / 100).toLocaleString()} ·{' '}
                {booking.refund.status}
              </p>
              <p>
                Retained cancellation fee: NGN {(booking.refund.feeAmount / 100).toLocaleString()}
              </p>
              <p className="mt-2">
                {booking.refund.note ||
                  (booking.refund.status === 'Processed'
                    ? 'The payment provider has processed this refund. Bank posting times may vary.'
                    : 'Your refund is being handled. It is not complete until the payment provider confirms processing.')}
              </p>
              <AsyncButton
                pending={Boolean(busy)}
                className="mt-3 underline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    const result = await apiRequest<{ refund: Booking['refund'] }>(
                      '/api/reservations/refund-status',
                      { method: 'POST', body: JSON.stringify({ id, email }) }
                    )
                    setBooking({ ...booking, refund: result.refund })
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Please retry later.')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Check refund status
              </AsyncButton>
            </div>
          )}
        </div>
      )}
    </details>
  )
}
