import AsyncButton from '~/components/async_button'
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { apiRequest, refreshRestaurant, useRestaurant } from '~/lib/restaurant_store'

export default function ReservationNotifications({
  openReservation,
  openOrders,
}: {
  openReservation: (id: string) => void
  openOrders: () => void
}) {
  const { notifications, loaded } = useRestaurant()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [checking, setChecking] = useState(true)
  const seen = useRef<Set<string> | null>(null)
  const unread = notifications.filter((item) => !item.read)
  useEffect(() => {
    if (!loaded) return
    if (seen.current)
      for (const item of notifications) {
        if (!item.read && !seen.current.has(item.id)) toast.info(item.message)
      }
    seen.current = new Set(notifications.map((item) => item.id))
  }, [notifications, loaded])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setChecking(false)
      return
    }
    void navigator.serviceWorker
      .getRegistration('/')
      .then(async (registration) => {
        setEnabled(Boolean(await registration?.pushManager.getSubscription()))
        if (registration) await registration.update()
      })
      .catch(() => {
        setMessage('Could not check browser alert settings. Try enabling alerts again.')
      })
      .finally(() => setChecking(false))
  }, [])
  async function togglePush() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (
        !window.isSecureContext ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        throw new Error('Laptop alerts need HTTPS and a browser with push notification support.')
      }
      if (enabled) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          await apiRequest('/api/admin/notifications/push', {
            method: 'DELETE',
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
          await subscription.unsubscribe()
        }
        setEnabled(false)
        return
      }
      // Request permission directly from the click, before asynchronous setup.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted')
        throw new Error('Allow notifications in your browser settings to receive laptop alerts.')
      const { publicKey } = await apiRequest<{ publicKey: string | null }>(
        '/api/admin/notifications/push'
      )
      if (!publicKey)
        throw new Error(
          'Laptop alerts need VAPID keys configured on the server. Your inbox still receives updates.'
        )
      const registration = await navigator.serviceWorker.register('/reservation-sw.js')
      await navigator.serviceWorker.ready
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
        char.charCodeAt(0)
      )
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }))
      await apiRequest('/api/admin/notifications/push', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      })
      setEnabled(true)
      setMessage(
        'Laptop alerts enabled for this browser. Delivery depends on browser and system notification settings.'
      )
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to enable laptop alerts.')
    } finally {
      setBusy(false)
    }
  }
  async function markRead() {
    if (busy) return
    setBusy(true)
    try {
      await apiRequest('/api/admin/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ ids: unread.map((item) => item.id) }),
      })
      await refreshRestaurant()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Please retry.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ad-notifications">
      <button
        className="ad-secondary"
        aria-expanded={open}
        aria-label={`Notifications, ${unread.length} unread`}
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} />
        {unread.length > 0 && <b>{unread.length}</b>}
      </button>
      {open && (
        <section className="ad-notification-panel" aria-label="Restaurant notifications">
          <h2>Notifications</h2>
          <p>New reservations, cancellations and dine-in orders appear here.</p>
          <AsyncButton
            pending={Boolean(busy || checking)}
            className="ad-secondary"
            disabled={busy || checking}
            onClick={togglePush}
          >
            {checking
              ? 'Checking alert settings...'
              : enabled
                ? 'Disable laptop alerts'
                : 'Enable laptop alerts'}
          </AsyncButton>
          {message && <p role="status">{message}</p>}
          {unread.length > 0 && (
            <AsyncButton
              pending={Boolean(busy)}
              className="ad-text-button"
              disabled={busy}
              onClick={markRead}
            >
              Mark all as read
            </AsyncButton>
          )}
          {!loaded ? (
            <p role="status">Loading notifications...</p>
          ) : (
            notifications.length === 0 && <p>No notifications yet.</p>
          )}
          <ul>
            {notifications.map((item) => (
              <li key={item.id} className={item.read ? '' : 'unread'}>
                <button
                  onClick={() => {
                    item.orderId ? openOrders() : openReservation(item.reservationId)
                    setOpen(false)
                  }}
                >
                  <strong>{item.message}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}{' '}
                    WAT
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
