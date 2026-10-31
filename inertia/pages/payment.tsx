import AsyncButton from '~/components/async_button'
import DemoNotice from '~/components/demo_notice'
import PolicyLinks from '~/components/policy_links'
import CopyButton from '~/components/copy_button'
import { useEffect, useState } from 'react'
import { Head, router } from '@inertiajs/react'
import { ArrowLeft, LockKeyhole, CreditCard, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'
import IcebergLogo from '~/components/iceberg_logo'
import CurrencySelector from '~/components/currency_selector'
import { apiRequest, formatPrice, useRestaurant } from '~/lib/restaurant_store'

type Checkout = {
  provider: 'paystack' | 'stripe'
  providerLocked: boolean
  providers: { id: 'paystack' | 'stripe'; name: string; mode: string }[]
  terms: string[]
  messages: { channel: string; status: string }[]
  reservationStatus: string | null
  refund: { amount: number; feeAmount: number; status: string; note: string } | null
  reference: string
  reservationId: string | null
  status: string
  expired: boolean
  holdUntil: number
  date: string
  time: string
  guests: number
  tableName: string
  amount: number
  currency: string
  configured: boolean
  mode: string
  emailHint: string
  reviewReason: string
}
export default function Payment({ checkout: initial }: { checkout: Checkout }) {
  useRestaurant()
  const [checkout, setCheckout] = useState(initial)
  const [chosenProvider, setProvider] = useState(
    initial.providerLocked ? initial.provider : (initial.providers[0]?.id ?? 'paystack')
  )
  const provider = checkout.providerLocked ? checkout.provider : chosenProvider
  const selectedProvider = checkout.providers.find((item) => item.id === provider)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [checkingReturn, setCheckingReturn] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const paid = checkout.status === 'Paid'
  const expired = checkout.expired || checkout.holdUntil <= now
  const seconds = Math.max(0, Math.ceil((checkout.holdUntil - now) / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!checkout.reservationId) return
    try {
      localStorage.setItem('iceberg-last-reservation', checkout.reservationId)
    } catch {
      /* Receipt remains visible. */
    }
  }, [checkout.reservationId])
  useEffect(() => {
    if (initial.status !== 'Pending' || !initial.configured) return
    const controller = new AbortController()
    const returned = new URLSearchParams(window.location.search).get('returned') === '1'
    async function check(verify = false) {
      if (verify) setCheckingReturn(true)
      try {
        const response = await apiRequest<{ checkout: Checkout }>(
          `/api/payments/${initial.reference}${verify ? '/verify' : ''}`,
          { ...(verify ? { method: 'POST' } : {}), signal: controller.signal }
        )
        if (!controller.signal.aborted) setCheckout(response.checkout)
      } catch (cause) {
        if (verify && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not verify payment.')
      } finally {
        if (verify && !controller.signal.aborted) setCheckingReturn(false)
      }
    }
    if (returned) void check(true)
    const timer = window.setInterval(() => check(), 15000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [initial.reference, initial.configured, initial.status])
  async function act(verify: boolean) {
    if (busy || checkingReturn) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (verify) {
        const result = await apiRequest<{ checkout: Checkout }>(
          `/api/payments/${checkout.reference}/verify`,
          { method: 'POST' }
        )
        setCheckout(result.checkout)
        if (result.checkout.status === 'Pending')
          setNotice(
            'Payment is not confirmed yet. If you paid, wait a moment and check again. Do not pay twice.'
          )
      } else {
        const result = await apiRequest<{ url: string }>(
          `/api/payments/${checkout.reference}/initialize`,
          { method: 'POST', body: JSON.stringify({ provider }) }
        )
        window.location.assign(result.url)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <Head title="Reservation payment" />
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <button
            onClick={() => router.visit('/')}
            className="flex items-center gap-2 font-semibold"
          >
            <IcebergLogo className="h-10 w-10" />
            IceBerg
          </button>
          <CurrencySelector />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
        <DemoNotice />
        <button
          onClick={() => router.visit('/#reservations')}
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500"
        >
          <ArrowLeft size={16} /> Back to reservations
        </button>
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Your table, one step away
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            {checkout.reservationStatus === 'Cancelled'
              ? 'Your reservation is cancelled.'
              : paid
                ? 'Your reservation is secured.'
                : checkout.status === 'ReviewRequired'
                  ? 'Your payment needs attention.'
                  : 'Complete your reservation'}
          </h1>
          <p className="mt-4 max-w-2xl text-slate-500">
            A reservation fee secures your named table for a two-hour visit. No guest account
            required.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-[1fr_1.1fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-7 sm:p-9">
            <p className="text-sm text-slate-500">Your reservation</p>
            <h2 className="mt-2 text-3xl font-semibold">{checkout.tableName}</h2>
            <dl className="mt-8 space-y-5 text-sm">
              {[
                ['Date', checkout.date],
                ['Start time', `${checkout.time} WAT`],
                ['Party size', `${checkout.guests} guests`],
                ['Dining time', '2 hours from scheduled start'],
                ['Cleanup', '10 minutes after dining'],
                ['Contact', checkout.emailHint],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 border-t border-stone-100 pt-6">
              <div className="flex justify-between gap-4">
                <span>Reservation fee</span>
                <strong>{formatPrice(checkout.amount / 100)}</strong>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Charged amount: ₦30,000 NGN per table. This fee is separate from food and drinks.
                Any currency conversion is an estimate.
              </p>
            </div>
            <p className="mt-6 break-all text-xs text-slate-600">
              Payment reference: {checkout.reference}
            </p>
          </section>
          <section className="rounded-3xl border border-stone-200 bg-white p-7 sm:p-9">
            {paid ? (
              <>
                <CheckCircle2 size={40} className="text-emerald-600" />
                <h2 className="mt-5 text-2xl font-semibold">Payment verified</h2>
                <p className="mt-3 text-slate-500">
                  {checkout.reservationStatus === 'Cancelled'
                    ? 'Your booking has been cancelled and the table released.'
                    : 'Your table is booked. Staff will confirm your arrival when you check in.'}
                </p>
                <p className="mt-5 break-all rounded-xl bg-emerald-50 p-4 text-sm">
                  Booking reference: <strong>{checkout.reservationId}</strong>
                </p>
                <p className="mt-4 text-sm text-slate-500">
                  Save this reference. Use it with your booking email to find or cancel the
                  reservation on the homepage.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <CopyButton label="Copy booking ID" text={checkout.reservationId ?? ''} />
                  <CopyButton
                    label="Copy booking details"
                    text={[
                      'IceBerg booking',
                      'Booking ID: ' + checkout.reservationId,
                      'Table: ' + checkout.tableName,
                      'Date: ' + checkout.date,
                      'Start: ' + checkout.time + ' WAT',
                      'Guests: ' + checkout.guests,
                      'Paid: NGN 30,000 (reservation fee only)',
                      ...checkout.terms,
                    ].join('\n')}
                  />
                </div>
                <div className="mt-4 text-xs text-slate-500" role="status">
                  {checkout.messages.map((message) => (
                    <p key={message.channel}>
                      {message.channel === 'email' ? 'Email' : 'SMS'}:{' '}
                      {message.status === 'Accepted'
                        ? 'Sent to delivery provider; delivery is not guaranteed.'
                        : message.status === 'NeedsReview'
                          ? 'Not confirmed. Please save your booking details and contact the restaurant.'
                          : 'Awaiting delivery. Please save your booking details.'}
                    </p>
                  ))}
                </div>
                {checkout.refund && (
                  <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm">
                    Refund: NGN {(checkout.refund.amount / 100).toLocaleString()} ·{' '}
                    {checkout.refund.status}. Retained fee: NGN{' '}
                    {(checkout.refund.feeAmount / 100).toLocaleString()}.{' '}
                    {checkout.refund.note || 'Use the homepage to check the latest refund status.'}
                  </p>
                )}
              </>
            ) : checkout.status === 'ReviewRequired' ? (
              <>
                <ShieldCheck size={40} className="text-amber-600" />
                <p className="mt-5 text-amber-900">{checkout.reviewReason}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <CreditCard className="text-emerald-700" />
                  <h2 className="text-xl font-semibold">Secure payment</h2>
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-500">
                  Choose a payment provider below. Cards and eligible wallets are handled on its
                  secure checkout page.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['Visa', 'Mastercard', ...(provider === 'paystack' ? ['Verve'] : [])].map(
                    (label) => (
                      <span
                        key={label}
                        className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold"
                      >
                        {label}
                      </span>
                    )
                  )}
                </div>
                <fieldset className="mt-6 space-y-3" disabled={busy || checkout.providerLocked}>
                  <legend className="mb-3 text-sm font-semibold">Pay with</legend>
                  {checkout.providers
                    .filter((item) => !checkout.providerLocked || item.id === checkout.provider)
                    .map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-stone-200 p-4"
                      >
                        <input
                          type="radio"
                          name="paymentProvider"
                          value={item.id}
                          checked={provider === item.id}
                          onChange={() => setProvider(item.id)}
                        />
                        {item.name}{' '}
                        {item.mode === 'test' && (
                          <span className="text-xs text-amber-800">Test mode</span>
                        )}
                      </label>
                    ))}
                </fieldset>
                {checkout.providerLocked && (
                  <p className="mt-3 text-xs text-slate-500">
                    This checkout is linked to{' '}
                    {checkout.provider === 'stripe' ? 'Stripe' : 'Paystack'}. Check any attempted
                    payment before making a new reservation.
                  </p>
                )}
                <p
                  className={`mt-7 flex items-center gap-2 rounded-xl p-4 text-sm ${expired ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}
                >
                  <Clock3 size={18} />
                  {expired
                    ? 'This table hold has expired. Check any attempted payment before booking again.'
                    : `Table held for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
                </p>
                {!checkout.configured && (
                  <p
                    role="status"
                    className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                  >
                    Payments are not configured yet. This checkout is not verified and your table is
                    not yet secured. Please contact the restaurant.
                  </p>
                )}
                {checkout.configured && selectedProvider?.mode === 'test' && (
                  <p className="mt-4 text-sm text-amber-800">
                    Test checkout · use {selectedProvider?.name} test payment details only. This
                    does not charge real money.
                  </p>
                )}
                <AsyncButton
                  pending={Boolean(busy || checkingReturn)}
                  disabled={busy || expired || !selectedProvider}
                  onClick={() => act(false)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LockKeyhole size={17} />
                  {busy ? 'Processing payment request...' : 'Pay NGN 30,000 securely'}
                </AsyncButton>
                <AsyncButton
                  pending={Boolean(busy || checkingReturn)}
                  disabled={busy || !checkout.configured}
                  onClick={() => act(true)}
                  className="mt-4 w-full text-center text-sm underline disabled:opacity-40"
                >
                  Already paid? Verify payment
                </AsyncButton>
                <p className="mt-5 text-xs leading-5 text-slate-600">
                  Card details are entered on your selected provider’s secure page. The restaurant
                  does not receive or store your card number or PIN.
                </p>
              </>
            )}
            {checkingReturn && (
              <p role="status" className="mt-5">
                Verifying the payment provider response...
              </p>
            )}
            {error && (
              <p role="alert" className="mt-5 text-sm text-red-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="mt-5 text-sm text-slate-600">
                {notice}
              </p>
            )}
            <p className="mt-7 border-t border-stone-100 pt-5 text-xs leading-5 text-slate-500">
              Arrive within 30 minutes. Your two-hour dining window starts at the reserved time and
              is not extended by late arrival. Staff then have 10 minutes for cleanup before the
              next booking. Cancel at least two hours before the start for a full refund. Later
              cancellations until the 30-minute arrival deadline retain a 25% fee and refund 75%. No
              refund after that deadline or after check-in. Eligible refunds are requested through
              the original payment provider; bank processing times vary.
            </p>
          </section>
        </div>
      </main>
      <PolicyLinks />
    </div>
  )
}
