import { createHmac } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Stripe from '#services/stripe'
import ReservationPayments from '#services/reservation_payments'
import RestaurantService from '#services/restaurant_service'
import ReservationRefunds from '#services/reservation_refunds'
import { DateTime } from 'luxon'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

const guest = {
  tableId: testTableId,
  name: 'Stripe Guest',
  email: 'stripe@example.test',
  phone: '08012345678',
  date: DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate()!,
  time: '18:00',
  guests: 2,
}

test.group('Stripe payments and refunds', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)
  group.each.setup(() => {
    const oldKey = env.get('STRIPE_SECRET_KEY', '')
    const oldWebhook = env.get('STRIPE_WEBHOOK_SECRET', '')
    env.set('STRIPE_SECRET_KEY', 'sk_test_mock_only')
    env.set('STRIPE_WEBHOOK_SECRET', 'whsec_mock_only')
    return () => {
      env.set('STRIPE_SECRET_KEY', oldKey)
      env.set('STRIPE_WEBHOOK_SECRET', oldWebhook)
    }
  })

  test('checkout stores provider, verifies authoritatively once and refunds through Stripe', async ({
    assert,
    client,
  }) => {
    const original = globalThis.fetch
    const requests: { url: string; body: URLSearchParams; key: string | null }[] = []
    let reference = ''
    let reservationId = ''
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      const body = new URLSearchParams(String(init?.body ?? ''))
      requests.push({ url, body, key: new Headers(init?.headers).get('Idempotency-Key') })
      if (url.endsWith('/checkout/sessions'))
        return Response.json({
          id: 'cs_test_mock',
          client_reference_id: reference,
          url: 'https://checkout.stripe.com/c/pay/mock',
        })
      if (url.endsWith('/checkout/sessions/cs_test_mock'))
        return Response.json({
          id: 'cs_test_mock',
          client_reference_id: reference,
          amount_total: 3000000,
          currency: 'ngn',
          payment_status: 'paid',
          payment_intent: 'pi_mock',
          customer_email: guest.email,
          livemode: false,
        })
      if (url.endsWith('/refunds'))
        return Response.json({
          id: 're_mock',
          amount: Number(body.get('amount')),
          currency: 'ngn',
          status: 'succeeded',
          metadata: { reservation_id: reservationId },
        })
      throw new Error(`Unexpected request: ${url}`)
    }
    try {
      const service = new ReservationPayments()
      const created = await service.create(guest)
      reference = created.reference
      const available = await service.show(reference)
      assert.include(
        available.providers.map((provider) => provider.id),
        'stripe'
      )
      await service.initialize(reference, 'stripe')
      await service.initialize(reference, 'stripe')
      await rejects(() => service.initialize(reference, 'paystack'), /another provider/)
      assert.lengthOf(
        requests.filter((request) => request.url.endsWith('/checkout/sessions')),
        1
      )
      assert.equal(requests[0].body.get('line_items[0][price_data][unit_amount]'), '3000000')
      assert.equal(requests[0].body.get('line_items[0][price_data][currency]'), 'ngn')
      assert.isFalse(requests[0].body.has('payment_method_types[0]'))
      assert.equal(requests[0].key, `iceberg-checkout-${reference}`)
      const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_mock' } } }
      const timestamp = Math.floor(Date.now() / 1000)
      const signature =
        't=' +
        timestamp +
        ',v1=' +
        createHmac('sha256', 'whsec_mock_only')
          .update(timestamp + '.' + JSON.stringify(event))
          .digest('hex')
      const response = await client
        .post('/api/payments/stripe/webhook')
        .header('stripe-signature', signature)
        .json(event)
      response.assertStatus(200)
      const paid = await service.verify(reference)
      reservationId = paid.reservationId!
      assert.equal(paid.status, 'Paid')
      assert.equal(paid.provider, 'stripe')
      await service.verify(reference)
      assert.lengthOf(await db.from('reservations').where('payment_reference', reference), 1)
      await new RestaurantService().manageReservation(
        reservationId,
        guest.email,
        'Changed plans',
        3000000
      )
      const refund = await db
        .from('reservation_refunds')
        .where('payment_reference', reference)
        .first()
      assert.equal(refund.status, 'Processed')
      assert.equal(requests.at(-1)!.body.get('payment_intent'), 'pi_mock')
      assert.equal(requests.at(-1)!.key, `iceberg-refund-${reference}`)
      await new ReservationRefunds().submit(reference)
      assert.lengthOf(
        requests.filter((request) => request.url.endsWith('/refunds')),
        1
      )
    } finally {
      globalThis.fetch = original
    }
  })

  test('a timed-out checkout keeps its provider and cannot start a second provider checkout', async ({
    assert,
  }) => {
    const original = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('Simulated network timeout')
    }
    try {
      const payments = new ReservationPayments()
      const checkout = await payments.create(guest)
      await rejects(() => payments.initialize(checkout.reference, 'stripe'), /could not confirm/)
      const row = await db
        .from('reservation_payments')
        .where('reference', checkout.reference)
        .first()
      assert.equal(row.provider, 'stripe')
      assert.isTrue(Boolean(row.provider_selected))
      await rejects(() => payments.initialize(checkout.reference, 'paystack'), /another provider/)
    } finally {
      globalThis.fetch = original
    }
  })

  test('Stripe rejection messages explain configuration problems without exposing raw provider data', async ({
    assert,
  }) => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = async () =>
        Response.json(
          {
            error: {
              type: 'idempotency_error',
              message: 'Sensitive provider detail: sk_test_mock_only customer@example.test',
            },
          },
          { status: 400 }
        )
      await rejects(
        () => new Stripe().stripeRequest('/checkout/sessions', {}),
        (error: Error) => {
          assert.include(error.message, 'configuration change')
          assert.notInclude(error.message, 'sk_test_mock_only')
          assert.notInclude(error.message, 'customer@example.test')
          return true
        }
      )
      globalThis.fetch = async () =>
        Response.json({ error: { type: 'authentication_error' } }, { status: 401 })
      await rejects(
        () => new Stripe().stripeRequest('/checkout/sessions', {}),
        /account access needs attention/
      )
    } finally {
      globalThis.fetch = original
    }
  })

  test('signed webhooks use exact raw bytes, reject stale signatures, and cannot forge payment success', async ({
    client,
    assert,
  }) => {
    const stripe = new Stripe()
    const raw = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_unknown' } },
    })
    const timestamp = Math.floor(Date.now() / 1000)
    const sign = (time: number) =>
      `t=${time},v1=${createHmac('sha256', 'whsec_mock_only').update(`${time}.${raw}`).digest('hex')}`
    assert.isTrue(stripe.validSignature(raw, sign(timestamp)))
    assert.isFalse(stripe.validSignature(raw + ' ', sign(timestamp)))
    assert.isFalse(stripe.validSignature(raw, sign(timestamp - 301)))
    const response = await client
      .post('/api/payments/stripe/webhook')
      .header('Content-Type', 'application/json')
      .header('stripe-signature', sign(timestamp))
      .json(JSON.parse(raw))
    response.assertStatus(200)
    const forged = await client.post('/api/payments/stripe/webhook').json(JSON.parse(raw))
    forged.assertStatus(401)
    assert.lengthOf(await db.from('reservations'), 0)
  })

  test('Stripe verifies amount, email and currency before accepting a paid session', async () => {
    const original = globalThis.fetch
    try {
      const service = new ReservationPayments()
      const created = await service.create(guest)
      const reference = created.reference
      await db
        .from('reservation_payments')
        .where('reference', reference)
        .update({ provider: 'stripe', checkout_session_id: 'cs_bad' })
      for (const patch of [
        { amount_total: 1 },
        { currency: 'usd' },
        { customer_email: 'other@example.test' },
        { client_reference_id: 'wrong' },
      ]) {
        globalThis.fetch = async () =>
          Response.json({
            id: 'cs_bad',
            client_reference_id: reference,
            amount_total: 3000000,
            currency: 'ngn',
            payment_status: 'paid',
            payment_intent: 'pi_bad',
            customer_email: guest.email,
            livemode: false,
            ...patch,
          })
        await rejects(() => service.verify(reference), /did not match/)
      }
    } finally {
      globalThis.fetch = original
    }
  })
})
