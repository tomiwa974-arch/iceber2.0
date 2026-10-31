import { enforceLimit, RateLimitExceeded, securityDigest } from '#services/security_limits'
import { rateLimits } from '#config/rate_limits'
import { enabledProviders } from '#services/payment_reporting'
import { paymentGateway, type PaymentProvider } from '#services/payment_gateway'
import BookingMessages from '#services/booking_messages'
import { RESERVATION_TERMS, TERMS_VERSION } from '../../shared/reservation_terms.js'
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'
import TableBooking, { bookingStart } from '#services/table_booking'
import RestaurantService, { type ReservationInput } from '#services/restaurant_service'
import type { PaymentGateway } from '#services/payment_types'
import { notifyDevices } from '#services/reservation_notifications'
import { refundView } from '#services/reservation_refunds'

export const RESERVATION_FEE = 3_000_000 // kobo: exactly NGN 30,000 per table
export const PAYMENT_HOLD_MS = 10 * 60 * 1000

export default class ReservationPayments {
  constructor(private gateway?: PaymentGateway) {}

  private forProvider(provider: string) {
    return this.gateway ?? paymentGateway(provider)
  }

  async create(payload: ReservationInput, context?: { ip: string }) {
    let reference = randomUUID()
    await db.transaction(async (trx) => {
      await new TableBooking().lock(trx)
      if (context) {
        const email = payload.email.trim().toLowerCase()
        const recent = await trx
          .from('reservation_payments')
          .where('guest_email', email)
          .where('status', 'Pending')
          .where('created_at', '>', new Date(Date.now() - 3600000))
        const active = recent.find(
          (r) => r.status === 'Pending' && Number(r.hold_until) > Date.now()
        )
        if (active) {
          const previous = JSON.parse(active.payload)
          const same = [
            'date',
            'time',
            'tableId',
            'guests',
            'name',
            'email',
            'phone',
            'notes',
            'specialRequests',
          ].every((key) => String(previous[key] ?? '') === String((payload as any)[key] ?? ''))
          if (!same)
            throw new Exception(
              'You already have an active checkout. Complete it or wait for its ten-minute hold to end before choosing another table.',
              { status: 409 }
            )
          reference = active.reference
          return
        }
        const byIp = await trx
          .from('reservation_payments')
          .where('ip_hash', securityDigest(context.ip))
          .where('created_at', '>', new Date(Date.now() - 900000))
          .count('* as total')
          .min('created_at as oldest')
          .first()
        if (recent.length >= 3 || Number(byIp?.total) >= 20) {
          const now = Date.now()
          const emailWait =
            recent.length >= 3
              ? Math.min(...recent.map((row) => new Date(row.created_at).getTime())) + 3600000 - now
              : 0
          const ipWait =
            Number(byIp?.total) >= 20 ? new Date(byIp!.oldest).getTime() + 900000 - now : 0
          throw new RateLimitExceeded(
            Math.max(1, Math.ceil(Math.max(emailWait, ipWait) / 1000)),
            'Too many unpaid booking attempts. Please try again later or contact the restaurant.'
          )
        }
        await enforceLimit(
          'checkout:email:' + email,
          rateLimits.checkoutEmail.limit,
          rateLimits.checkoutEmail.windowMs,
          trx
        )
      }
      await new TableBooking().reserve(
        trx,
        payload.date,
        payload.time,
        payload.guests,
        payload.tableId
      )
      await trx.table('reservation_payments').insert({
        reference,
        guest_email: payload.email.trim().toLowerCase(),
        ip_hash: context ? securityDigest(context.ip) : null,
        table_id: payload.tableId,
        date: payload.date,
        time: payload.time,
        guests: payload.guests,
        payload: JSON.stringify({
          ...payload,
          terms: RESERVATION_TERMS,
          termsVersion: TERMS_VERSION,
        }),
        amount: RESERVATION_FEE,
        currency: 'NGN',
        status: 'Pending',
        hold_until: Math.min(
          Date.now() + PAYMENT_HOLD_MS,
          bookingStart(payload.date, payload.time).toMillis()
        ),
        created_at: new Date(),
      })
    })
    return { reference, url: `/payments/${reference}` }
  }

