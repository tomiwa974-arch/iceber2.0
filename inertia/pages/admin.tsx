import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import SecurityAdmin from '~/components/security_admin'
import TableSessionsAdmin from '~/components/table_sessions_admin'
import PaymentsAdmin from '~/components/payments_admin'
import OrdersAdmin from '~/components/orders_admin'
import { useEffect, useState, type FormEvent } from 'react'
import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { useRef } from 'react'
import {
  LayoutDashboard,
  Clock3,
  UtensilsCrossed,
  Wine,
  CakeSlice,
  CalendarDays,
  Settings2,
  ArrowUpRight,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  Banknote,
  ShoppingBag,
} from 'lucide-react'
import IcebergLogo from '~/components/iceberg_logo'
import MenuPhotoField from '~/components/menu_photo_field'
import SpecialsAdmin from '~/components/specials_admin'
import ReservationNotifications from '~/components/reservation_notifications'
import TablesAdmin from '~/components/tables_admin'
import {
  useRestaurant,
  saveMenuItem,
  deleteMenuItem,
  setReservationStatus,
  saveSettings,
  logoutAdmin,
  formatPrice,
  apiRequest,
  refreshRestaurant,
  type MenuItem,
  type Reservation,
  type RestaurantState,
} from '~/lib/restaurant_store'
import '~/css/admin.css'

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'food', label: 'Food menu', icon: UtensilsCrossed },
  { id: 'drink', label: 'Drinks', icon: Wine },
  { id: 'dessert', label: 'Desserts', icon: CakeSlice },
  { id: 'specials', label: 'Daily specials', icon: Clock3 },
  { id: 'reservations', label: 'Reservations', icon: CalendarDays },
  { id: 'payments', label: 'Payments & revenue', icon: Banknote },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'subscribers', label: 'Newsletter', icon: Mail },
  { id: 'security', label: 'Security', icon: Settings2 },
  { id: 'settings', label: 'Website settings', icon: Settings2 },
]
const newItem = (kind: MenuItem['kind']): MenuItem => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  price: 0,
  category: kind === 'dessert' ? 'Desserts' : kind === 'drink' ? 'Cocktails' : 'Mains',
  kind,
  image: '',
  popular: false,
  available: true,
})
const statusClass = (status: Reservation['status']) =>
  status === 'Confirmed'
    ? 'ad-badge green'
    : status === 'Cancelled'
      ? 'ad-badge red'
      : 'ad-badge amber'

