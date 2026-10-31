import { dailySlots, SLOT_INTERVALS } from '#services/booking_slots'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import { effectiveStatus } from '#services/reservation_policy'
import type { BookingDay, DiningTable, TableAvailability } from '#services/booking_types'

export const DURATION_MINUTES = 120
export const CLEANUP_MINUTES = 10
export const TABLE_BLOCK_MINUTES = DURATION_MINUTES + CLEANUP_MINUTES
export const bookingStart = (date: string, time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: 'Africa/Lagos' })
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
function conflict(message: string): never {
  throw new Exception(message, { status: 409 })
}
export const diningTable = (row: any): DiningTable => ({
  id: row.id,
  name: row.name,
  seats: row.seats,
  active: Boolean(row.active),
})
export function hoursSummary(hours: BookingDay[], dayNumbers: number[]) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return dayNumbers
    .map((number) => {
      const day = hours.find((item) => item.day === number)!
      return `${labels[number - 1]}: ${day.closed ? 'Closed' : `${day.open}–${day.close}`}`
    })
    .join('; ')
}

export default class TableBooking {
  async lock(trx: TransactionClientContract) {
    // Every booking and table/schedule change takes this same stable lock first.
    // MySQL locking reads below see the latest committed booking, even under REPEATABLE READ.
    const row = await trx.from('booking_configuration').where('id', 1).forUpdate().first()
    if (!row) throw new Exception('Run the booking database migration first.', { status: 503 })
    return JSON.parse(row.hours) as BookingDay[]
  }

  async configuration(client: QueryClientContract = db.connection(), admin = false) {
    const row = await client.from('booking_configuration').where('id', 1).first()
    const query = client.from('dining_tables').orderBy('name')
    if (!admin) query.where('active', true)
    const tables = await query
    return {
      tables: tables.map(diningTable),
      hours: JSON.parse(row.hours) as BookingDay[],
      durationMinutes: DURATION_MINUTES,
      cleanupMinutes: CLEANUP_MINUTES,
      slotIntervalMinutes: row.slot_interval_minutes,
    }
  }

  validateWindow(
    date: string,
    time: string,
    hours: BookingDay[],
    slotIntervalMinutes = 60,
    enforceSlots = true
  ) {
    const start = bookingStart(date, time)
    if (!start.isValid || start.toISODate() !== date || start.toMillis() <= Date.now())
      return 'Choose a future date and time (WAT).'
    const day = hours.find((item) => item.day === start.weekday)
    if (!day || day.closed) return 'The restaurant is closed for reservations on this day.'
    if (
      minutes(time) < minutes(day.open) ||
      minutes(time) + TABLE_BLOCK_MINUTES > minutes(day.close)
    ) {
      return `Choose a time between ${day.open} and ${DateTime.fromFormat(day.close, 'HH:mm').minus({ minutes: TABLE_BLOCK_MINUTES }).toFormat('HH:mm')} WAT. Your two-hour dining time and 10-minute cleanup must finish by closing.`
    }
    if (enforceSlots && !dailySlots(day, slotIntervalMinutes).some((slot) => slot.start === time))
      return 'Choose one of the scheduled reservation times. Custom start times are not available.'
    return ''
  }

