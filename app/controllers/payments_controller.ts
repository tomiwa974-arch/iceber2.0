import vine from '@vinejs/vine'
import Stripe from '#services/stripe'
import type { HttpContext } from '@adonisjs/core/http'
import ReservationPayments from '#services/reservation_payments'
import db from '@adonisjs/lucid/services/db'
import ReservationRefunds, { refundView } from '#services/reservation_refunds'
import { reservationLookupValidator } from '#validators/restaurant'

const initializeValidator = vine.create({ provider: vine.enum(['paystack', 'stripe']).optional() })
const payments = new ReservationPayments()
export default class PaymentsController {
  async page({ params, inertia, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    response.header('Referrer-Policy', 'no-referrer')
    return inertia.render('payment', { checkout: await payments.show(params.reference) })
  }
  async show({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    return { checkout: await payments.show(params.reference) }
  }
  async initialize({ params, request }: HttpContext) {
    const { provider } = await request.validateUsing(initializeValidator)
    return payments.initialize(params.reference, provider)
  }
  async verify({ params }: HttpContext) {
    return { checkout: await payments.verify(params.reference) }
  }
  async webhook({ request, response }: HttpContext) {
    const raw = request.raw() ?? ''
    if (!payments.validSignature(raw, request.header('x-paystack-signature') ?? ''))
      return response.unauthorized({ message: 'Invalid webhook signature.' })
    const event = request.body()
    if (
      typeof event.event === 'string' &&
      event.event.startsWith('refund.') &&
      typeof event.data?.transaction_reference === 'string'
    )
      await new ReservationRefunds().reconcile(event.data.transaction_reference)
    if (event.event === 'charge.success' && typeof event.data?.reference === 'string') {
      const known = await db
        .from('reservation_payments')
        .where('reference', event.data.reference)
        .first()
      if (!known || known.provider !== 'paystack') return { received: true }
      // Re-verify with Paystack as well; retries are idempotent.
      await payments.verify(event.data.reference)
    }
    return { received: true }
  }
  async stripeWebhook({ request, response }: HttpContext) {
    if (!new Stripe().validSignature(request.raw() ?? '', request.header('stripe-signature') ?? ''))
      return response.unauthorized({ message: 'Invalid webhook signature.' })
    const event = request.body()
    const object = event.data?.object
    if (
      ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
        event.type
      ) &&
      typeof object?.id === 'string'
    ) {
      const payment = await db
        .from('reservation_payments')
        .where('provider', 'stripe')
        .where('checkout_session_id', object.id)
        .first()
      if (payment) await payments.verify(payment.reference)
    }
    if (
      ['refund.created', 'refund.updated', 'refund.failed'].includes(event.type) &&
      typeof object?.payment_intent === 'string'
    ) {
      const payment = await db
        .from('reservation_payments')
        .where('provider', 'stripe')
        .where('provider_id', object.payment_intent)
        .first()
      if (payment) await new ReservationRefunds().reconcile(payment.reference)
    }
    return { received: true }
  }
  async refundStatus({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id, email } = await request.validateUsing(reservationLookupValidator)
    const reservation = await db.from('reservations').where('id', id).where('email', email).first()
    if (!reservation) return response.notFound({ message: 'Reservation not found.' })
    const row = await db.from('reservation_refunds').where('reservation_id', id).first()
    if (row) await new ReservationRefunds().reconcile(row.payment_reference)
    return {
      refund: refundView(await db.from('reservation_refunds').where('reservation_id', id).first()),
    }
  }
  async reconcileRefund({ params }: HttpContext) {
    await new ReservationRefunds().reconcile(params.reference)
    return {
      message:
        'Refund status checked with the original payment provider. Unknown requests are not automatically submitted again.',
    }
  }
}
