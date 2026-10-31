import { emailProof } from '#services/email_verification'
import { rejects } from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Paystack, { type PaystackRefund, type PaystackTransaction } from '#services/paystack'
import ReservationPayments, { RESERVATION_FEE } from '#services/reservation_payments'
import ReservationRefunds from '#services/reservation_refunds'
import RestaurantService from '#services/restaurant_service'
import TableBooking from '#services/table_booking'
import { cancellationQuote, reservationDeadline } from '#services/reservation_policy'
import { dailySlots } from '#services/booking_slots'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

const restaurant = new RestaurantService()
const date = DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate()!
const guest = {
  tableId: testTableId,
  date,
  time: '18:00',
  name: 'Refund Guest',
  email: 'refund@example.test',
  phone: '08012345678',
  guests: 2,
}
class PaidGateway extends Paystack {
  configured() {
    return true
  }
  async verify(reference: string): Promise<PaystackTransaction> {
    return {
      reference,
      status: 'success',
      amount: RESERVATION_FEE,
      currency: 'NGN',
      id: reference,
      customer: { email: guest.email },
    }
  }
}
async function paidBooking() {
  const payments = new ReservationPayments(new PaidGateway())
  const checkout = await payments.create(guest)
  const paid = await payments.verify(checkout.reference)
  return { id: paid.reservationId!, reference: checkout.reference }
}

