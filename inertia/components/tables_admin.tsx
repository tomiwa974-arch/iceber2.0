import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import { useState } from 'react'
import {
  apiRequest,
  refreshRestaurant,
  useRestaurant,
  type BookingDay,
  type DiningTable,
} from '~/lib/restaurant_store'

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function TableEditor({
  table,
  save,
  busy,
}: {
  table: DiningTable
  save: (operation: () => Promise<unknown>) => Promise<void>
  busy: boolean
}) {
  const [name, setName] = useState(table.name)
  const [seats, setSeats] = useState(table.seats)
  return (
    <form
      className="ad-table-editor"
      onSubmit={(event) => {
        event.preventDefault()
        void save(() =>
          apiRequest(`/api/admin/tables/${table.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, seats, active: table.active }),
          })
        )
      }}
    >
      <label>
        Table name (optional)
        <input
          placeholder="Leave blank for Table 1, Table 2..."
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Seats
        <input
          type="number"
          min={1}
          max={8}
          required
          value={seats}
          onChange={(event) => setSeats(Number(event.target.value))}
        />
      </label>
      <span className={`ad-badge ${table.active ? 'green' : 'amber'}`}>
        {table.active ? 'Active' : 'Retired'}
      </span>
      <AsyncButton pending={Boolean(busy)} className="ad-secondary" disabled={busy}>
        Save table
      </AsyncButton>
      <AsyncButton
        pending={Boolean(busy)}
        type="button"
        className="ad-text-button"
        disabled={busy}
        onClick={() =>
          void save(() =>
            apiRequest(`/api/admin/tables/${table.id}`, {
              method: 'PUT',
              body: JSON.stringify({ name: table.name, seats: table.seats, active: !table.active }),
            })
          )
        }
      >
        {table.active ? 'Retire' : 'Restore'}
      </AsyncButton>
    </form>
  )
}

export default function TablesAdmin() {
  const { booking, reservations, loaded } = useRestaurant()
  const [count, setCount] = useState<string | null>(null)
  const [hours, setHours] = useState<BookingDay[] | null>(null)
  const [slotInterval, setSlotInterval] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const active = booking.tables.filter((table) => table.active)
  const schedule = hours ?? booking.hours
  async function save(operation: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      await refreshRestaurant()
      setCount(null)
      setHours(null)
      setSlotInterval(null)
      setNotice('Table availability is up to date.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  if (!loaded) return <LoadingSkeleton label="Loading tables and reservation hours..." />
  return (
    <section className="ad-panel ad-tables-panel">
      <h2>Tables & reservation hours</h2>
      <p className="ad-muted">
        {active.length} active tables. Each booking holds one named table for two hours of dining
        plus 10 minutes of cleanup. Default names and seat counts can be edited below.
      </p>
      <p className="ad-panel-note">
        Availability is checked automatically on the guest booking form. A booking immediately holds
        its table; cancellation or the 30-minute no-show deadline releases it. Mark guests as
        arrived when they check in so their table stays held through the original two-hour dining
        window and 10-minute cleanup. No manual availability checks are needed.
      </p>
      {error && (
        <p role="alert" className="ad-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="ad-notice">
          {notice}
        </p>
      )}
      {reservations.some(
        (item) => !item.tableId && ['Pending', 'Confirmed'].includes(item.status)
      ) && (
        <p className="ad-panel-note">
          Some earlier bookings have no table. Assign them below; until assigned, their overlapping
          times are held across all tables to avoid clashes.
        </p>
      )}
      <form
        className="ad-table-count"
        onSubmit={(event) => {
          event.preventDefault()
          void save(() =>
            apiRequest('/api/admin/tables/count', {
              method: 'PUT',
              body: JSON.stringify({ count: Number(count ?? active.length) }),
            })
          )
        }}
      >
        <label>
          Number of active tables
          <input
            type="number"
            min={0}
            max={200}
            required
            value={count ?? active.length}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <AsyncButton pending={Boolean(busy)} className="ad-primary" disabled={busy || !loaded}>
          Apply table count
        </AsyncButton>
      </form>
      <p className="ad-muted">
        Increasing adds numbered tables with 8 seats each; adjust each table to its actual capacity.
        Reducing retires tables without upcoming bookings and keeps booking history.
      </p>
      <details className="ad-booking-hours">
        <summary>Manage tables ({active.length} active)</summary>
        <p className="ad-muted">
          Custom names are optional. Clear a name and save to use an available Table 1, Table 2...
          label.
        </p>
        <div className="ad-table-editors">
          {booking.tables.map((table) => (
            <TableEditor
              key={`${table.id}-${table.name}-${table.seats}-${table.active}`}
              table={table}
              save={save}
              busy={busy || !loaded}
            />
          ))}
        </div>
      </details>
      <details className="ad-booking-hours">
        <summary>Set opening hours for reservations (WAT)</summary>
        <p className="ad-muted">
          Two-hour bookings must finish by closing. Hours apply on the same calendar day; mark a day
          closed if reservations are unavailable.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save(() =>
              apiRequest('/api/admin/booking-hours', {
                method: 'PUT',
                body: JSON.stringify({
                  hours: schedule,
                  slotIntervalMinutes: slotInterval ?? booking.slotIntervalMinutes,
                }),
              })
            )
          }}
        >
          <label>
            Reservation start interval
            <select
              aria-label="Reservation start interval"
              value={slotInterval ?? booking.slotIntervalMinutes}
              onChange={(event) => setSlotInterval(Number(event.target.value))}
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={120}>Every two hours</option>
            </select>
          </label>
          <p className="ad-muted">
            Slots start at each day&apos;s opening time. Every reservation includes two hours of
            dining and 10 minutes of cleanup, and occupied tables cannot be booked for overlapping
            slots. Existing bookings and active checkout holds keep their accepted start times.
          </p>
          {schedule.map((day) => (
            <div key={day.day} className="ad-hours-row">
              <strong>{days[day.day - 1]}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={(event) =>
                    setHours(
                      schedule.map((item) =>
                        item.day === day.day ? { ...item, closed: event.target.checked } : item
                      )
                    )
                  }
                />{' '}
                Closed
              </label>
              <label>
                Opens
                <input
                  type="time"
                  required
                  disabled={day.closed}
                  value={day.open}
                  onChange={(event) =>
                    setHours(
                      schedule.map((item) =>
                        item.day === day.day ? { ...item, open: event.target.value } : item
                      )
                    )
                  }
                />
              </label>
              <label>
                Closes
                <input
                  type="time"
                  required
                  disabled={day.closed}
                  value={day.close}
                  onChange={(event) =>
                    setHours(
                      schedule.map((item) =>
                        item.day === day.day ? { ...item, close: event.target.value } : item
                      )
                    )
                  }
                />
              </label>
            </div>
          ))}
          <AsyncButton pending={Boolean(busy)} className="ad-primary" disabled={busy || !loaded}>
            Save reservation hours
          </AsyncButton>
        </form>
      </details>
    </section>
  )
}
