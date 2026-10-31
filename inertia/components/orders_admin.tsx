import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import { useEffect, useState } from 'react'
import { apiRequest } from '~/lib/restaurant_store'

type Order = {
  id: string
  name: string
  tableName: string
  notes: string
  total: number
  status: string
  createdAt: string
  items: { id: string; name: string; quantity: number; unitAmount: number }[]
}
const nextStatus: Record<string, string> = {
  Pending: 'Accepted',
  Accepted: 'Preparing',
  Preparing: 'Ready',
  Ready: 'Served',
}
const money = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount / 100)
export default function OrdersAdmin() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState('Active')
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await apiRequest<{ orders: Order[] }>('/api/admin/orders', {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setError('')
          setOrders(result.orders)
          setLoaded(true)
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load orders.')
      }
    }
    void load()
    const timer = setInterval(load, 10000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [reload])
  async function update(id: string, status: string) {
    if (busy) return
    setBusy(id)
    setError('')
    try {
      await apiRequest(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      const result = await apiRequest<{ orders: Order[] }>('/api/admin/orders')
      setOrders(result.orders)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update order.')
    } finally {
      setBusy(null)
    }
  }
  const visible = orders.filter(
    (order) =>
      filter === 'All' ||
      (filter === 'Active'
        ? !['Served', 'Cancelled'].includes(order.status)
        : order.status === filter)
  )
  return (
    <section className="ad-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Dine-in orders</h2>
        <label>
          Show{' '}
          <select
            aria-label="Filter orders"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="ml-2 rounded border p-2"
          >
            {[
              'Active',
              'All',
              'Pending',
              'Accepted',
              'Preparing',
              'Ready',
              'Served',
              'Cancelled',
            ].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Payment is handled by staff in the restaurant. An order total is not proof of payment.
        Latest 500 orders; new orders appear automatically.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
          <button
            className="ml-3 underline"
            type="button"
            onClick={() => {
              setError('')
              setReload((value) => value + 1)
            }}
          >
            Retry loading orders
          </button>
        </p>
      )}
      {!loaded && !error ? (
        <LoadingSkeleton label="Loading orders..." count={4} />
      ) : (
        loaded && visible.length === 0 && <p className="mt-6">No orders in this view.</p>
      )}
      <div className="mt-5 space-y-5">
        {visible.map((order) => (
          <article key={order.id} className="rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {order.tableName} · {order.name}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}{' '}
                  WAT
                </p>
              </div>
              <strong>{order.status}</strong>
            </div>
            <p className="mt-2 break-all text-xs text-gray-500">Order {order.id}</p>
            <ul className="my-4 space-y-2">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span>{money(item.quantity * item.unitAmount)}</span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <p className="my-3 whitespace-pre-wrap rounded bg-amber-50 p-3">
                Notes: {order.notes}
              </p>
            )}
            <p className="font-semibold">Menu total: {money(order.total)} · Pay in restaurant</p>
            {nextStatus[order.status] && (
              <div className="mt-4 flex gap-3">
                <AsyncButton
                  pending={busy === order.id}
                  className="ad-primary"
                  disabled={Boolean(busy)}
                  onClick={() => update(order.id, nextStatus[order.status])}
                >
                  {busy === order.id
                    ? 'Saving...'
                    : `Mark ${nextStatus[order.status].toLowerCase()}`}
                </AsyncButton>
                <AsyncButton
                  pending={busy === order.id}
                  className="ad-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => update(order.id, 'Cancelled')}
                >
                  Cancel order
                </AsyncButton>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