test.group('Cancellation refunds and scheduled slots', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)
  let calls = 0
  let responseStatus = 'pending'
  let failRequest = false
  group.each.setup(() => {
    const oldSecret = env.get('PAYSTACK_SECRET_KEY', '')
    const oldRefund = Paystack.prototype.refund
    const oldFetch = Paystack.prototype.fetchRefund
    env.set('PAYSTACK_SECRET_KEY', 'sk_test_refund_fixture')
    calls = 0
    responseStatus = 'pending'
    failRequest = false
    Paystack.prototype.refund = async (
      reference,
      amount,
      reservationId
    ): Promise<PaystackRefund> => {
      calls++
      if (failRequest) throw new Error('Uncertain network response')
      return {
        id: `refund-${reference}`,
        amount,
        currency: 'NGN',
        status: responseStatus,
        merchant_note: `iceberg-refund:${reservationId}`,
      }
    }
    Paystack.prototype.fetchRefund = async (id): Promise<PaystackRefund> => {
      const row = await db.from('reservation_refunds').where('provider_id', id).first()
      return { id, amount: row.amount, currency: 'NGN', status: responseStatus }
    }
    return () => {
      env.set('PAYSTACK_SECRET_KEY', oldSecret)
      Paystack.prototype.refund = oldRefund
      Paystack.prototype.fetchRefund = oldFetch
    }
  })

  test('two-hour full-refund cutoff and 30-minute no-show cutoff are exact', ({ assert }) => {
    const row = { status: 'Pending', date: '2026-11-02', time: '18:00', paid_amount: 3000000 }
    const start = Date.parse('2026-11-02T18:00:00+01:00')
    assert.equal(cancellationQuote(row, start - 2 * 3600000).refundAmount, 3000000)
    assert.equal(cancellationQuote(row, start - 2 * 3600000 + 1).refundAmount, 2250000)
    assert.equal(cancellationQuote(row, start + 1799999).feeAmount, 750000)
    assert.isFalse(cancellationQuote(row, start + 1800000).canCancel)
    assert.equal(cancellationQuote(row, start + 1800000).refundAmount, 0)
    assert.equal(reservationDeadline(row.date, row.time), start + 1800000)
    assert.isFalse(cancellationQuote({ ...row, status: 'Confirmed' }, start).canCancel)
  })

  test('early guest cancellation requests one full refund and frees the table immediately', async ({
    assert,
  }) => {
    const { id, reference } = await paidBooking()
    const quote = await restaurant.manageReservation(id, guest.email)
    assert.equal(quote.cancellation.refundAmount, RESERVATION_FEE)
    const cancelled = await restaurant.manageReservation(
      id,
      guest.email,
      'Plans changed',
      RESERVATION_FEE
    )
    assert.equal(cancelled.status, 'Cancelled')
    assert.equal(cancelled.refund?.status, 'Pending')
    assert.equal(cancelled.refund?.feeAmount, 0)
    await new ReservationRefunds().submit(reference)
    assert.equal(calls, 1)
    const availability = await new TableBooking().availability(date, guest.time, 2)
    assert.isTrue(availability.tables[0].available)
    const receipt = await new ReservationPayments().show(reference)
    assert.equal(receipt.reservationStatus, 'Cancelled')
  })

  test('late cancellation during arrival grace refunds 75 percent and retains 25 percent', async ({
    assert,
  }) => {
    const { id } = await paidBooking()
    const started = DateTime.now().setZone('Africa/Lagos').minus({ minutes: 15 })
    await db
      .from('reservations')
      .where('id', id)
      .update({ date: started.toISODate(), time: started.toFormat('HH:mm') })
    const quote = await restaurant.manageReservation(id, guest.email)
    assert.equal(quote.cancellation.feePercent, 25)
    assert.equal(quote.cancellation.refundAmount, 2250000)
    const cancelled = await restaurant.manageReservation(
      id,
      guest.email,
      'Unable to arrive',
      2250000
    )
    assert.equal(cancelled.refund?.amount, 2250000)
    assert.equal(cancelled.refund?.feeAmount, 750000)
    assert.equal(calls, 1)
  })

  test('stale or tampered refund quotes cannot cancel a paid booking', async ({ assert }) => {
    const { id } = await paidBooking()
    await rejects(
      () => restaurant.manageReservation(id, guest.email, 'Plans changed', 1),
      /quote has changed/
    )
    const row = await db.from('reservations').where('id', id).first()
    assert.equal(row.status, 'Pending')
    assert.equal(calls, 0)
  })

  test('no refund after arrival deadline or check-in; restaurant cancellation refunds in full', async ({
    assert,
  }) => {
    const { id } = await paidBooking()
    const old = DateTime.now().setZone('Africa/Lagos').minus({ minutes: 61 })
    await db
      .from('reservations')
      .where('id', id)
      .update({ date: old.toISODate(), time: old.toFormat('HH:mm') })
    await rejects(
      () => restaurant.manageReservation(id, guest.email, 'No show', 2250000),
      /no longer/
    )
    assert.equal(calls, 0)
    await db.from('reservations').where('id', id).update({ date, time: '18:00' })
    await restaurant.updateReservation(id, 'Cancelled')
    const refund = await db.from('reservation_refunds').where('reservation_id', id).first()
    assert.equal(refund.amount, RESERVATION_FEE)
    assert.equal(refund.fee_amount, 0)
  })

  test('refund completion is reconciled; uncertain requests never submit twice', async ({
    assert,
  }) => {
    const { id, reference } = await paidBooking()
    failRequest = true
    const cancelled = await restaurant.manageReservation(
      id,
      guest.email,
      'Plans changed',
      RESERVATION_FEE
    )
    assert.equal(cancelled.refund?.status, 'ReviewRequired')
    await new ReservationRefunds().submit(reference)
    assert.equal(calls, 1)
    // Simulate recovery of the provider ID, then check the final provider status.
    await db
      .from('reservation_refunds')
      .where('payment_reference', reference)
      .update({ provider_id: `refund-${reference}`, status: 'Pending' })
    responseStatus = 'processed'
    await new ReservationRefunds().reconcile(reference)
    const refund = await db
      .from('reservation_refunds')
      .where('payment_reference', reference)
      .first()
    assert.equal(refund.status, 'Processed')
  })

  test('slots start hourly from opening, finish by closing and reject arbitrary minutes', async ({
    assert,
    client,
  }) => {
    const config = await new TableBooking().configuration()
    const monday = config.hours.find((day) => day.day === 1)!
    const slots = dailySlots(monday, config.slotIntervalMinutes)
    assert.equal(slots[0].start, '11:00')
    assert.equal(slots[0].end, '13:00')
    assert.equal(slots[1].start, '12:00')
    assert.equal(slots.at(-1)!.start, '19:00')
    const response = await client
      .post('/api/reservations')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({
        ...guest,
        time: '11:14',
        acceptedTerms: true,
        verificationToken: emailProof(guest.email),
      })
    response.assertStatus(422)
    await new TableBooking().saveHours(config.hours, 120)
    const changed = await new TableBooking().configuration()
    assert.deepEqual(
      dailySlots(monday, changed.slotIntervalMinutes).map((slot) => slot.start),
      ['11:00', '13:00', '15:00', '17:00', '19:00']
    )
  })

  test('changing interval preserves an active checkout accepted on the previous grid', async ({
    assert,
  }) => {
    const payments = new ReservationPayments(new PaidGateway())
    const checkout = await payments.create(guest)
    const config = await new TableBooking().configuration()
    await new TableBooking().saveHours(config.hours, 120)
    const paid = await payments.verify(checkout.reference)
    assert.equal(paid.status, 'Paid')
  })

  test('signed refund webhooks reconcile the provider result and guests cannot access another refund', async ({
    client,
    assert,
  }) => {
    const { id, reference } = await paidBooking()
    await restaurant.manageReservation(id, guest.email, 'Plans changed', RESERVATION_FEE)
    responseStatus = 'processed'
    const body = {
      event: 'refund.processed',
      data: { transaction_reference: reference, amount: '1' },
    }
    const signature = createHmac('sha512', 'sk_test_refund_fixture')
      .update(JSON.stringify(body))
      .digest('hex')
    const webhook = await client
      .post('/api/payments/paystack/webhook')
      .header('Accept', 'application/json')
      .header('x-paystack-signature', signature)
      .json(body)
    webhook.assertStatus(200)
    const refund = await db
      .from('reservation_refunds')
      .where('payment_reference', reference)
      .first()
    assert.equal(refund.status, 'Processed')
    assert.equal(refund.amount, RESERVATION_FEE)
    const wrongGuest = await client
      .post('/api/reservations/refund-status')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: 'wrong@example.test' })
    wrongGuest.assertStatus(404)
    const adminOnly = await client
      .post(`/api/admin/refunds/${reference}/reconcile`)
      .withCsrfToken()
      .header('Accept', 'application/json')
    adminOnly.assertStatus(401)
  })

  test('checked-in guests cannot cancel and trigger a refund', async ({ assert }) => {
    const { id } = await paidBooking()
    await restaurant.updateReservation(id, 'Confirmed')
    await rejects(
      () => restaurant.manageReservation(id, guest.email, 'Leaving early', RESERVATION_FEE),
      /no longer/
    )
    assert.equal(calls, 0)
  })
})