  async show(reference: string) {
    const row = await db.from('reservation_payments').where('reference', reference).first()
    if (!row) throw new Exception('Checkout not found.', { status: 404 })
    const table = await db.from('dining_tables').where('id', row.table_id).first()
    const payload = JSON.parse(row.payload)
    const reservation = row.reservation_id
      ? await db.from('reservations').where('id', row.reservation_id).first()
      : null
    const enabled = await enabledProviders()
    return {
      reservationStatus: reservation?.status ?? null,
      terms: payload.terms ?? RESERVATION_TERMS,
      messages: row.reservation_id
        ? await db
            .from('booking_messages')
            .where('reservation_id', row.reservation_id)
            .select('channel', 'status')
        : [],
      refund: refundView(
        await db.from('reservation_refunds').where('payment_reference', reference).first()
      ),
      reference: row.reference,
      reservationId: row.reservation_id,
      status: row.status,
      expired: row.status === 'Pending' && Number(row.hold_until) <= Date.now(),
      holdUntil: Number(row.hold_until),
      date: row.date,
      time: row.time,
      guests: row.guests,
      tableName: table?.name ?? 'Reserved table',
      amount: row.amount,
      currency: row.currency,
      provider: row.provider,
      providerLocked: Boolean(row.provider_selected),
      providers: (['paystack', 'stripe'] as const)
        .filter(
          (provider) =>
            this.forProvider(provider).configured() &&
            (enabled.includes(provider) || (row.provider_selected && row.provider === provider))
        )
        .map((provider) => ({
          id: provider,
          name: provider === 'stripe' ? 'Stripe' : 'Paystack',
          mode: env
            .get(provider === 'stripe' ? 'STRIPE_SECRET_KEY' : 'PAYSTACK_SECRET_KEY', '')
            .startsWith('sk_live_')
            ? 'live'
            : 'test',
        })),
      configured: (['paystack', 'stripe'] as const).some(
        (provider) =>
          this.forProvider(provider).configured() &&
          (enabled.includes(provider) || (row.provider_selected && row.provider === provider))
      ),
      mode: env
        .get(row.provider === 'stripe' ? 'STRIPE_SECRET_KEY' : 'PAYSTACK_SECRET_KEY', '')
        .startsWith('sk_live_')
        ? 'live'
        : 'test',
      // The checkout reference is a secret capability; return only a masked contact for the receipt.
      emailHint: String(payload.email).replace(/^(.).+(@.*)$/, '$1***$2'),
      reviewReason:
        row.status === 'ReviewRequired'
          ? 'Your payment was received, but a reservation could not be secured. Please contact the restaurant with this payment reference for a refund review. Do not pay again.'
          : '',
    }
  }

  async initialize(reference: string, provider?: PaymentProvider) {
    // Bind the provider before the external call, even if that call times out.
    await db.transaction(async (trx) => {
      const row = await trx
        .from('reservation_payments')
        .where('reference', reference)
        .forUpdate()
        .first()
      if (!row) throw new Exception('Checkout not found.', { status: 404 })
      if (row.status !== 'Pending' || Number(row.hold_until) <= Date.now())
        throw new Exception(
          'This checkout has ended. Verify any attempted payment before making a new booking.',
          { status: 409 }
        )
      const selected = provider ?? row.provider
      if (!['paystack', 'stripe'].includes(selected))
        throw new Exception('Choose a supported payment provider.', { status: 422 })
      if (row.provider_selected && selected !== row.provider)
        throw new Exception(
          'This checkout already uses another provider. Verify any payment before starting a new reservation.',
          { status: 409 }
        )
      const enabled = await enabledProviders()
      if (!row.provider_selected && !enabled.includes(selected))
        throw new Exception(
          'This payment provider has been disabled by the restaurant. Choose another available provider.',
          { status: 409 }
        )
      if (!this.forProvider(selected).configured())
        throw new Exception('This payment provider is not available.', { status: 503 })
      await trx
        .from('reservation_payments')
        .where('reference', reference)
        .update({ provider: selected, provider_selected: true })
    })
    return db.transaction(async (trx) => {
      const row = await trx
        .from('reservation_payments')
        .where('reference', reference)
        .forUpdate()
        .first()
      if (!row) throw new Exception('Checkout not found.', { status: 404 })
      if (row.status !== 'Pending' || Number(row.hold_until) <= Date.now())
        throw new Exception(
          'This checkout has ended. Verify any attempted payment before making a new booking.',
          { status: 409 }
        )
      const selected = provider ?? row.provider
      if (!['paystack', 'stripe'].includes(selected))
        throw new Exception('Choose a supported payment provider.', { status: 422 })
      if (row.authorization_url) {
        if (selected !== row.provider)
          throw new Exception(
            'This checkout already uses another provider. Verify any payment before starting a new reservation.',
            { status: 409 }
          )
        return { url: row.authorization_url }
      }
      if (!this.forProvider(selected).configured())
        throw new Exception('This payment provider is not available.', { status: 503 })
      const payload = JSON.parse(row.payload)
      const result = await this.forProvider(selected).initialize(
        reference,
        payload.email,
        row.amount
      )
      const url = new URL(result.authorization_url)
      if (
        result.reference !== reference ||
        url.protocol !== 'https:' ||
        url.hostname !== (selected === 'stripe' ? 'checkout.stripe.com' : 'checkout.paystack.com')
      )
        throw new Exception('Invalid checkout response. Contact the restaurant.', { status: 502 })
      await trx
        .from('reservation_payments')
        .where('reference', reference)
        .update({
          authorization_url: result.authorization_url,
          provider: selected,
          checkout_session_id: result.session_id ?? null,
        })
      return { url: result.authorization_url }
    })
  }

