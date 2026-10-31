import env from '#start/env'
import { validEmailProof } from '#services/email_verification'
import { randomUUID } from 'node:crypto'
import TableBooking, { bookingStart, DURATION_MINUTES, hoursSummary } from '#services/table_booking'
import {
  effectiveStatus,
  reservationDeadline,
  reservationVisible,
  cancellationQuote,
} from '#services/reservation_policy'
import ReservationRefunds, { refundView } from '#services/reservation_refunds'
import { notifyDevices } from '#services/reservation_notifications'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { MenuItem, Reservation, RestaurantSettings } from '#services/restaurant_types'
import {
  appendSpecial,
  moveSpecial,
  removeSpecial,
  type DailySpecial,
} from '#services/daily_specials'

type Row = Record<string, any>
type Settings = RestaurantSettings
type MenuInput = Omit<MenuItem, 'image'> & { image?: string | null }
type SpecialInput = {
  id?: string
  title: string
  caption?: string | null
  image?: string | null
  price: number
  durationDays: number
}
export type ReservationInput = Omit<
  Reservation,
  'id' | 'status' | 'createdAt' | 'guests' | 'specialRequests'
> & {
  tableId: string
  guests: number
  specialRequests?: string | null
}

function notFound(subject: string): never {
  throw new Exception(`${subject} not found.`, { status: 404, code: 'E_ROW_NOT_FOUND' })
}

function menuItem(row: Row): MenuItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    category: row.category,
    kind: row.kind,
    image: row.image,
    popular: Boolean(row.popular),
    available: Boolean(row.available),
  }
}