  async blockers(
    client: QueryClientContract,
    date: string,
    time: string,
    locking = false,
    ignoreId?: string,
    ignorePaymentReference?: string
  ) {
    // Include adjacent dates for legacy bookings crossing midnight.
    const start = bookingStart(date, time)
    const query = client
      .from('reservations')
      .whereBetween('date', [
        start.minus({ days: 1 }).toISODate()!,
        start.plus({ days: 1 }).toISODate()!,
      ])
      .whereIn('status', ['Pending', 'Confirmed'])
    if (locking) query.forUpdate()
    const rows = await query
    const now = Date.now()
    const holdsQuery = client
      .from('reservation_payments')
      .where('status', 'Pending')
      .where('hold_until', '>', now)
      .whereBetween('date', [
        start.minus({ days: 1 }).toISODate()!,
        start.plus({ days: 1 }).toISODate()!,
      ])
    if (locking) holdsQuery.forUpdate()
    const holds = await holdsQuery
    const activeHolds = holds.filter((row) => row.reference !== ignorePaymentReference)
    return [
      ...rows.filter((row) => {
        if (row.id === ignoreId || effectiveStatus(row, now) === 'Expired') return false
        const otherStart = bookingStart(row.date, row.time).toMillis()
        return (
          otherStart < start.plus({ minutes: TABLE_BLOCK_MINUTES }).toMillis() &&
          otherStart + TABLE_BLOCK_MINUTES * 60000 > start.toMillis()
        )
      }),
      ...activeHolds.filter((row) => {
        const otherStart = bookingStart(row.date, row.time).toMillis()
        return (
          otherStart < start.plus({ minutes: TABLE_BLOCK_MINUTES }).toMillis() &&
          otherStart + TABLE_BLOCK_MINUTES * 60000 > start.toMillis()
        )
      }),
    ]
  }

  async availability(date: string, time: string, guests: number): Promise<TableAvailability> {
    return db.transaction(async (trx) => {
      const config = await this.configuration(trx)
      const message = this.validateWindow(date, time, config.hours, config.slotIntervalMinutes)
      const blockers = message ? [] : await this.blockers(trx, date, time)
      const free = config.tables.filter(
        (table) => !blockers.some((row) => !row.table_id || row.table_id === table.id)
      )
      const maxGuests = message ? 0 : Math.max(0, ...free.map((table) => table.seats))
      return {
        guestOptions: Array.from({ length: maxGuests }, (_, index) => index + 1),
        date,
        time,
        endTime: bookingStart(date, time).plus({ minutes: DURATION_MINUTES }).toFormat('HH:mm'),
        message,
        tables: config.tables.map((table) => ({
          ...table,
          available:
            !message &&
            table.seats >= guests &&
            !blockers.some((row) => !row.table_id || row.table_id === table.id),
        })),
      }
    })
  }

  async reserve(
    trx: TransactionClientContract,
    date: string,
    time: string,
    guests: number,
    tableId: string,
    ignoreId?: string,
    ignorePaymentReference?: string
  ) {
    const hours = await this.lock(trx)
    const configuration = await trx.from('booking_configuration').where('id', 1).forUpdate().first()
    if (!ignoreId) {
      const message = this.validateWindow(
        date,
        time,
        hours,
        configuration.slot_interval_minutes,
        !ignorePaymentReference
      )
      if (message) throw new Exception(message, { status: 422 })
    }
    const table = await trx.from('dining_tables').where('id', tableId).forUpdate().first()
    if (!table || !table.active)
      conflict('This table is no longer available. Please choose another table.')
    if (table.seats < guests) conflict('Choose a table with enough seats for your party.')
    const blockers = await this.blockers(trx, date, time, true, ignoreId, ignorePaymentReference)
    if (blockers.some((row) => (!row.table_id && !ignoreId) || row.table_id === tableId))
      conflict(
        'This table has just been booked for an overlapping time. Please choose another table or time.'
      )
    return diningTable(table)
  }

  private async commitments(trx: TransactionClientContract) {
    const rows = await trx
      .from('reservations')
      .whereIn('status', ['Pending', 'Confirmed'])
      .forUpdate()
    const holds = await trx
      .from('reservation_payments')
      .where('status', 'Pending')
      .where('hold_until', '>', Date.now())
      .forUpdate()
    return [
      ...holds,
      ...rows.filter(
        (row) =>
          effectiveStatus(row) !== 'Expired' &&
          bookingStart(row.date, row.time).plus({ minutes: TABLE_BLOCK_MINUTES }).toMillis() >
            Date.now()
      ),
    ]
  }

