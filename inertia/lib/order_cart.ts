import { useSyncExternalStore } from 'react'
type Attempt = { id: string; body: string }
type Cart = { items: { id: string; quantity: number }[]; open: boolean; attempt: Attempt | null }
let cart: Cart = { items: [], open: false, attempt: null }
const listeners = new Set<() => void>()
function publish(next: Cart) {
  cart = next
  try {
    localStorage.setItem('iceberg-order-cart', JSON.stringify(cart.items))
    if (cart.attempt) sessionStorage.setItem('iceberg-order-attempt', JSON.stringify(cart.attempt))
    else sessionStorage.removeItem('iceberg-order-attempt')
  } catch {
    /* Cart still works in memory. */
  }
  listeners.forEach((listener) => listener())
}
export function restoreCart() {
  try {
    const items = JSON.parse(localStorage.getItem('iceberg-order-cart') ?? '[]')
    const savedAttempt = JSON.parse(sessionStorage.getItem('iceberg-order-attempt') ?? 'null')
    const attempt =
      savedAttempt && typeof savedAttempt.id === 'string' && typeof savedAttempt.body === 'string'
        ? (savedAttempt as Attempt)
        : null
    if (Array.isArray(items))
      publish({
        ...cart,
        attempt,
        items: items
          .filter(
            (item) =>
              typeof item.id === 'string' &&
              Number.isInteger(item.quantity) &&
              item.quantity > 0 &&
              item.quantity <= 20
          )
          .slice(0, 30),
      })
  } catch {
    /* Ignore damaged browser storage. */
  }
}
export function setOrderAttempt(attempt: Attempt | null) {
  publish({ ...cart, attempt })
}
export function addToOrder(id: string) {
  if (cart.attempt) {
    openCart()
    return
  }
  const line = cart.items.find((item) => item.id === id)
  if (line) changeQuantity(id, Math.min(20, line.quantity + 1))
  else if (cart.items.length < 30) publish({ ...cart, items: [...cart.items, { id, quantity: 1 }] })
}
export function changeQuantity(id: string, quantity: number) {
  if (cart.attempt) return
  publish({
    ...cart,
    items: cart.items
      .map((item) => (item.id === id ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0),
  })
}
export function clearCart() {
  publish({ ...cart, items: [] })
}
export function openCart(open = true) {
  publish({ ...cart, open })
}
export function useOrderCart() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => cart
  )
}