function reservation(row: Row): Reservation {
  return {
    paymentReference: row.payment_reference ?? null,
    paidAmount: row.paid_amount ?? null,
    tableId: row.table_id ?? null,
    tableName: row.current_table_name ?? row.table_name ?? null,
    endTime: bookingStart(row.date, row.time).plus({ minutes: DURATION_MINUTES }).toFormat('HH:mm'),
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    date: row.date,
    time: row.time,
    guests: String(row.guests),
    specialRequests: row.special_requests,
    status: effectiveStatus(
      row as { status: string; date: string; time: string }
    ) as Reservation['status'],
    expiresAt: reservationDeadline(row.date, row.time),
    cancellationReason: row.cancellation_reason ?? '',
    arrivedAt: row.arrived_at ? new Date(row.arrived_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function special(row: Row): DailySpecial {
  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    image: row.image,
    price: Number(row.price),
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    durationDays: row.duration_days,
  }
}

function specialRow(post: DailySpecial) {
  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    image: post.image,
    price: post.price,
    starts_at: post.startsAt,
    ends_at: post.endsAt,
    duration_days: post.durationDays,
  }
}

export default class RestaurantService {
  private async state(client: QueryClientContract, admin: boolean) {
    const serverTime = Date.now()
    const query = client.from('menu_items').orderBy('sort_order').orderBy('id')
    if (!admin) query.where('available', true)
    const menuRows = await query
    const menu = menuRows.map(menuItem)
    const settingsRow = await client.from('restaurant_settings').where('id', 1).first()
    if (!settingsRow)
      throw new Exception('Run database migrations before opening the website.', { status: 503 })
    const settings: Settings = JSON.parse(settingsRow.payload)
    if (settings.heroDescription.includes('Our Michelin-starred chefs'))
      settings.heroDescription =
        'Explore our menu, discover current specials and reserve a table for your next visit.'
    for (const [key, sample] of Object.entries({
      address: '123 NTA road, Asaba, Delta State, Nigeria',
      phone: '07079621137',
      email: 'info@icebergrestaurant.com',
    })) {
      if (settings[key as keyof Settings] === sample) settings[key as keyof Settings] = ''
    }
    const specialQuery = client.from('daily_specials').orderBy('starts_at').orderBy('id')
    if (!admin) specialQuery.where('ends_at', '>', serverTime)
    const specialRows = await specialQuery
    const specials = specialRows.map(special)
    const booking = await new TableBooking().configuration(client, admin)
    settings.weekdayHours = hoursSummary(booking.hours, [1, 2, 3, 4])
    settings.weekendHours = hoursSummary(booking.hours, [5, 6])
    settings.sundayHours = hoursSummary(booking.hours, [7])
    return {
      menu,
      settings,
      specials,
      serverTime,
      booking,
      live: env.get('RESTAURANT_LIVE', false),
    }
  }

  async publicState() {
    return db.transaction((trx) => this.state(trx, false))
  }

  async adminState(userId: number) {
    return db.transaction(async (trx) => {
      const state = await this.state(trx, true)
      const reservationRows = await trx
        .from('reservations')
        .leftJoin('dining_tables', 'reservations.table_id', 'dining_tables.id')
        .select('reservations.*', 'dining_tables.name as current_table_name')
        .orderBy('reservations.created_at', 'desc')
      const now = Date.now()
      const reservations = reservationRows
        .filter((row) => reservationVisible(row, now))
        .map(reservation)
      const subscriberRows = await trx.from('newsletter_subscribers').orderBy('created_at', 'desc')
      const subscribers = subscriberRows.map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: new Date(row.created_at).toISOString(),
      }))
      const notifications = await trx
        .from('admin_notifications')
        .where((query) => {
          query
            .whereIn(
              'reservation_id',
              reservations.map((item) => item.id)
            )
            .orWhereExists((orders) => {
              orders
                .from('restaurant_orders')
                .select('id')
                .whereColumn('restaurant_orders.id', 'admin_notifications.order_id')
            })
        })
        .orderBy('created_at', 'desc')
        .limit(100)
      const reads = await trx.from('admin_notification_reads').where('user_id', userId)
      const read = new Set(reads.map((item) => item.notification_id))
      const paymentReviews = await trx
        .from('reservation_payments')
        .where('status', 'ReviewRequired')
        .orderBy('created_at', 'desc')
      const refundRows = await trx
        .from('reservation_refunds')
        .orderBy('created_at', 'desc')
        .limit(100)
      return {
        refunds: refundRows.map(refundView),
        paymentReviews: paymentReviews.map((row) => ({
          reference: row.reference,
          amount: row.amount,
          reason: row.review_reason,
          provider: row.provider,
        })),
        ...state,
        reservations,
        subscribers,
        notifications: notifications.map((item) => ({
          id: item.id,
          reservationId: item.reservation_id,
          orderId: item.order_id ?? null,
          message: item.message,
          createdAt: new Date(item.created_at).toISOString(),
          read: read.has(item.id),
        })),
      }
    })
  }

  async createMenu(payload: MenuInput) {
    return db.transaction(async (trx) => {
      // The singleton also serializes new IDs, so duplicate requests receive a clear conflict.
      await this.lock(trx)
      if (await trx.from('menu_items').where('id', payload.id).first()) {
        throw new Exception('A menu item with this ID already exists.', { status: 409 })
      }
      const item = { ...payload, image: payload.image ?? '' }
      const now = new Date()
      await trx.table('menu_items').insert({
        ...item,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
      })
      return item
    })
  }

  async updateMenu(id: string, payload: MenuInput) {
    return db.transaction(async (trx) => {
      const existing = await trx.from('menu_items').where('id', id).forUpdate().first()
      if (!existing) notFound('Menu item')
      const item = { ...payload, id, image: payload.image ?? '' }
      await trx
        .from('menu_items')
        .where('id', id)
        .update({ ...item, updated_at: new Date() })
      return item
    })
  }

  async deleteMenu(id: string) {
    const count = await db.from('menu_items').where('id', id).delete()
    if (!count) notFound('Menu item')
  }

  async insertReservation(
    trx: TransactionClientContract,
    payload: ReservationInput,
    table: { id: string; name: string },
    payment?: { reference: string; amount: number }
  ) {
    const id = randomUUID()
    await trx.table('reservations').insert({
      id,
      table_id: table.id,
      table_name: table.name,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      date: payload.date,
      time: payload.time,
      guests: payload.guests,
      special_requests: payload.specialRequests ?? '',
      status: 'Pending',
      policy_accepted_at: new Date(),
      created_at: new Date(),
      payment_reference: payment?.reference ?? null,
      paid_amount: payment?.amount ?? null,
    })
    await trx.table('admin_notifications').insert({
      id: randomUUID(),
      reservation_id: id,
      message: payment ? 'New paid reservation received.' : 'New reservation request received.',
      created_at: new Date(),
    })
    return {
      id,
      status: 'Pending' as const,
      tableName: table.name,
      endTime: bookingStart(payload.date, payload.time)
        .plus({ minutes: DURATION_MINUTES })
        .toFormat('HH:mm'),
    }
  }

  // Internal booking writer; the public endpoint always goes through paid checkout.
  async createReservation(payload: ReservationInput) {
    const result = await db.transaction(async (trx) => {
      const selected = await new TableBooking().reserve(
        trx,
        payload.date,
        payload.time,
        payload.guests,
        payload.tableId
      )
      return this.insertReservation(trx, payload, selected)
    })
    await notifyDevices('New reservation request received.')
    return result
  }

  async updateReservation(id: string, status: Reservation['status']) {
    const result = await db.transaction(async (trx) => {
      await new TableBooking().lock(trx)
      const row = await trx.from('reservations').where('id', id).forUpdate().first()
      if (!row) notFound('Reservation')
      if (status === 'Confirmed' && !row.table_id)
        throw new Exception('Assign a table before confirming arrival.', { status: 409 })
      if (effectiveStatus(row) !== 'Pending' || !['Confirmed', 'Cancelled'].includes(status)) {
        throw new Exception('Only an active pending booking can be checked in or cancelled.', {
          status: 409,
        })
      }
      const arrivedAt = status === 'Confirmed' ? new Date() : null
      if (status === 'Cancelled' && row.paid_amount)
        await new ReservationRefunds().queue(trx, row, Number(row.paid_amount), 0)
      await trx.from('reservations').where('id', id).update({ status, arrived_at: arrivedAt })
      return reservation({ ...row, status, arrived_at: arrivedAt })
    })
    if (status === 'Cancelled' && result.paymentReference)
      await new ReservationRefunds().submit(result.paymentReference)
    return result
  }

  async manageReservation(
    id: string,
    email: string,
    reason?: string,
    expectedRefundAmount?: number,
    verificationToken?: string
  ) {
    let refundReference: string | null = null
    const result = await db.transaction(async (trx) => {
      if (reason !== undefined) await new TableBooking().lock(trx)
      const row = await trx
        .from('reservations')
        .where('id', id)
        .where('email', email)
        .forUpdate()
        .first()
      if (!row) notFound('Reservation')
      if (!reservationVisible(row)) notFound('Reservation')
      if (reason !== undefined) {
        if (verificationToken !== undefined) {
          if (!validEmailProof(verificationToken, email, 'cancel', id))
            throw new Exception('Verify your email again before cancelling.', { status: 422 })
          const proof = JSON.parse(
            Buffer.from(verificationToken.split('.')[0], 'base64url').toString()
          )
          const verification = await trx
            .from('email_verifications')
            .where('id', proof.id)
            .where('email', email)
            .where('purpose', 'cancel')
            .where('resource', id)
            .where('used', true)
            .where('authorization_used', false)
            .where('expires', '>', Date.now())
            .forUpdate()
            .first()
          if (!verification)
            throw new Exception('This cancellation verification has expired or was already used.', {
              status: 422,
            })
          await trx
            .from('email_verifications')
            .where('id', proof.id)
            .update({ authorization_used: true })
        }
        if (effectiveStatus(row) !== 'Pending')
          throw new Exception('This reservation can no longer be cancelled online.', {
            status: 409,
          })
        const quote = cancellationQuote(row)
        if (row.paid_amount && expectedRefundAmount !== quote.refundAmount)
          throw new Exception(
            'The refund quote has changed. Find your reservation again and review the current refund before cancelling.',
            { status: 409 }
          )
        await new ReservationRefunds().queue(trx, row, quote.refundAmount, quote.feeAmount)
        refundReference = row.payment_reference ?? null
        await trx
          .from('reservations')
          .where('id', id)
          .update({ status: 'Cancelled', cancellation_reason: reason })
        row.status = 'Cancelled'
        await trx.table('admin_notifications').insert({
          id: randomUUID(),
          reservation_id: id,
          message: 'A guest cancelled their reservation.',
          created_at: new Date(),
        })
      }
      const booking = reservation(row)
      const currentTable = row.table_id
        ? await trx.from('dining_tables').where('id', row.table_id).first()
        : null
      return {
        cancellation: cancellationQuote(row),
        refund: refundView(
          await trx.from('reservation_refunds').where('reservation_id', id).first()
        ),
        tableName: currentTable?.name ?? booking.tableName,
        endTime: booking.endTime,
        id: booking.id,
        date: booking.date,
        time: booking.time,
        guests: booking.guests,
        status: booking.status,
        expiresAt: booking.expiresAt,
      }
    })
    if (refundReference) {
      await new ReservationRefunds().submit(refundReference)
      result.refund = refundView(
        await db.from('reservation_refunds').where('reservation_id', id).first()
      )
    }
    if (reason !== undefined) await notifyDevices('A guest cancelled their reservation.')
    return result
  }

  async assignTable(id: string, tableId: string) {
    return db.transaction(async (trx) => {
      const booking = new TableBooking()
      await booking.lock(trx)
      const row = await trx.from('reservations').where('id', id).forUpdate().first()
      if (!row) notFound('Reservation')
      if (
        !['Pending', 'Confirmed'].includes(effectiveStatus(row)) ||
        bookingStart(row.date, row.time).plus({ minutes: DURATION_MINUTES }).toMillis() <=
          Date.now()
      ) {
        throw new Exception('Only an active booking can be assigned a table.', { status: 409 })
      }
      const table = await booking.reserve(trx, row.date, row.time, row.guests, tableId, id)
      await trx
        .from('reservations')
        .where('id', id)
        .update({ table_id: table.id, table_name: table.name })
      return reservation({ ...row, table_id: table.id, table_name: table.name })
    })
  }

  async updateSettings(settings: Settings) {
    await db
      .from('restaurant_settings')
      .where('id', 1)
      .update({
        payload: JSON.stringify(settings),
        updated_at: new Date(),
      })
    return settings
  }

  private async lock(trx: TransactionClientContract) {
    const row = await trx.from('restaurant_settings').where('id', 1).forUpdate().first()
    if (!row) throw new Exception('Restaurant settings have not been initialized.', { status: 503 })
  }

  private async changeSpecials(change: (posts: DailySpecial[], now: number) => DailySpecial[]) {
    return db.transaction(async (trx) => {
      // Lock a stable row before reading the queue: simultaneous admins cannot overlap posts.
      await this.lock(trx)
      const rows = await trx.from('daily_specials').orderBy('starts_at').orderBy('id')
      const posts = rows.map(special)
      const updated = change(posts, Date.now())
      const keep = new Set(updated.map((post) => post.id))
      for (const post of posts) {
        if (!keep.has(post.id)) await trx.from('daily_specials').where('id', post.id).delete()
      }
      const existing = new Set(posts.map((post) => post.id))
      for (const post of updated) {
        if (existing.has(post.id)) {
          await trx.from('daily_specials').where('id', post.id).update(specialRow(post))
        } else {
          await trx.table('daily_specials').insert(specialRow(post))
        }
      }
      return updated
    })
  }

  async createSpecial(payload: SpecialInput) {
    return this.changeSpecials((posts, now) => {
      const id = payload.id ?? randomUUID()
      if (posts.some((post) => post.id === id)) {
        throw new Exception('A daily special with this ID already exists.', { status: 409 })
      }
      return appendSpecial(
        posts,
        { ...payload, id, caption: payload.caption ?? '', image: payload.image ?? '' },
        now
      )
    })
  }

  async moveSpecial(id: string, direction: -1 | 1) {
    return this.changeSpecials((posts, now) => {
      if (!posts.some((post) => post.id === id)) notFound('Daily special')
      return moveSpecial(posts, id, direction, now)
    })
  }

  async deleteSpecial(id: string) {
    return this.changeSpecials((posts, now) => {
      if (!posts.some((post) => post.id === id)) notFound('Daily special')
      return removeSpecial(posts, id, now)
    })
  }

  async subscribe(email: string) {
    await db
      .table('newsletter_subscribers')
      .insert({
        id: randomUUID(),
        email,
        consent_version: '2026-10-31-newsletter-v1',
        created_at: new Date(),
      })
      .onConflict('email')
      .ignore()
  }
}
