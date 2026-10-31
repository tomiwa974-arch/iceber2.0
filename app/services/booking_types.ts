export type DiningTable = { id: string; name: string; seats: number; active: boolean }
export type BookingDay = { day: number; open: string; close: string; closed: boolean }
export type BookingConfiguration = {
  tables: DiningTable[]
  hours: BookingDay[]
  durationMinutes: number
  cleanupMinutes: number
  slotIntervalMinutes: number
}
export type TableAvailability = {
  date: string
  time: string
  endTime: string
  tables: (DiningTable & { available: boolean })[]
  message: string
  guestOptions: number[]
}
