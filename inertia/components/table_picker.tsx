import LoadingSkeleton from '~/components/loading_skeleton'
import { useEffect, useState } from 'react'
import { apiRequest, useRestaurant, type TableAvailability } from '~/lib/restaurant_store'

export default function TablePicker({
  date,
  time,
  guests,
  value,
  onChange,
  refreshKey,
}: {
  date: string
  time: string
  guests: string
  value: string
  onChange: (id: string) => void
  refreshKey: number
}) {
  const { booking } = useRestaurant()
  const [result, setResult] = useState<{
    key: string
    availability?: TableAvailability
    error?: string
  } | null>(null)
  const key = `${date}|${time}|${guests}|${refreshKey}`
  useEffect(() => {
    if (!date || !time) return
    const controller = new AbortController()
    async function load() {
      try {
        const availability = await apiRequest<TableAvailability>(
          `/api/reservations/availability?${new URLSearchParams({ date, time, guests })}`,
          { signal: controller.signal }
        )
        if (!controller.signal.aborted) setResult({ key, availability })
      } catch (cause) {
        if (!controller.signal.aborted)
          setResult({
            key,
            error: cause instanceof Error ? cause.message : 'Unable to check tables.',
          })
      }
    }
    void load()
    const interval = window.setInterval(load, 15000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [date, time, guests, key])
  const current = result?.key === key ? result : null
  const availability = current?.availability
  const available = availability?.tables.filter((table) => table.available) ?? []
  const dayNumber = date ? new Date(`${date}T12:00:00Z`).getUTCDay() || 7 : 0
  const hours = booking.hours.find((day) => day.day === dayNumber)
  return (
    <div className="md:col-span-2 border border-gray-200 rounded-xl p-5">
      <h3 className="font-semibold">Choose your table</h3>
      <p className="text-sm text-gray-600 mt-2">
        Availability is checked automatically for your chosen date, time and party size. Each
        booking includes two hours for dining, followed by 10 minutes for cleanup before the next
        guests.
      </p>
      {hours && (
        <p className="text-sm mt-2">
          Reservation hours: {hours.closed ? 'Closed' : `${hours.open}–${hours.close} WAT`}
        </p>
      )}
      {!date || !time ? (
        <p className="mt-3 text-sm">Choose a date, time and party size to see available tables.</p>
      ) : !current ? (
        <LoadingSkeleton label="Checking available tables..." cards />
      ) : current.error ? (
        <p role="alert" className="text-red-600 mt-3">
          {current.error}
        </p>
      ) : availability?.message ? (
        <p role="status" className="mt-3 text-amber-800">
          {availability.message}
        </p>
      ) : (
        <>
          <p role="status" className="mt-3 text-sm">
            {available.length} of {availability?.tables.length} tables available for your party ·{' '}
            {time}–{availability?.endTime} WAT
          </p>
          {available.length === 0 && (
            <p className="mt-3">
              No suitable tables available. Try another time or party size, or contact the
              restaurant.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {availability?.tables.map((table) => (
              <label
                key={table.id}
                className={`border rounded-lg p-3 ${table.available ? 'cursor-pointer' : 'opacity-50'} ${value === table.id && table.available ? 'border-gray-900 bg-gray-100' : 'border-gray-200'}`}
              >
                <input
                  type="radio"
                  name="tableId"
                  required
                  disabled={!table.available}
                  checked={value === table.id && table.available}
                  value={table.id}
                  onChange={() => onChange(table.id)}
                />{' '}
                <strong>{table.name}</strong>
                <span className="block text-sm mt-1">
                  Up to {table.seats} guests ·{' '}
                  {table.available
                    ? 'Available'
                    : table.seats < Number(guests)
                      ? 'Party too large'
                      : 'Unavailable at this time'}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
