import { useEffect, useState } from 'react'
import { apiRequest, useRestaurant, type TableAvailability } from '~/lib/restaurant_store'

export default function GuestCount({
  date,
  time,
  value,
  onChange,
}: {
  date: string
  time: string
  value: string
  onChange: (value: string) => void
}) {
  const { booking } = useRestaurant()
  const key = `${date}|${time}`
  const [result, setResult] = useState<{ key: string; options: number[]; error?: string } | null>(
    null
  )
  useEffect(() => {
    if (!date || !time) return
    const controller = new AbortController()
    async function load() {
      try {
        const availability = await apiRequest<TableAvailability>(
          `/api/reservations/availability?${new URLSearchParams({ date, time, guests: '1' })}`,
          { signal: controller.signal }
        )
        if (!controller.signal.aborted) setResult({ key, options: availability.guestOptions })
      } catch {
        if (!controller.signal.aborted)
          setResult({
            key,
            options: [],
            error: 'Could not check capacity. Please try another time or refresh.',
          })
      }
    }
    void load()
    const timer = window.setInterval(load, 15000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [date, time, key])
  const maximum = Math.max(
    0,
    ...booking.tables.filter((table) => table.active).map((table) => table.seats)
  )
  const options =
    date && time
      ? result?.key === key
        ? result.options
        : []
      : Array.from({ length: maximum }, (_, index) => index + 1)
  const selected = options.includes(Number(value)) ? value : ''
  return (
    <>
      <select
        id="reservation-guests"
        name="guests"
        aria-label="Number of guests"
        required
        aria-busy={Boolean(date && time && result?.key !== key)}
        disabled={Boolean(date && time && result?.key !== key)}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      >
        <option value="" disabled>
          {options.length
            ? 'Choose party size'
            : date && time && result?.key !== key
              ? 'Checking capacity…'
              : 'No tables available'}
        </option>
        {options.map((number) => (
          <option key={number} value={number}>
            {number} {number === 1 ? 'Guest' : 'Guests'}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500">
        Party sizes match the tables available{date && time ? ' for this time' : ''}.
      </p>
      {result?.key === key && result.error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {result.error}
        </p>
      )}
    </>
  )
}
