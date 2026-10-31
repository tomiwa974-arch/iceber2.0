import { useRestaurant, restaurantNow } from '~/lib/restaurant_store'
import { dailySlots } from '../../shared/booking_slots'

export default function ReservationTime({
  date,
  value,
  onChange,
}: {
  date: string
  value: string
  onChange: (value: string) => void
}) {
  const { booking } = useRestaurant()
  const weekday = date ? new Date(`${date}T12:00:00Z`).getUTCDay() || 7 : 0
  const slots = dailySlots(
    booking.hours.find((day) => day.day === weekday),
    booking.slotIntervalMinutes
  ).filter((slot) => Date.parse(`${date}T${slot.start}:00+01:00`) > restaurantNow())
  return (
    <select
      id="reservation-time"
      name="time"
      aria-label="Reservation time"
      required
      disabled={!date}
      value={slots.some((slot) => slot.start === value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
    >
      <option value="" disabled>
        {!date
          ? 'Choose a date first'
          : slots.length
            ? 'Choose a reservation slot'
            : 'No reservation slots on this date'}
      </option>
      {slots.map((slot) => (
        <option key={slot.start} value={slot.start}>
          {slot.start}–{slot.end} WAT
        </option>
      ))}
    </select>
  )
}
