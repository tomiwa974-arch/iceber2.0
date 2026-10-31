import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { clientRateKey, consumeLimit, securityDigest } from '#services/security_limits'
import EmailVerification from '#services/email_verification'
import RestaurantOrders from '#services/restaurant_orders'
import ReservationPayments from '#services/reservation_payments'
import { BookingMessageGateway, type BookingMessage } from '#services/booking_messages'
import { seedTestTable, testTableCode, testTableId } from '../helpers/booking_fixture.js'

async function seed(key: string, count: number, windowMs = 60_000) {
  await db
    .table('security_limits')
    .insert({ key: securityDigest(key), count, expires: Date.now() + windowMs })
    .onConflict('key')
    .merge()
}

// The test runner may connect over IPv4 or IPv6 depending on the local machine.
async function requester() {
  for (const ip of ['127.0.0.1', clientRateKey('::1')]) {
    if (
      await db
        .from('security_limits')
        .where('key', securityDigest('http:dynamic:' + ip))
        .first()
    )
      return ip
  }
  throw new Error('Expected a loopback HTTP test client.')
}

class MailGateway extends BookingMessageGateway {
  sent: BookingMessage[] = []
  configured() {
    return true
  }
  async send(message: BookingMessage) {
    this.sent.push(message)
    return 'fixture-id'
  }
}

