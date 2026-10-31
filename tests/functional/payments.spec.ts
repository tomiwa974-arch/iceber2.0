import { emailProof } from '#services/email_verification'
import BookingMessages, {
  BookingMessageGateway,
  type BookingMessage,
} from '#services/booking_messages'
import { randomUUID, createHmac } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import User from '#models/user'
import Paystack, { type PaystackTransaction } from '#services/paystack'
import ReservationPayments, { RESERVATION_FEE } from '#services/reservation_payments'
import RestaurantService from '#services/restaurant_service'
import TableBooking from '#services/table_booking'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

const guest = {
  tableId: testTableId,
  name: 'Paid Guest',
  email: 'paid@example.test',
  phone: '08012345678',
  date: DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate()!,
  time: '18:00',
  guests: 2,
}
class FakePaystack extends Paystack {
  transaction: Partial<PaystackTransaction> = {}
  calls = 0
  configured() {
    return true
  }
  async initialize(reference: string, _email: string, amount: number) {
    if (amount !== RESERVATION_FEE) throw new Error('Unexpected charge')
    this.calls++
    return { reference, authorization_url: `https://checkout.paystack.com/test-${reference}` }
  }
  async verify(reference: string): Promise<PaystackTransaction> {
    return {
      reference,
      status: 'success',
      amount: RESERVATION_FEE,
      currency: 'NGN',
      id: `test-${reference}`,
      customer: { email: guest.email },
      ...this.transaction,
    }
  }
}
test.group('Paid reservations', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('public booking creates only a temporary checkout, ignores browser price and holds its table', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/reservations')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({
        ...guest,
        amount: 1,
        currency: 'USD',
        acceptedTerms: true,
        verificationToken: emailProof(guest.email),
        status: 'Confirmed',
      })
    response.assertStatus(201)
    const checkout = response.body().checkout
    assert.isString(checkout.reference)
    assert.notProperty(response.body(), 'reservation')
    const row = await db.from('reservation_payments').where('reference', checkout.reference).first()
    assert.equal(row!.amount, 3000000)
    assert.equal(row!.currency, 'NGN')
    const bookings = await db.from('reservations')
    assert.lengthOf(bookings, 0)
    assert.lengthOf(await db.from('booking_messages'), 0)
    const availability = await new TableBooking().availability(guest.date, guest.time, 2)
    assert.isFalse(availability.tables[0].available)
    const page = await client
      .get(`/api/payments/${checkout.reference}`)
      .header('Accept', 'application/json')
    page.assertStatus(200)
    assert.notInclude(JSON.stringify(page.body()), guest.phone)
    assert.notInclude(JSON.stringify(page.body()), guest.email)
  })

  test('checkout initialization reuses one provider URL and expired holds cannot initiate payment', async ({
    assert,
  }) => {
    const gateway = new FakePaystack()
    const payments = new ReservationPayments(gateway)
    const checkout = await payments.create(guest)
    await payments.initialize(checkout.reference)
    await payments.initialize(checkout.reference)
    assert.equal(gateway.calls, 1)
    await db
      .from('reservation_payments')
      .where('reference', checkout.reference)
      .update({ hold_until: 0 })
    await rejects(() => payments.initialize(checkout.reference), /checkout has ended/)
    const availability = await new TableBooking().availability(guest.date, guest.time, 2)
    assert.isTrue(availability.tables[0].available)
  })

  test('verified success creates exactly one paid booking and one notification across repeated verifications', async ({
    assert,
  }) => {
    const payments = new ReservationPayments(new FakePaystack())
    const checkout = await payments.create(guest)
    const first = await payments.verify(checkout.reference)
    const second = await payments.verify(checkout.reference)
    assert.equal(first.status, 'Paid')
    assert.equal(second.reservationId, first.reservationId)
    const bookings = await db.from('reservations').where('payment_reference', checkout.reference)
    assert.lengthOf(bookings, 1)
    assert.equal(bookings[0].paid_amount, RESERVATION_FEE)
    assert.equal(bookings[0].status, 'Pending')
    const notifications = await db
      .from('admin_notifications')
      .where('reservation_id', first.reservationId!)
    assert.lengthOf(notifications, 1)
    const messages = await db.from('booking_messages').where('reservation_id', first.reservationId!)
    assert.lengthOf(messages, 2)
    for (const message of messages) {
      assert.include(message.body, first.reservationId!)
      assert.include(message.body, guest.date)
      assert.include(message.body, '25%')
      assert.include(message.body, 'Save your booking ID')
    }
    class FakeMessages extends BookingMessageGateway {
      calls: string[] = []
      configured() {
        return true
      }
      async send(message: BookingMessage) {
        this.calls.push(message.channel)
        if (message.channel === 'sms') throw new Error('Unknown network outcome')
        return 'fake-email-id'
      }
    }
    const delivery = new FakeMessages()
    await new BookingMessages(delivery).process()
    await new BookingMessages(delivery).process()
    assert.sameMembers(delivery.calls, ['email', 'sms'])
    const delivered = await db
      .from('booking_messages')
      .where('reservation_id', first.reservationId!)
    assert.equal(delivered.find((message) => message.channel === 'email').status, 'Accepted')
    assert.equal(delivered.find((message) => message.channel === 'sms').status, 'NeedsReview')
  })

  test('pending or mismatched provider results cannot create reservations', async ({ assert }) => {
    const gateway = new FakePaystack()
    const payments = new ReservationPayments(gateway)
    const checkout = await payments.create(guest)
    gateway.transaction = { status: 'pending' }
    const pending = await payments.verify(checkout.reference)
    assert.equal(pending.status, 'Pending')
    for (const mismatch of [
      { amount: 1 },
      { currency: 'USD' },
      { reference: randomUUID() },
      { customer: { email: 'wrong@example.test' } },
    ]) {
      gateway.transaction = mismatch
      await rejects(() => payments.verify(checkout.reference), /did not match/)
    }
    const bookings = await db.from('reservations')
    assert.lengthOf(bookings, 0)
  })

  test('late payment never double-books a reallocated table and is flagged for refund review', async ({
    assert,
  }) => {
    const payments = new ReservationPayments(new FakePaystack())
    const checkout = await payments.create(guest)
    await db
      .from('reservation_payments')
      .where('reference', checkout.reference)
      .update({ hold_until: 0 })
    await new RestaurantService().createReservation(guest)
    const result = await payments.verify(checkout.reference)
    assert.equal(result.status, 'ReviewRequired')
    assert.isNull(result.reservationId)
    const bookings = await db.from('reservations')
    assert.lengthOf(bookings, 1)
    const admin = await User.create({
      fullName: 'Manager',
      email: 'payments-admin@example.test',
      password: 'Test-long-password!',
      isAdmin: true,
    })
    const state = await new RestaurantService().adminState(admin.id)
    assert.equal(state.paymentReviews[0].reference, checkout.reference)
  })

  test('forged webhooks are rejected without CSRF exemption opening another payment endpoint', async ({
    client,
  }) => {
    const webhook = await client
      .post('/api/payments/paystack/webhook')
      .header('Accept', 'application/json')
      .json({ event: 'charge.success', data: { reference: randomUUID() } })
    webhook.assertStatus(401)
    const initialize = await client
      .post(`/api/payments/${randomUUID()}/initialize`)
      .header('Accept', 'application/json')
      .json({})
    initialize.assertStatus(419)
  })

  test('webhook HMAC uses the exact raw body and rejects modified payloads', ({ assert }) => {
    const original = env.get('PAYSTACK_SECRET_KEY', '')
    env.set('PAYSTACK_SECRET_KEY', 'sk_test_signature_fixture')
    try {
      const raw = '{"event":"charge.success","data":{"reference":"test"}}'
      const signature = createHmac('sha512', 'sk_test_signature_fixture').update(raw).digest('hex')
      const payments = new ReservationPayments()
      assert.isTrue(payments.validSignature(raw, signature))
      assert.isFalse(payments.validSignature(`${raw} `, signature))
      assert.isFalse(payments.validSignature(raw, 'forged'))
    } finally {
      env.set('PAYSTACK_SECRET_KEY', original)
    }
  })

  test('a correctly signed provider webhook secures a booking once without a browser return', async ({
    client,
    assert,
  }) => {
    const originalSecret = env.get('PAYSTACK_SECRET_KEY', '')
    const originalVerify = Paystack.prototype.verify
    env.set('PAYSTACK_SECRET_KEY', 'sk_test_webhook_fixture')
    Paystack.prototype.verify = async (reference) => new FakePaystack().verify(reference)
    try {
      const checkout = await new ReservationPayments(new FakePaystack()).create(guest)
      const body = { event: 'charge.success', data: { reference: checkout.reference } }
      const signature = createHmac('sha512', 'sk_test_webhook_fixture')
        .update(JSON.stringify(body))
        .digest('hex')
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await client
          .post('/api/payments/paystack/webhook')
          .header('Accept', 'application/json')
          .header('x-paystack-signature', signature)
          .json(body)
        response.assertStatus(200)
      }
      const rows = await db.from('reservations').where('payment_reference', checkout.reference)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].paid_amount, RESERVATION_FEE)
    } finally {
      env.set('PAYSTACK_SECRET_KEY', originalSecret)
      Paystack.prototype.verify = originalVerify
    }
  })

  test('available party sizes track free table capacity, including checkout holds', async ({
    assert,
  }) => {
    await new TableBooking().updateTable(testTableId, {
      name: 'Four seats',
      seats: 4,
      active: true,
    })
    const largeId = randomUUID()
    await db
      .table('dining_tables')
      .insert({ id: largeId, name: 'Eight seats', seats: 8, active: true })
    const payments = new ReservationPayments(new FakePaystack())
    const hold = await payments.create({ ...guest, tableId: largeId })
    const available = await new TableBooking().availability(guest.date, guest.time, 1)
    assert.deepEqual(available.guestOptions, [1, 2, 3, 4])
    await db
      .from('reservation_payments')
      .where('reference', hold.reference)
      .update({ hold_until: 0 })
    const freed = await new TableBooking().availability(guest.date, guest.time, 1)
    assert.deepEqual(freed.guestOptions, [1, 2, 3, 4, 5, 6, 7, 8])
  })
})