  async verify(reference: string) {
    const existing = await db.from('reservation_payments').where('reference', reference).first()
    if (!existing) throw new Exception('Checkout not found.', { status: 404 })
    if (existing.status !== 'Pending') return this.show(reference)
    const transaction = await this.forProvider(existing.provider).verify(reference)
    if (transaction.status !== 'success') return this.show(reference)
    const payload = JSON.parse(existing.payload) as ReservationInput
    // Never trust the redirect, browser amount, or a success label by itself.
    if (
      transaction.reference !== reference ||
      transaction.amount !== existing.amount ||
      transaction.currency !== 'NGN' ||
      transaction.customer?.email?.toLowerCase() !== payload.email.toLowerCase() ||
      !transaction.id
    ) {
      throw new Exception(
        'Payment verification did not match this booking. Contact the restaurant with your payment reference.',
        { status: 409 }
      )
    }
    let notice = ''
    await db.transaction(async (trx) => {
      const booking = new TableBooking()
      await booking.lock(trx)
      const row = await trx
        .from('reservation_payments')
        .where('reference', reference)
        .forUpdate()
        .first()
      if (row.status !== 'Pending') return
      if (row.provider !== existing.provider)
        throw new Exception('Payment provider changed. Verify payment again.', { status: 409 })
      let table
      try {
        table = await booking.reserve(
          trx,
          payload.date,
          payload.time,
          payload.guests,
          payload.tableId,
          undefined,
          reference
        )
      } catch (error) {
        if (!(error instanceof Exception) || ![409, 422].includes(error.status)) throw error
        await trx
          .from('reservation_payments')
          .where('reference', reference)
          .update({
            status: 'ReviewRequired',
            paid_at: new Date(),
            provider_id: String(transaction.id),
            review_reason: error.message,
          })
        notice = 'A paid checkout needs refund review. Check the reservation payment alerts.'
        return
      }
      const reservation = await new RestaurantService().insertReservation(trx, payload, table, {
        reference,
        amount: row.amount,
      })
      await trx
        .from('reservation_payments')
        .where('reference', reference)
        .update({
          status: 'Paid',
          reservation_id: reservation.id,
          paid_at: new Date(),
          provider_id: String(transaction.id),
        })
      await BookingMessages.enqueue(trx, reservation.id, JSON.parse(row.payload), table.name)
      notice = 'New paid reservation received.'
    })
    if (notice) await notifyDevices(notice)
    return this.show(reference)
  }

  validSignature(raw: string, signature: string) {
    const secret = env.get('PAYSTACK_SECRET_KEY', '')
    if (!secret || !/^[a-f0-9]{128}$/i.test(signature)) return false
    const expected = createHmac('sha512', secret).update(raw).digest()
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  }
}
