import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import { useEffect, useState } from 'react'
import { apiRequest } from '~/lib/restaurant_store'

type Provider = { id: 'paystack' | 'stripe'; name: string; enabled: boolean; configured: boolean }
type Revenue = {
  gross: number
  refunded: number
  pendingRefunds: number
  reviewAmount: number
  cashNet: number
  retained: number
  paidBookings: number
  daily: { date: string; received: number; refunded: number; net: number }[]
}
const money = (amount: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amount / 100)
export default function PaymentsAdmin() {
  const [data, setData] = useState<{ providers: Provider[]; revenue: Revenue } | null>(null)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await apiRequest<{ providers: Provider[]; revenue: Revenue }>(
          '/api/admin/payments',
          { signal: controller.signal }
        )
        if (!controller.signal.aborted) {
          setData(result)
          setLoadError('')
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Could not load payments.')
      }
    }
    void load()
    const timer = setInterval(load, 15000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [reload])
  async function save() {
    if (!data || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await apiRequest<{ providers: Provider[] }>('/api/admin/payments/providers', {
        method: 'PUT',
        body: JSON.stringify({ providers: selected }),
      })
      setData({ ...data, providers: result.providers })
      setDraft(null)
      setMessage('Payment options saved. New checkouts use your selection.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  const selected =
    draft ??
    data?.providers
      .filter((provider) => provider.enabled && provider.configured)
      .map((provider) => provider.id) ??
    []
  const maximum = Math.max(
    1,
    ...(data?.revenue.daily.flatMap((day) => [day.received, day.refunded]) ?? [])
  )
  return (
    <div className="space-y-6">
      <section className="ad-panel p-6">
        <h2 className="text-xl font-semibold">Payment options</h2>
        <p className="mt-2 text-sm text-gray-500">
          Choose the providers guests can use for new reservation checkouts. Existing payments and
          refunds keep their original provider.
        </p>
        {!data && !loadError && (
          <LoadingSkeleton label="Loading payment options and revenue..." cards />
        )}
        {loadError && (
          <p role="alert">
            {loadError}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setLoadError('')
                setReload((value) => value + 1)
              }}
            >
              Retry loading payments
            </button>
          </p>
        )}
        <fieldset disabled={busy} className="my-5 flex flex-wrap gap-4">
          {data?.providers.map((provider) => (
            <label key={provider.id} className="flex items-center gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={selected.includes(provider.id)}
                disabled={!provider.configured}
                onChange={(event) =>
                  setDraft(
                    event.target.checked
                      ? [...selected, provider.id]
                      : selected.filter((id) => id !== provider.id)
                  )
                }
              />
              {provider.name}
              <span className="text-xs text-gray-500">
                {provider.configured ? 'Credentials configured' : 'Credentials needed on server'}
              </span>
            </label>
          ))}
        </fieldset>
        <AsyncButton
          pending={Boolean(busy)}
          className="ad-primary"
          disabled={busy || !data || selected.length === 0}
          onClick={save}
        >
          {busy ? 'Saving...' : 'Save payment options'}
        </AsyncButton>
        {message && (
          <p className="mt-3 text-sm" role="status">
            {message}
          </p>
        )}
      </section>
      {data && (
        <>
          <section className="ad-panel p-6">
            <h2 className="text-xl font-semibold">Reservation revenue</h2>
            <p className="mt-2 text-sm text-gray-500">
              All-time totals in NGN. Excludes food orders, payment processing fees, taxes and
              refunds made outside this website. Test transactions are included while testing.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Payments received', data.revenue.gross],
                ['Refunds completed', data.revenue.refunded],
                ['Cash after completed refunds', data.revenue.cashNet],
                ['Refunds awaiting completion', data.revenue.pendingRefunds],
                ['Payments needing refund review', data.revenue.reviewAmount],
                ['Retained after refund obligations', data.revenue.retained],
              ].map(([label, amount]) => (
                <div key={String(label)} className="rounded-xl border border-gray-200 p-4">
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="mt-2 text-2xl font-semibold">{money(Number(amount))}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-gray-500">
              {data.revenue.paidBookings} paid reservations. Retained is before business costs, not
              profit. Pending or failed refunds remain reserved until reconciled.
            </p>
          </section>
          <section className="ad-panel p-6">
            <h2 className="text-xl font-semibold">Daily payments and refunds</h2>
            <p className="mt-2 text-sm text-gray-500">
              Last 30 days, WAT. Green: received. Orange: completed refunds. Dates follow when money
              was paid or the refund was recorded as processed.
            </p>
            <div className="mt-6 overflow-x-auto">
              <svg
                viewBox="0 0 900 210"
                className="min-w-[600px] w-full"
                role="img"
                aria-label="Daily reservation receipts and completed refunds over the last 30 days"
              >
                <line x1="0" x2="900" y1="180" y2="180" stroke="#d1d5db" />
                {data.revenue.daily.map((day, index) => (
                  <g key={day.date}>
                    <title>
                      {day.date}: Received {money(day.received)}, refunded {money(day.refunded)},
                      net {money(day.net)}
                    </title>
                    <rect
                      x={index * 30 + 4}
                      y={180 - (day.received / maximum) * 155}
                      width="10"
                      height={(day.received / maximum) * 155}
                      fill="#047857"
                    />
                    <rect
                      x={index * 30 + 15}
                      y={180 - (day.refunded / maximum) * 155}
                      width="10"
                      height={(day.refunded / maximum) * 155}
                      fill="#c2410c"
                    />
                    {index % 5 === 0 && (
                      <text x={index * 30 + 4} y="202" fontSize="11" fill="#6b7280">
                        {day.date.slice(5)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm underline">View daily figures</summary>
              <div className="overflow-auto">
                <table className="mt-4 w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>Date (WAT)</th>
                      <th>Received</th>
                      <th>Refunded</th>
                      <th>Net cash flow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenue.daily.map((day) => (
                      <tr key={day.date}>
                        <td className="py-2">{day.date}</td>
                        <td>{money(day.received)}</td>
                        <td>{money(day.refunded)}</td>
                        <td>{money(day.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  )
}