test.group('Layered request rate limiting', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('fixed windows expose a real retry time, cap counters, and reset only at expiry', async ({
    assert,
  }) => {
    const first = await consumeLimit('window-test', 1, 10_000)
    assert.isTrue(first.allowed)
    const blocked = await consumeLimit('window-test', 1, 10_000)
    assert.isFalse(blocked.allowed)
    assert.isAbove(blocked.retryAfter, 0)
    assert.isAtMost(blocked.retryAfter, 10)
    await consumeLimit('window-test', 1, 10_000)
    const row = await db
      .from('security_limits')
      .where('key', securityDigest('window-test'))
      .firstOrFail()
    assert.equal(row.count, 1)
    await db
      .from('security_limits')
      .where('key', row.key)
      .update({ expires: Date.now() - 1 })
    assert.isTrue((await consumeLimit('window-test', 1, 10_000)).allowed)
  })

  test('a limiter store outage returns 503 instead of allowing the request through', async ({
    client,
    assert,
  }) => {
    const original = db.transaction
    db.transaction = (() =>
      Promise.reject(new Error('Fixture limiter storage unavailable'))) as typeof db.transaction
    try {
      const result = await client.get('/api/restaurant').header('Accept', 'application/json')
      result.assertStatus(503)
      assert.equal(result.header('retry-after'), '5')
      assert.notProperty(result.body(), 'menu')
    } finally {
      db.transaction = original
    }
  })

  test('IP normalization groups IPv6 rotations but keeps independent networks separate', ({
    assert,
  }) => {
    assert.equal(clientRateKey('::ffff:192.0.2.10'), '192.0.2.10')
    assert.equal(clientRateKey('::ffff:c000:20a'), '192.0.2.10')
    assert.equal(clientRateKey('2001:db8:1:2::1'), clientRateKey('2001:0db8:0001:0002::ffff'))
    assert.notEqual(clientRateKey('2001:db8:1:2::1'), clientRateKey('2001:db8:1:3::1'))
  })

  test('the combined API quota covers unknown routes and returns Retry-After before CSRF/body validation', async ({
    client,
    assert,
  }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    await seed('http:api:' + ip, 119)
    ;(await client.get('/api/missing-route-one')).assertStatus(404)
    const blocked = await client.post('/api/orders').header('Accept', 'application/json').json({})
    blocked.assertStatus(429)
    assert.isAbove(Number(blocked.header('retry-after')), 0)
    assert.equal(blocked.body().retryAfter, Number(blocked.header('retry-after')))
    assert.equal(blocked.header('cache-control'), 'no-store')
    ;(await client.get('/privacy')).assertStatus(200)
  })

  test('unknown pages consume the broad quota while served static assets remain outside it', async ({
    client,
  }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    await seed('http:dynamic:' + ip, 239)
    ;(await client.get('/missing-page-one')).assertStatus(404)
    ;(await client.get('/different-missing-page')).assertStatus(429)
    ;(await client.get('/reservation-sw.js')).assertStatus(200)
  })

  test('spoofing forwarded headers cannot reset quotas when no proxy is trusted', async ({
    client,
  }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    await seed('endpoint:public-reads:' + ip, 60)
    for (const forged of ['192.0.2.1', '192.0.2.2, 198.51.100.10'])
      (await client.get('/api/restaurant').header('X-Forwarded-For', forged)).assertStatus(429)
  })

  test('read quotas are shared by menu and currency but availability has its own quota', async ({
    client,
  }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    await seed('endpoint:public-reads:' + ip, 60)
    ;(await client.get('/api/currency')).assertStatus(429)
    await seed('endpoint:availability:' + ip, 29)
    ;(
      await client.get('/api/reservations/availability').header('Accept', 'application/json')
    ).assertStatus(422)
    ;(
      await client.get('/api/reservations/availability').header('Accept', 'application/json')
    ).assertStatus(429)
  })

  test('sensitive public routes apply their configured IP quotas before validation', async ({
    client,
  }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    for (const [scope, path, count] of [
      ['newsletter', '/api/newsletter', 5],
      ['email-send', '/api/email-verification/request', 20],
      ['email-verify', '/api/email-verification/verify', 30],
      ['checkout', '/api/reservations', 5],
      ['booking-lookup', '/api/reservations/lookup', 10],
      ['booking-lookup', '/api/reservations/refund-status', 10],
      ['cancellation', '/api/reservations/cancel', 5],
      ['orders', '/api/orders', 30],
    ] as const) {
      await seed(`endpoint:${scope}:${ip}`, count)
      const blocked = await client
        .post(path)
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({})
      blocked.assertStatus(429)
    }
  })

  test('initialization and verification share one payment-reference quota, including encoded aliases', async ({
    client,
  }) => {
    await seed('endpoint:payment-reference:abc123', 10)
    for (const path of ['/api/payments/abc123/initialize', '/api/payments/%61bc123/verify'])
      (
        await client.post(path).withCsrfToken().header('Accept', 'application/json').json({})
      ).assertStatus(429)
  })

  test('webhooks have a separate budget without bypassing signature checks', async ({ client }) => {
    await client.get('/api/restaurant')
    const ip = await requester()
    await seed('http:api:' + ip, 120)
    ;(await client.post('/api/payments/paystack/webhook').json({})).assertStatus(401)
    await seed(`http:webhook:/api/payments/paystack/webhook:${ip}`, 300)
    ;(await client.post('/api/payments/paystack/webhook').json({})).assertStatus(429)
    ;(await client.post('/api/payments/stripe/webhook').json({})).assertStatus(401)
  })

  test('login aliases share failed-login counts and Inertia gets usable form errors', async ({
    client,
    assert,
  }) => {
    const email = 'failed-login@example.test'
    for (let index = 0; index < 5; index++)
      (
        await client
          .post(index % 2 ? '/login' : '/admin/login')
          .withCsrfToken()
          .json({ email, password: 'Wrong-password-2026!' })
          .redirects(0)
      ).assertStatus(302)
    const blocked = await client
      .post('/admin/login')
      .withCsrfToken()
      .json({ email, password: 'Wrong-password-2026!' })
      .redirects(0)
    blocked.assertStatus(429)
    assert.isAbove(Number(blocked.header('retry-after')), 0)
    const inertia = await client
      .post('/login')
      .withCsrfToken()
      .header('X-Inertia', 'true')
      .json({ email, password: 'Wrong-password-2026!' })
      .redirects(0)
    inertia.assertStatus(303)
    assert.include(inertia.flashMessage('inputErrorsBag').email, 'Too many requests')
    ;(
      await client
        .post('/login')
        .withCsrfToken()
        .json({ email: 'other@example.test', password: 'Wrong-password-2026!' })
        .redirects(0)
    ).assertStatus(302)
  })

  test('successful logins do not consume the failed-password quota', async ({ client, assert }) => {
    const admin = await User.create({
      fullName: 'Rate limit test',
      email: 'rate-admin@example.test',
      password: 'Correct-password-2026!',
      isAdmin: true,
    })
    for (let index = 0; index < 2; index++)
      (
        await client
          .post('/admin/login')
          .withCsrfToken()
          .json({ email: admin.email, password: 'Correct-password-2026!' })
          .redirects(0)
      ).assertStatus(302)
    const ip = await requester()
    assert.equal(
      (
        await db
          .from('security_limits')
          .where('key', securityDigest(`login:failed:${ip}:${admin.email}`))
          .first()
      )?.count,
      0
    )
  })

  test('authenticated admin writes and photo uploads have independent quotas', async ({
    client,
  }) => {
    const admin = await User.create({
      fullName: 'Rate limit test',
      email: 'writes@example.test',
      password: 'Correct-password-2026!',
      isAdmin: true,
    })
    await seed('admin:writes:' + admin.id, 60)
    ;(await client.put('/api/admin/settings').loginAs(admin).withCsrfToken().json({})).assertStatus(
      429
    )
    await db
      .from('security_limits')
      .where('key', securityDigest('admin:writes:' + admin.id))
      .delete()
    await seed('admin:photos:' + admin.id, 10)
    ;(await client.post('/api/admin/photos').loginAs(admin).withCsrfToken().json({})).assertStatus(
      429
    )
  })

  test('email cooldowns follow the email rather than blocking every guest on the same Wi-Fi', async ({
    assert,
  }) => {
    const gateway = new MailGateway()
    const service = new EmailVerification(gateway)
    await service.request('one@example.test', '192.0.2.10')
    await service.request('two@example.test', '192.0.2.10')
    await rejects(() => service.request('one@example.test', '192.0.2.20'), { status: 429 })
    await db
      .from('security_limits')
      .where('key', securityDigest('email:minute:one@example.test'))
      .update({ expires: Date.now() - 1 })
    await seed('email:hour:one@example.test', 5, 3600000)
    await rejects(() => service.request('one@example.test', '192.0.2.30'), { status: 429 })
    assert.lengthOf(gateway.sent, 2)
  })

  test('table-order limits use the verified table session', async () => {
    await seed('order:session:' + securityDigest(testTableCode), 10)
    await rejects(
      () =>
        new RestaurantOrders().create(
          {
            id: randomUUID(),
            name: 'Rate test',
            tableId: testTableId,
            tableCode: testTableCode,
            items: [{ id: 'dish', quantity: 1 }],
          },
          '192.0.2.40'
        ),
      { status: 429 }
    )
  })

  test('a fresh MFA session cannot reset the account second-factor quota', async ({ client }) => {
    const admin = await User.create({
      fullName: 'MFA test',
      email: 'mfa-rate@example.test',
      password: 'Correct-password-2026!',
      isAdmin: true,
    })
    await seed('mfa:user:' + admin.id, 5, 300000)
    const blocked = await client
      .post('/admin/two-factor')
      .withSession({
        admin_pending_mfa: {
          userId: admin.id,
          nonce: randomUUID(),
          expires: Date.now() + 300000,
          version: 0,
        },
      })
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ code: '123456' })
      .redirects(0)
    blocked.assertStatus(429)
  })

  test('the verified-email checkout quota is independent of the submitting IP', async () => {
    const email = 'checkout-limit@example.test'
    await seed('checkout:email:' + email, 3, 600000)
    await rejects(
      () =>
        new ReservationPayments().create(
          {
            name: 'Checkout test',
            email,
            phone: '08012345678',
            tableId: testTableId,
            date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            time: '18:00',
            guests: 2,
          },
          { ip: '192.0.2.99' }
        ),
      { status: 429 }
    )
  })
})
