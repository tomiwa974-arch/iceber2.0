import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import { paymentGateway, type PaymentProvider } from '#services/payment_gateway'

export async function enabledProviders() {
  const row = await db.from('booking_configuration').where('id', 1).first()
  return (
    row?.payment_providers ? JSON.parse(row.payment_providers) : ['paystack', 'stripe']
  ) as PaymentProvider[]
}

export default class PaymentReporting {
  async settings() {
    const enabled = await enabledProviders()
    return (['paystack', 'stripe'] as const).map((id) => ({
      id,
      name: id === 'stripe' ? 'Stripe' : 'Paystack',
      enabled: enabled.includes(id),
      configured: paymentGateway(id).configured(),
    }))
  }
  async save(providers: PaymentProvider[]) {
    if (providers.length === 0 || new Set(providers).size !== providers.length)
      throw new Exception('Choose at least one payment provider.', { status: 422 })
    for (const provider of providers)
      if (!paymentGateway(provider).configured())
        throw new Exception(
          `Configure ${provider === 'stripe' ? 'Stripe' : 'Paystack'} credentials before enabling it.`,
          { status: 422 }
        )
    await db.transaction(async (trx) => {
      await trx.from('booking_configuration').where('id', 1).forUpdate().first()
      await trx
        .from('booking_configuration')
        .where('id', 1)
        .update({ payment_providers: JSON.stringify(providers) })
    })
    return this.settings()
  }
  async revenue(days = 30) {
    // Read both sides of the ledger from the same database snapshot.
    return db.transaction(async (trx) => {
      const payments = await trx
        .from('reservation_payments')
        .whereIn('status', ['Paid', 'ReviewRequired'])
      const refunds = await trx.from('reservation_refunds')
      const gross = payments.reduce((sum, row) => sum + Number(row.amount), 0)
      const refunded = refunds
        .filter((row) => row.status === 'Processed')
        .reduce((sum, row) => sum + Number(row.amount), 0)
      const pendingRefunds = refunds
        .filter((row) => row.status !== 'Processed')
        .reduce((sum, row) => sum + Number(row.amount), 0)
      const reviewAmount = payments
        .filter((row) => row.status === 'ReviewRequired')
        .reduce((sum, row) => sum + Number(row.amount), 0)
      const start = DateTime.now()
        .setZone('Africa/Lagos')
        .startOf('day')
        .minus({ days: days - 1 })
      const daily = Array.from({ length: days }, (_, index) => ({
        date: start.plus({ days: index }).toISODate()!,
        received: 0,
        refunded: 0,
        net: 0,
      }))
      const buckets = new Map(daily.map((day) => [day.date, day]))
      const dayOf = (value: unknown) =>
        DateTime.fromJSDate(new Date(value as string), { zone: 'Africa/Lagos' }).toISODate() ?? ''
      for (const row of payments) {
        const day = buckets.get(dayOf(row.paid_at))
        if (day) day.received += Number(row.amount)
      }
      for (const row of refunds.filter((refund) => refund.status === 'Processed')) {
        const day = buckets.get(dayOf(row.processed_at ?? row.updated_at))
        if (day) day.refunded += Number(row.amount)
      }
      for (const day of daily) day.net = day.received - day.refunded
      return {
        currency: 'NGN',
        gross,
        refunded,
        pendingRefunds,
        reviewAmount,
        cashNet: gross - refunded,
        retained: gross - refunded - pendingRefunds - reviewAmount,
        paidBookings: payments.filter((row) => row.status === 'Paid').length,
        daily,
      }
    })
  }
}