  async setCount(count: number) {
    return db.transaction(async (trx) => {
      await this.lock(trx)
      const rows = await trx.from('dining_tables').orderBy('name').forUpdate()
      const active = rows.filter((row) => row.active)
      const commitments = await this.commitments(trx)
      if (count < active.length) {
        const removable = active.filter(
          (table) => !commitments.some((row) => !row.table_id || row.table_id === table.id)
        )
        if (removable.length < active.length - count)
          conflict(
            'These tables have upcoming bookings. Cancel or reassign those bookings before reducing the count.'
          )
        for (const table of removable.slice(0, active.length - count))
          await trx.from('dining_tables').where('id', table.id).update({ active: false })
      } else {
        const used = new Set(rows.map((row) => row.name.toLowerCase()))
        for (let i = active.length; i < count; i++) {
          let index = 1
          let name = `Table ${index}`
          while (used.has(name.toLowerCase())) {
            index++
            name = `Table ${index}`
          }
          used.add(name.toLowerCase())
          await trx
            .table('dining_tables')
            .insert({ id: randomUUID(), name, seats: 8, active: true })
        }
      }
      return this.configuration(trx, true)
    })
  }

  async updateTable(id: string, payload: { name?: string | null; seats: number; active: boolean }) {
    return db.transaction(async (trx) => {
      await this.lock(trx)
      const table = await trx.from('dining_tables').where('id', id).forUpdate().first()
      if (!table) throw new Exception('Table not found.', { status: 404 })
      const tables = await trx.from('dining_tables').forUpdate()
      let name = payload.name?.trim() ?? ''
      if (!name) {
        if (/^Table [1-9][0-9]*$/.test(table.name)) name = table.name
        else {
          const used = new Set(
            tables.filter((row) => row.id !== id).map((row) => row.name.toLowerCase())
          )
          let number = 1
          while (used.has(('Table ' + number).toLowerCase())) number++
          name = 'Table ' + number
        }
      }
      if (tables.some((row) => row.id !== id && row.name.toLowerCase() === name.toLowerCase()))
        conflict('Each table needs a unique name.')
      const commitments = await this.commitments(trx)
      if (
        commitments.some(
          (row) =>
            (!row.table_id || row.table_id === id) &&
            (!payload.active || payload.seats < row.guests)
        )
      )
        conflict('This change would affect an upcoming booking. Cancel or reassign it first.')
      await trx
        .from('dining_tables')
        .where('id', id)
        .update({ ...payload, name })
      return this.configuration(trx, true)
    })
  }

  async saveHours(hours: BookingDay[], slotIntervalMinutes?: number) {
    if (slotIntervalMinutes !== undefined && !SLOT_INTERVALS.includes(slotIntervalMinutes))
      throw new Exception('Choose a supported booking interval.', { status: 422 })
    if (
      new Set(hours.map((day) => day.day)).size !== 7 ||
      hours.some(
        (day) => !day.closed && minutes(day.close) - minutes(day.open) < TABLE_BLOCK_MINUTES
      )
    ) {
      throw new Exception(
        'Provide each day once, with at least two hours and 10 minutes between opening and closing. Overnight hours are not supported.',
        { status: 422 }
      )
    }
    return db.transaction(async (trx) => {
      await this.lock(trx)
      const commitments = await this.commitments(trx)
      if (
        commitments.some((row) => {
          const day = hours.find((item) => item.day === bookingStart(row.date, row.time).weekday)!
          return (
            day.closed ||
            minutes(row.time) < minutes(day.open) ||
            minutes(row.time) + TABLE_BLOCK_MINUTES > minutes(day.close)
          )
        })
      )
        conflict(
          'The new hours would exclude an existing booking. Cancel or reassign it before changing these hours.'
        )
      await trx
        .from('booking_configuration')
        .where('id', 1)
        .update({
          hours: JSON.stringify(hours),
          ...(slotIntervalMinutes !== undefined
            ? { slot_interval_minutes: slotIntervalMinutes }
            : {}),
        })
      return this.configuration(trx, true)
    })
  }
}
