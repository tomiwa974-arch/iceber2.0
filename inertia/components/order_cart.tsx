import AsyncButton from '~/components/async_button'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ShoppingBag, X } from 'lucide-react'
import { useRestaurant, apiRequest, formatPrice } from '~/lib/restaurant_store'
import {
  changeQuantity,
  clearCart,
  openCart,
  restoreCart,
  setOrderAttempt,
  useOrderCart,
} from '~/lib/order_cart'
import CopyButton from '~/components/copy_button'

export default function OrderCart() {
  const { menu, booking, live } = useRestaurant()
  const cart = useOrderCart()
  const [form, setForm] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    return {
      name: '',
      tableId: query.get('table') ?? '',
      tableCode: query.get('tableSession') ?? '',
      notes: '',
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ id: string; total: number } | null>(null)
  const attempt = cart.attempt
  const setAttempt = setOrderAttempt
  const sending = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    restoreCart()
    const query = new URLSearchParams(window.location.search)
    const tableId = query.get('table')
    const tableCode = query.get('tableSession')
    if (tableId && tableCode) {
      query.delete('table')
      query.delete('tableSession')
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + (query.size ? '?' + query.toString() : '') + window.location.hash
      )
    }
  }, [])
  useEffect(() => {
    if (cart.open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [cart.open])
  const lines = cart.items.map((line) => ({
    ...line,
    item: menu.find((item) => item.id === line.id && item.available),
  }))
  const total = lines.reduce((sum, line) => sum + (line.item?.price ?? 0) * line.quantity, 0)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!live) {
      setError('Demo mode: customer orders are disabled.')
      return
    }
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    const id = attempt?.id ?? crypto.randomUUID()
    const request = attempt ?? { id, body: JSON.stringify({ ...form, id, items: cart.items }) }
    setAttempt(request)
    try {
      const result = await apiRequest<{ order: { id: string; total: number } }>('/api/orders', {
        method: 'POST',
        body: request.body,
      })
      setReceipt(result.order)
      clearCart()
      setAttempt(null)
      setForm((current) => ({
        name: '',
        tableId: current.tableId,
        tableCode: current.tableCode,
        notes: '',
      }))
    } catch (cause) {
      const status = (cause as Error & { status?: number }).status
      if (status && status >= 400 && status < 500) setAttempt(null)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Order status could not be confirmed. Retry this same order or ask staff before ordering again.'
      )
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <button
        onClick={() => openCart()}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-4 font-semibold text-white shadow-xl"
        aria-label="Open order cart"
      >
        <ShoppingBag size={20} /> Your order (
        {cart.items.reduce((sum, item) => sum + item.quantity, 0)})
      </button>
      <dialog
        aria-labelledby="order-cart-title"
        ref={dialog}
        onClose={() => openCart(false)}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between">
          <h2 id="order-cart-title" className="text-2xl font-semibold">
            Your dine-in order
          </h2>
          <button type="button" onClick={() => openCart(false)} aria-label="Close order cart">
            <X />
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Order from your table. Pay staff in the restaurant; no online payment is taken.
        </p>
        {receipt && (
          <div className="mt-5 rounded-xl bg-emerald-50 p-4" role="status">
            <p>Order received. Staff will confirm your order.</p>
            <p className="my-2 break-all">Order ID: {receipt.id}</p>
            <p className="mb-3">Total: {formatPrice(receipt.total / 100)}</p>
            <CopyButton label="Copy order ID" text={receipt.id} />
          </div>
        )}
        {lines.length === 0 ? (
          <p className="my-6">Your cart is empty. Add items from the menu.</p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <fieldset disabled={busy || Boolean(attempt)} className="space-y-4">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between gap-3 border-b pb-3"
                >
                  <div>
                    <strong>{line.item?.name ?? 'Unavailable item'}</strong>
                    <p>
                      {line.item
                        ? formatPrice(line.item.price * line.quantity)
                        : 'Remove this item to continue'}
                    </p>
                  </div>
                  <label className="text-sm">
                    Quantity
                    <input
                      type="number"
                      aria-label={`Quantity for ${line.item?.name ?? line.id}`}
                      min={0}
                      max={20}
                      value={line.quantity}
                      onChange={(event) =>
                        changeQuantity(
                          line.id,
                          Math.max(0, Math.min(20, Number(event.target.value)))
                        )
                      }
                      className="ml-2 w-16 rounded border p-2"
                    />
                  </label>
                </div>
              ))}
              <p className="font-semibold">Menu total: {formatPrice(total)}</p>
              <label className="block">
                Name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="mt-1 block w-full rounded border p-3"
                />
              </label>
              <label className="block">
                Table ordering code
                <input
                  required
                  maxLength={32}
                  autoComplete="off"
                  value={form.tableCode}
                  onChange={(event) => setForm({ ...form, tableCode: event.target.value })}
                  placeholder="Ask staff or scan your table QR code"
                  className="mt-1 block w-full rounded border p-3"
                />
              </label>
              <label className="block">
                Your table
                <select
                  aria-label="Your table"
                  required
                  value={form.tableId}
                  onChange={(event) => setForm({ ...form, tableId: event.target.value })}
                  className="mt-1 block w-full rounded border p-3"
                >
                  <option value="">Choose the table you are sitting at</option>
                  {booking.tables
                    .filter((table) => table.active)
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Notes or allergies (optional)
                <textarea
                  maxLength={1000}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  className="mt-1 block w-full rounded border p-3"
                />
              </label>
            </fieldset>
            {attempt && !busy && (
              <p className="text-sm text-amber-800">
                This submission is awaiting confirmation. Retry to check the same order; ask staff
                before placing another.
              </p>
            )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <AsyncButton
              pending={Boolean(busy)}
              disabled={busy || (!attempt && lines.some((line) => !line.item))}
              className="w-full rounded-full bg-gray-900 p-3 font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? 'Sending order...'
                : attempt
                  ? 'Retry this order'
                  : 'Send order to restaurant'}
            </AsyncButton>
            <p className="text-xs text-gray-500">
              Prices and availability are checked when you submit. Menu prices are recorded in NGN;
              other currencies are estimates. Ask staff about extra charges and allergy
              requirements.
            </p>
          </form>
        )}
      </dialog>
    </>
  )
}