export default function Admin() {
  const state = useRestaurant()
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get('tab') === 'orders' ? 'orders' : 'overview'
  )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [removing, setRemoving] = useState<MenuItem | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [draft, setDraft] = useState<RestaurantState['settings'] | null>(null)
  const modalOpen = Boolean(editing || removing)
  useEffect(() => {
    if (!modalOpen) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = document.querySelector<HTMLElement>('.ad-modal')
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]') ?? []
      ).filter((element) => !element.hasAttribute('disabled'))
    focusable()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (saving.current) return
        setEditing(null)
        setRemoving(null)
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [modalOpen])
  const settings = draft ?? state.settings
  const pending = state.reservations.filter((item) => item.status === 'Pending')
  const menu = state.menu.filter(
    (item) =>
      item.kind === tab &&
      `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())
  )
  const reservations = state.reservations.filter(
    (item) =>
      (filter === 'All' || item.status === filter) &&
      `${item.id} ${item.name} ${item.email} ${item.phone} ${item.tableName ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const act = async (operation: () => Promise<unknown>, message: string) => {
    if (saving.current) return false
    saving.current = true
    setBusy(true)
    try {
      await operation()
      setError('')
      setNotice(message)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save changes. Please try again.')
      setNotice('')
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const navigate = (next: string) => {
    if (saving.current) return
    setTab(next)
    setSearch('')
    setFilter('All')
    setNotice('')
    setError('')
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (photoBusy || !state.loaded) return
    if (
      editing &&
      (await act(
        () =>
          saveMenuItem({
            ...editing,
            name: editing.name.trim(),
            category: editing.kind === 'dessert' ? 'Desserts' : editing.category.trim(),
          }),
        'Menu item saved. Your public menu is updated.'
      ))
    )
      setEditing(null)
  }
  const stats = [
    {
      label: 'Menu items',
      value: state.menu.length,
      detail: `${state.menu.filter((item) => item.available).length} available on the website`,
      icon: UtensilsCrossed,
      tab: 'food',
    },
    {
      label: 'Food & desserts',
      value: state.menu.filter((item) => item.kind !== 'drink').length,
      detail: 'Crafted for every appetite',
      icon: CakeSlice,
      tab: 'dessert',
    },
    {
      label: 'Drinks',
      value: state.menu.filter((item) => item.kind === 'drink').length,
      detail: 'Something worth toasting',
      icon: Wine,
      tab: 'drink',
    },
    {
      label: 'Pending requests',
      value: pending.length,
      detail: `${state.reservations.length} total reservations`,
      icon: CalendarDays,
      tab: 'reservations',
    },
  ]
  const reservationTable = (rows: Reservation[]) => (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            <th>Guest</th>
            <th>Date & time</th>
            <th>Party</th>
            <th>Table</th>
            <th>Status</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
                <small>{item.email}</small>
                <small>{item.phone}</small>
                {item.specialRequests && <p className="ad-request">{item.specialRequests}</p>}
                {item.cancellationReason && (
                  <p className="ad-request">Cancellation: {item.cancellationReason}</p>
                )}
              </td>
              <td>
                {item.date}
                <small>
                  {item.time}–{item.endTime} WAT
                </small>
                {item.expiresAt && (
                  <small>
                    Arrival deadline:{' '}
                    {new Date(item.expiresAt).toLocaleTimeString('en-NG', {
                      timeZone: 'Africa/Lagos',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    WAT
                  </small>
                )}
              </td>
              <td>{item.guests} guests</td>
              <td>
                <strong>{item.tableName ?? 'Unassigned'}</strong>
                {['Pending', 'Confirmed'].includes(item.status) && (
                  <select
                    aria-label={`Assign table for ${item.name}`}
                    value={item.tableId ?? ''}
                    disabled={busy || !state.loaded}
                    onChange={(event) => {
                      const tableId = event.target.value
                      if (!tableId) return
                      void act(async () => {
                        await apiRequest(`/api/admin/reservations/${item.id}/table`, {
                          method: 'PATCH',
                          body: JSON.stringify({ tableId }),
                        })
                        await refreshRestaurant()
                      }, 'Table assigned.')
                    }}
                  >
                    <option value="">Assign table</option>
                    {state.booking.tables
                      .filter((table) => table.active)
                      .map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name} · {table.seats} seats
                        </option>
                      ))}
                  </select>
                )}
              </td>
              <td>
                <span className={statusClass(item.status)}>
                  {item.status === 'Confirmed' ? 'Confirmed · arrived' : item.status}
                </span>
                {item.paidAmount && (
                  <small>Paid {formatPrice(item.paidAmount / 100)} · reservation fee</small>
                )}
                {item.paymentReference && <small>Payment: {item.paymentReference}</small>}
              </td>
              <td>
                <label className="ad-sr" htmlFor={`status-${item.id}`}>
                  Status for {item.name}
                </label>
                <select
                  id={`status-${item.id}`}
                  disabled={busy || !state.loaded || item.status !== 'Pending'}
                  value={item.status}
                  onChange={(e) =>
                    act(
                      () => setReservationStatus(item.id, e.target.value as Reservation['status']),
                      'Reservation status updated.'
                    )
                  }
                >
                  <option>Pending</option>
                  <option value="Confirmed">Confirm arrival</option>
                  <option value="Cancelled">Cancel (full refund)</option>
                  <option disabled>Expired</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="ad-empty">
          <CalendarDays size={30} />
          <h3>No reservations here yet</h3>
          <p>Requests from the public reservation form appear here.</p>
          <Link href="/#reservations" className="ad-secondary">
            Open reservation form <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </div>
  )

  return (
    <div className="ad-shell">
      <Head title="Restaurant Admin" />
      <aside className="ad-sidebar">
        <Link href="/" className="ad-brand">
          <span>
            <IcebergLogo className="h-6 w-6" />
          </span>
          <div>
            IceBerg<small>RESTAURANT MANAGEMENT</small>
          </div>
        </Link>
        <p className="ad-nav-label">WORKSPACE</p>
        <nav aria-label="Admin navigation">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={19} />
              {label}
              {id === 'reservations' && pending.length > 0 && <b>{pending.length}</b>}
            </button>
          ))}
        </nav>
        <div className="ad-side-bottom">
          <div className="ad-local">
            <span className="ad-dot" /> Administrator
            <p>
              Changes are saved to your database. Customers can browse and reserve without an
              account.
            </p>
          </div>
          <Link href="/" className="ad-preview">
            View restaurant <ArrowUpRight size={17} />
          </Link>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-topbar">
          <div>
            <span className="ad-muted">Workspace</span>
            <span className="ad-slash">/</span>
            {tabs.find((item) => item.id === tab)?.label}
          </div>
          <div className="ad-top-right">
            <ReservationNotifications
              openOrders={() => navigate('orders')}
              openReservation={(id) => {
                navigate('reservations')
                setSearch(id)
                setFilter('All')
              }}
            />
            <AsyncButton
              pending={Boolean(busy)}
              className="ad-text-button"
              disabled={busy}
              onClick={() => {
                void act(logoutAdmin, 'Signed out.')
              }}
            >
              Sign out <LogOut size={17} />
            </AsyncButton>
            <span className="ad-badge green">
              <span className="ad-dot" /> Secure admin
            </span>
            <span className="ad-avatar">IB</span>
          </div>
        </header>
        <main className="ad-content">
          <div className="ad-page-heading">
            <div>
              <p className="ad-eyebrow">ICEBERG CONTROL ROOM</p>
              <h1>
                {tab === 'overview'
                  ? 'Restaurant overview'
                  : tabs.find((item) => item.id === tab)?.label}
              </h1>
              <p className="ad-muted">
                {tab === 'overview'
                  ? 'Review reservations, menu availability and recent activity.'
                  : tab === 'reservations'
                    ? 'Confirm arrival when guests check in. Unattended bookings expire 30 minutes after the reserved time (WAT).'
                    : tab === 'payments'
                      ? 'Choose checkout providers and track reservation receipts and refunds.'
                      : tab === 'orders'
                        ? 'Receive dine-in orders and keep your kitchen and service team in sync.'
                        : tab === 'security'
                          ? 'Protect your administrator account and manage sign-in access.'
                          : tab === 'settings'
                            ? 'Edit contact details, opening hours and homepage text.'
                            : 'Add menu items, update prices and control availability.'}
              </p>
            </div>
            {['food', 'drink', 'dessert'].includes(tab) && (
              <AsyncButton
                pending={Boolean(busy)}
                className="ad-primary"
                disabled={busy || !state.loaded}
                onClick={() => {
                  setError('')
                  setEditing(newItem(tab as MenuItem['kind']))
                }}
              >
                <Plus size={18} />
                Add {tab === 'drink' ? 'drink' : tab === 'dessert' ? 'dessert' : 'food'}
              </AsyncButton>
            )}
          </div>
          {notice && (
            <div className="ad-notice" role="status">
              <Check size={18} />
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="ad-error" role="alert">
              {error}
            </div>
          )}
          {!state.loaded && !state.error && (
            <LoadingSkeleton label="Loading restaurant dashboard..." cards count={6} />
          )}
          {state.loaded && (
            <div>
              {tab === 'specials' && <SpecialsAdmin />}
              {tab === 'overview' && (
                <>
                  <div className="ad-stats">
                    {stats.map(({ label, value, detail, icon: Icon, tab: target }) => (
                      <button className="ad-stat" key={label} onClick={() => navigate(target)}>
                        <div className="ad-stat-top">
                          {label}
                          <span>
                            <Icon size={19} />
                          </span>
                        </div>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="ad-welcome">
                    <div>
                      <span className="ad-badge">MENU MANAGEMENT</span>
                      <h2>Keep your menu up to date.</h2>
                      <p>Add dishes and drinks, update prices, and mark unavailable items.</p>
                      <button className="ad-light" onClick={() => navigate('food')}>
                        Manage your menu <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="ad-welcome-art" aria-hidden="true">
                      <UtensilsCrossed size={78} strokeWidth={1} />
                    </div>
                  </div>
                  <section className="ad-panel">
                    <div className="ad-panel-heading">
                      <div>
                        <h2>Recent reservations</h2>
                        <p className="ad-muted">A seat at the table starts here.</p>
                      </div>
                      <button className="ad-text-button" onClick={() => navigate('reservations')}>
                        View all <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {reservationTable(state.reservations.slice(0, 5))}
                  </section>
                  <p className="ad-footnote">
                    Menu changes and reservations are shared through your database. This dashboard
                    refreshes automatically.
                  </p>
                </>
              )}
              {['food', 'drink', 'dessert'].includes(tab) && (
                <section className="ad-panel">
                  <div className="ad-toolbar">
                    <label className="ad-search">
                      <Search size={18} />
                      <input
                        aria-label="Search menu"
                        placeholder="Search by name or category…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <span className="ad-muted">{menu.length} items</span>
                    <Link className="ad-text-button" href="/full-menu">
                      Preview menu <ArrowUpRight size={16} />
                    </Link>
                  </div>
                  <div className="ad-table-wrap">
                    <table className="ad-table">
                      <thead>
                        <tr>
                          <th>Menu item</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Visibility</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menu.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="ad-item-cell">
                                {item.image ? (
                                  <img src={item.image} alt="" />
                                ) : (
                                  <span className="ad-item-placeholder">
                                    <UtensilsCrossed size={20} />
                                  </span>
                                )}
                                <div>
                                  <strong>{item.name}</strong>
                                  <small>{item.description}</small>
                                  {item.popular && <span className="ad-popular">★ Popular</span>}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="ad-category">{item.category}</span>
                            </td>
                            <td className="ad-price">{formatPrice(item.price)}</td>
                            <td>
                              <AsyncButton
                                pending={Boolean(busy)}
                                className={item.available ? 'ad-badge green' : 'ad-badge neutral'}
                                disabled={busy || !state.loaded}
                                onClick={() =>
                                  act(
                                    () => saveMenuItem({ ...item, available: !item.available }),
                                    item.available
                                      ? 'Item hidden from the public menu.'
                                      : 'Item is now available.'
                                  )
                                }
                                aria-label={`${item.available ? 'Hide' : 'Show'} ${item.name}`}
                              >
                                {item.available ? <Eye size={14} /> : <EyeOff size={14} />}
                                {item.available ? 'Available' : 'Hidden'}
                              </AsyncButton>
                            </td>
                            <td>
                              <div className="ad-actions">
                                <AsyncButton
                                  pending={Boolean(busy)}
                                  aria-label={`Edit ${item.name}`}
                                  disabled={busy}
                                  onClick={() => {
                                    setError('')
                                    setEditing({ ...item })
                                  }}
                                >
                                  <Pencil size={16} />
                                </AsyncButton>
                                <AsyncButton
                                  pending={Boolean(busy)}
                                  className="ad-danger"
                                  disabled={busy}
                                  aria-label={`Delete ${item.name}`}
                                  onClick={() => setRemoving(item)}
                                >
                                  <Trash2 size={16} />
                                </AsyncButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {menu.length === 0 && (
                      <div className="ad-empty">
                        <UtensilsCrossed size={30} />
                        <h3>
                          {search ? 'No matching items' : 'Make room for something delicious'}
                        </h3>
                        <p>
                          {search
                            ? 'Try a different name or category.'
                            : 'Add your first item to this part of the menu.'}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {tab === 'security' && <SecurityAdmin />}
              {tab === 'payments' && <PaymentsAdmin />}
              {tab === 'orders' && (
                <>
                  <TableSessionsAdmin />
                  <OrdersAdmin />
                </>
              )}
              {tab === 'reservations' && (
                <>
                  <TablesAdmin />
                  {state.refunds.length > 0 && (
                    <section className="ad-panel ad-tables-panel">
                      <h2>Cancellation refunds</h2>
                      <p>
                        Restaurant cancellations receive a full refund. Guest cancellations follow
                        the fee shown before they cancel. Pending refunds are not yet processed;
                        uncertain or failed requests need review with the original payment provider.
                      </p>
                      {state.refunds.map((refund) => (
                        <div key={refund.reference} className="ad-table-editor">
                          <div>
                            <strong>{refund.reference}</strong>
                            <p>
                              Refund {formatPrice(refund.amount / 100)} · fee{' '}
                              {formatPrice(refund.feeAmount / 100)} · {refund.status}
                            </p>
                            {refund.note && <p>{refund.note}</p>}
                          </div>
                          {refund.status !== 'Processed' && (
                            <AsyncButton
                              pending={Boolean(busy)}
                              className="ad-secondary"
                              disabled={busy}
                              onClick={() =>
                                void act(async () => {
                                  await apiRequest(
                                    `/api/admin/refunds/${refund.reference}/reconcile`,
                                    {
                                      method: 'POST',
                                    }
                                  )
                                  await refreshRestaurant()
                                }, 'Refund status updated.')
                              }
                            >
                              Check refund status
                            </AsyncButton>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  {state.paymentReviews.length > 0 && (
                    <section className="ad-panel ad-tables-panel">
                      <h2>Payments needing refund review</h2>
                      <p>
                        A payment was verified but its table could not be secured. Review and refund
                        through the original payment provider dashboard; do not charge these guests
                        again.
                      </p>
                      {state.paymentReviews.map((payment) => (
                        <p key={payment.reference}>
                          <strong>{payment.reference}</strong> ({payment.provider}) ·{' '}
                          {formatPrice(payment.amount / 100)} · {payment.reason}
                        </p>
                      ))}
                    </section>
                  )}
                  <section className="ad-panel">
                    <div className="ad-toolbar">
                      <label className="ad-search">
                        <Search size={18} />
                        <input
                          aria-label="Search reservations"
                          placeholder="Search guests, email or phone…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter reservation status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {['All', 'Pending', 'Confirmed', 'Expired', 'Cancelled'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      <span className="ad-muted">{reservations.length} requests</span>
                    </div>
                    {reservationTable(reservations)}
                    <p className="ad-footnote ad-panel-note">
                      Status changes are saved to the database. No email or SMS is sent.
                    </p>
                  </section>
                </>
              )}
              {tab === 'settings' && (
                <form
                  className="ad-panel ad-settings"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (await act(() => saveSettings(settings), 'Website settings saved.'))
                      setDraft(null)
                  }}
                >
                  <h2>Homepage & restaurant details</h2>
                  <p className="ad-muted">These details are connected to your public homepage.</p>
                  <p className="ad-muted">
                    Opening hours are managed under Reservations → Tables & reservation hours.
                  </p>
                  <div className="ad-form-grid">
                    {(Object.keys(settings) as (keyof typeof settings)[]).map((key) => (
                      <label
                        key={key}
                        className={key === 'heroDescription' || key === 'address' ? 'ad-wide' : ''}
                      >
                        <span>
                          {
                            {
                              heroTitle: 'Hero title',
                              heroSubtitle: 'Hero subtitle',
                              heroDescription: 'Hero description',
                              address: 'Restaurant address',
                              phone: 'Phone number',
                              email: 'Contact email',
                              weekdayHours: 'Weekday opening hours',
                              weekendHours: 'Weekend opening hours',
                              sundayHours: 'Sunday opening hours',
                            }[key]
                          }
                        </span>
                        {key === 'heroDescription' ? (
                          <textarea
                            required
                            disabled={busy || !state.loaded}
                            rows={3}
                            value={settings[key]}
                            onChange={(e) => setDraft({ ...settings, [key]: e.target.value })}
                          />
                        ) : (
                          <input
                            required
                            disabled={busy || !state.loaded}
                            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                            readOnly={['weekdayHours', 'weekendHours', 'sundayHours'].includes(key)}
                            value={settings[key]}
                            onChange={(e) => setDraft({ ...settings, [key]: e.target.value })}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <AsyncButton
                    pending={Boolean(busy)}
                    className="ad-primary"
                    type="submit"
                    disabled={busy || !state.loaded}
                  >
                    <Check size={17} />
                    {busy ? 'Saving…' : 'Save website settings'}
                  </AsyncButton>
                </form>
              )}
              {tab === 'subscribers' && (
                <section className="ad-panel">
                  <div className="ad-toolbar">
                    <label className="ad-search">
                      <Search size={18} />
                      <input
                        aria-label="Search newsletter subscribers"
                        placeholder="Search email…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <span className="ad-muted">{state.subscribers.length} subscribers</span>
                  </div>
                  <div className="ad-table-wrap">
                    <table className="ad-table">
                      <thead>
                        <tr>
                          <th>Email address</th>
                          <th>Subscribed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.subscribers
                          .filter((subscriber) =>
                            subscriber.email.toLowerCase().includes(search.toLowerCase())
                          )
                          .map((subscriber) => (
                            <tr key={subscriber.id}>
                              <td>{subscriber.email}</td>
                              <td>
                                {new Date(subscriber.createdAt).toLocaleString('en-NG', {
                                  timeZone: 'Africa/Lagos',
                                })}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {state.subscribers.length === 0 && (
                      <div className="ad-empty">
                        <Mail size={30} />
                        <h3>No subscribers yet</h3>
                        <p>Newsletter signups from the homepage appear here.</p>
                      </div>
                    )}
                  </div>
                  <p className="ad-footnote ad-panel-note">
                    Email addresses are saved here. Sending newsletters requires an email service.
                  </p>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      {editing && (
        <div
          className="ad-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null)
          }}
        >
          <section
            className="ad-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-title"
          >
            <div className="ad-panel-heading">
              <div>
                <p className="ad-eyebrow">MENU EDITOR</p>
                <h2 id="item-title">
                  {state.menu.some((item) => item.id === editing.id)
                    ? 'Edit menu item'
                    : 'Something new for the menu'}
                </h2>
              </div>
              <AsyncButton
                pending={false}
                className="ad-icon"
                aria-label="Close editor"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                <X size={21} />
              </AsyncButton>
            </div>
            <form onSubmit={save}>
              <fieldset disabled={busy} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
                <div className="ad-form-grid">
                  <label className="ad-wide">
                    <span>Item name</span>
                    <input
                      autoFocus
                      required
                      maxLength={100}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={editing.kind}
                      onChange={(e) => {
                        const kind = e.target.value as MenuItem['kind']
                        setEditing({
                          ...editing,
                          kind,
                          category:
                            kind === 'dessert'
                              ? 'Desserts'
                              : kind === 'drink'
                                ? 'Cocktails'
                                : 'Mains',
                        })
                      }}
                    >
                      <option value="food">Food</option>
                      <option value="drink">Drink</option>
                      <option value="dessert">Dessert</option>
                    </select>
                  </label>
                  <label>
                    <span>Category</span>
                    <input
                      required
                      list="menu-categories"
                      readOnly={editing.kind === 'dessert'}
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    />
                    <datalist id="menu-categories">
                      {[
                        ...new Set(
                          state.menu
                            .filter((item) => item.kind === editing.kind)
                            .map((item) => item.category)
                        ),
                      ].map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    <span>Price (NGN)</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editing.price}
                      onChange={(e) => setEditing({ ...editing, price: e.target.valueAsNumber })}
                    />
                  </label>
                  <MenuPhotoField
                    key={editing.id}
                    value={editing.image}
                    onChange={(image) =>
                      setEditing((current) =>
                        current?.id === editing.id ? { ...current, image } : current
                      )
                    }
                    onBusyChange={setPhotoBusy}
                  />
                  <label className="ad-wide">
                    <span>Description / what’s included</span>
                    <textarea
                      required
                      rows={4}
                      placeholder="Describe the item, its ingredients, portion size, and what is included."
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    />
                  </label>
                  <label className="ad-check">
                    <input
                      type="checkbox"
                      checked={editing.available}
                      onChange={(e) => setEditing({ ...editing, available: e.target.checked })}
                    />
                    Available on website
                  </label>
                  <label className="ad-check">
                    <input
                      type="checkbox"
                      checked={editing.popular}
                      onChange={(e) => setEditing({ ...editing, popular: e.target.checked })}
                    />
                    Mark as popular
                  </label>
                </div>
                {error && (
                  <p className="ad-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="ad-modal-footer">
                  <AsyncButton
                    pending={false}
                    type="button"
                    className="ad-secondary"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </AsyncButton>
                  <AsyncButton
                    pending={Boolean(photoBusy || busy)}
                    className="ad-primary"
                    type="submit"
                    disabled={photoBusy || busy || !state.loaded}
                  >
                    <Check size={17} />
                    {busy ? 'Saving…' : photoBusy ? 'Preparing photo…' : 'Save menu item'}
                  </AsyncButton>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
      {removing && (
        <div className="ad-overlay">
          <section
            className="ad-modal ad-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <Trash2 size={28} className="ad-danger" />
            <h2 id="delete-title">Delete {removing.name}?</h2>
            <p className="ad-muted">This will remove it from both public menus.</p>
            <div className="ad-modal-footer">
              <AsyncButton
                pending={false}
                className="ad-secondary"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >
                Keep item
              </AsyncButton>
              <AsyncButton
                pending={Boolean(busy)}
                className="ad-delete"
                disabled={busy}
                onClick={async () => {
                  if (await act(() => deleteMenuItem(removing.id), 'Menu item deleted.'))
                    setRemoving(null)
                }}
              >
                Delete item
              </AsyncButton>
            </div>
            {error && (
              <p role="alert" className="ad-error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
