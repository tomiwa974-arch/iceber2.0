import type { BookingDay } from '../app/services/booking_types.js'

export const SLOT_INTERVALS = [15, 30, 60, 120]
export function dailySlots(
  day: BookingDay | undefined,
  intervalMinutes: number,
  durationMinutes = 120,
  cleanupMinutes = 10
) {
  if (!day || day.closed || !SLOT_INTERVALS.includes(intervalMinutes)) return []
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const format = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  const slots: { start: string; end: string }[] = []
  for (
    let start = minutes(day.open);
    start + durationMinutes + cleanupMinutes <= minutes(day.close);
    start += intervalMinutes
  )
    slots.push({ start: format(start), end: format(start + durationMinutes) })
  return slots
}
