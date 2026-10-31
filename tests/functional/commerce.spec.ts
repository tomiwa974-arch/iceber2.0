import { randomUUID } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import User from '#models/user'
import RestaurantService from '#services/restaurant_service'
import RestaurantOrders from '#services/restaurant_orders'
import ReservationPayments from '#services/reservation_payments'
import PaymentReporting from '#services/payment_reporting'
import Paystack from '#services/paystack'
import webpush from 'web-push'
import { seedTestTable, testTableId, testTableCode } from '../helpers/booking_fixture.js'

const restaurant = new RestaurantService()
const guest = {
  tableId: testTableId,
  name: 'Guest',
  email: 'commerce@example.test',
  phone: '08012345678',
  date: DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate()!,
  time: '18:00',
  guests: 2,
}
const menu = {
  id: 'order-test-dish',
  name: 'Test pasta',
  description: 'Pasta and sauce',
  price: 4500.5,
  category: 'Mains',
  kind: 'food' as const,
  popular: false,
  available: true,
}
const order = () => ({
  id: randomUUID(),
  name: 'Dine-in Guest',
  tableCode: testTableCode,
  tableId: testTableId,
  notes: 'No nuts please',
  items: [{ id: menu.id, quantity: 2 }],
})
class FakeGateway extends Paystack {
  configured() {
    return true
  }
  async initialize(reference: string) {
    return { reference, authorization_url: 'https://checkout.paystack.com/test' }
  }
}
test.group('Payment controls, revenue and dine-in orders', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)
  group.each.setup(async () => {
    await restaurant.createMenu(menu)
    const paystack = env.get('PAYSTACK_SECRET_KEY', '')
    const stripe = env.get('STRIPE_SECRET_KEY', '')
    env.set('PAYSTACK_SECRET_KEY', 'sk_test_commerce_mock')
    env.set('STRIPE_SECRET_KEY', 'sk_test_commerce_mock')
    return () => {
      env.set('PAYSTACK_SECRET_KEY', paystack)
      env.set('STRIPE_SECRET_KEY', stripe)
    }
  })

  test('admins select one or both providers; disabled providers cannot start new checkouts and active checkouts still resume', async ({
    assert,
  }) => {
    const payments = new ReservationPayments(new FakeGateway())
    const checkout = await payments.create(guest)
    await payments.initialize(checkout.reference, 'paystack')
    await new PaymentReporting().save(['stripe'])
    const existing = await payments.show(checkout.reference)
    assert.include(
      existing.providers.map((provider) => provider.id),
      'paystack'
    )
    await payments.initialize(checkout.reference, 'paystack')
    const fresh = await payments.create({ ...guest, time: '15:00' })
    const page = await payments.show(fresh.reference)
    assert.deepEqual(
      page.providers.map((provider) => provider.id),
      ['stripe']
    )
    await rejects(() => payments.initialize(fresh.reference, 'paystack'), /disabled/)
    await new PaymentReporting().save(['paystack', 'stripe'])
    const both = await payments.show(fresh.reference)
    assert.lengthOf(both.providers, 2)
    await rejects(() => new PaymentReporting().save([]), /at least one/)
    env.set('STRIPE_SECRET_KEY', '')
    await rejects(() => new PaymentReporting().save(['stripe']), /credentials/)
  })

  test('revenue accounts for completed, partial and pending refunds without counting unpaid checkouts or food orders', async ({
    assert,
  }) => {
    const payments = new ReservationPayments(new FakeGateway())
    const refs: string[] = []
    for (const time of ['11:00', '14:00', '17:00']) {
      const checkout = await payments.create({ ...guest, time })
      refs.push(checkout.reference)
      await db
        .from('reservation_payments')
        .where('reference', checkout.reference)
        .update({ status: 'Paid', paid_at: new Date(), reservation_id: randomUUID() })
    }
    await db
      .from('reservation_payments')
      .where('reference', refs[2])
      .update({ status: 'ReviewRequired' })
    await db.table('reservation_refunds').insert([
      {
        payment_reference: refs[0],
        reservation_id: randomUUID(),
        amount: 2250000,
        fee_amount: 750000,
        status: 'Processed',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        payment_reference: refs[1],
        reservation_id: randomUUID(),
        amount: 3000000,
        fee_amount: 0,
        status: 'Pending',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])
    await payments.create({
      ...guest,
      date: DateTime.fromISO(guest.date).plus({ days: 1 }).toISODate()!,
    })
    await new RestaurantOrders().create(order(), '127.0.0.1')
    const result = await new PaymentReporting().revenue()
    assert.equal(result.gross, 9000000)
    assert.equal(result.refunded, 2250000)
    assert.equal(result.pendingRefunds, 3000000)
    assert.equal(result.reviewAmount, 3000000)
    assert.equal(result.retained, 750000)
    assert.equal(result.daily.at(-1)!.received, 9000000)
    assert.equal(result.daily.at(-1)!.refunded, 2250000)
  })

  test('guest orders use server prices, persist named tables and create only one notification across retries', async ({
    client,
    assert,
  }) => {
    const payload = order()
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await client
        .post('/api/orders')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...payload, total: 1, items: [{ ...payload.items[0], price: 1 }] })
      response.assertStatus(201)
      assert.equal(response.body().order.total, 900100)
      assert.notProperty(response.body().order, 'phone')
    }
    const rows = await db.from('restaurant_orders').where('id', payload.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].table_name, 'Test Aurora')
    assert.equal(rows[0].phone, '')
    assert.equal(rows[0].notes, payload.notes)
    assert.equal(JSON.parse(rows[0].items)[0].name, menu.name)
    assert.lengthOf(await db.from('admin_notifications').where('order_id', payload.id), 1)
    assert.lengthOf(await db.from('reservation_payments'), 0)
    await rejects(
      () => new RestaurantOrders().create({ ...payload, notes: 'Changed request' }, '127.0.0.1'),
      /already used/
    )
  })

  test('unavailable items, fractional quantities, empty carts and unknown tables cannot create orders', async ({
    client,
    assert,
  }) => {
    for (const patch of [
      { items: [] },
      { items: [{ id: menu.id, quantity: 1.5 }] },
      { items: [{ id: menu.id, quantity: 21 }] },
      { tableId: randomUUID() },
      { name: '<script>alert(1)</script>' },
    ]) {
      const response = await client
        .post('/api/orders')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...order(), ...patch })
      response.assertStatus('tableId' in patch ? 403 : 422)
    }
    await db.from('menu_items').where('id', menu.id).update({ available: false })
    const unavailable = await client
      .post('/api/orders')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json(order())
    unavailable.assertStatus(409)
    assert.lengthOf(await db.from('restaurant_orders'), 0)
  })

  test('orders stay private, admin transitions are enforced and order notifications appear in the inbox', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({
      fullName: 'Order admin',
      email: 'orders-admin@example.test',
      password: 'Strong-orders-2026!',
      isAdmin: true,
    })
    const payload = order()
    await new RestaurantOrders().create(payload, '127.0.0.1')
    const publicState = await restaurant.publicState()
    assert.notInclude(JSON.stringify(publicState), payload.name)
    for (const path of ['/api/admin/orders', '/api/admin/payments']) {
      const denied = await client.get(path).header('Accept', 'application/json')
      denied.assertStatus(401)
    }
    const state = await restaurant.adminState(admin.id)
    assert.equal(state.notifications[0].orderId, payload.id)
    await rejects(() => new RestaurantOrders().update(payload.id, 'Served'), /cannot move/)
    for (const status of ['Accepted', 'Preparing', 'Ready', 'Served'])
      await new RestaurantOrders().update(payload.id, status)
    await rejects(() => new RestaurantOrders().update(payload.id, 'Pending'), /cannot move/)
    const listed = await client
      .get('/api/admin/orders')
      .loginAs(admin)
      .header('Accept', 'application/json')
    listed.assertStatus(200)
    assert.equal(listed.body().orders[0].status, 'Served')
    const denied = await client
      .put('/api/admin/payments/providers')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ providers: ['stripe'] })
    denied.assertStatus(401)
  })

  test('order laptop alerts use the existing admin subscriptions and are not repeated on retry', async ({
    assert,
  }) => {
    const admin = await User.create({
      fullName: 'Push admin',
      email: 'order-push@example.test',
      password: 'Strong-password-2026!',
      isAdmin: true,
    })
    await db.table('admin_push_subscriptions').insert({
      id: 'mock-order-subscription',
      user_id: admin.id,
      subscription: JSON.stringify({ endpoint: 'https://example.test/push' }),
    })
    const original = webpush.sendNotification
    const keys = {
      public: env.get('VAPID_PUBLIC_KEY', ''),
      private: env.get('VAPID_PRIVATE_KEY', ''),
      subject: env.get('VAPID_SUBJECT', ''),
    }
    const payloads: string[] = []
    env.set('VAPID_PUBLIC_KEY', 'mock-public')
    env.set('VAPID_PRIVATE_KEY', 'mock-private')
    env.set('VAPID_SUBJECT', 'mailto:test@example.test')
    webpush.sendNotification = async (_subscription, payload) => {
      payloads.push(String(payload))
      return { statusCode: 201, body: '', headers: {} }
    }
    try {
      const payload = order()
      await new RestaurantOrders().create(payload, '127.0.0.1')
      await new RestaurantOrders().create(payload, '127.0.0.1')
      assert.lengthOf(payloads, 1)
      assert.equal(JSON.parse(payloads[0]).kind, 'order')
      assert.notInclude(payloads[0], payload.name)
    } finally {
      webpush.sendNotification = original
      env.set('VAPID_PUBLIC_KEY', keys.public)
      env.set('VAPID_PRIVATE_KEY', keys.private)
      env.set('VAPID_SUBJECT', keys.subject)
    }
  })

  test('payment controls and order updates reject regular users and require CSRF for administrators', async ({
    client,
  }) => {
    const regular = await User.create({
      fullName: 'Regular',
      email: 'commerce-regular@example.test',
      password: 'Strong-password-2026!',
      isAdmin: false,
    })
    const admin = await User.create({
      fullName: 'Admin',
      email: 'commerce-security@example.test',
      password: 'Strong-password-2026!',
      isAdmin: true,
    })
    const payload = order()
    await new RestaurantOrders().create(payload, '127.0.0.1')
    for (const path of ['/api/admin/orders', '/api/admin/payments']) {
      const denied = await client.get(path).loginAs(regular).header('Accept', 'application/json')
      denied.assertStatus(403)
    }
    const settings = await client
      .put('/api/admin/payments/providers')
      .loginAs(regular)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ providers: ['stripe'] })
    settings.assertStatus(403)
    const update = await client
      .patch(`/api/admin/orders/${payload.id}`)
      .loginAs(regular)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ status: 'Accepted' })
    update.assertStatus(403)
    const noCsrf = await client
      .put('/api/admin/payments/providers')
      .loginAs(admin)
      .header('Accept', 'application/json')
      .json({ providers: ['stripe'] })
    noCsrf.assertStatus(419)
    const guestNoCsrf = await client
      .post('/api/orders')
      .header('Accept', 'application/json')
      .json(order())
    guestNoCsrf.assertStatus(419)
  })
})
