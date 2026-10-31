import { emailProof } from '#services/email_verification'
import { test } from '@japa/runner'
import env from '#start/env'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'
import RestaurantService from '#services/restaurant_service'

const sampleItem = {
  id: 'test-dish',
  name: 'Test dish',
  description: 'Rice, vegetables, and herb sauce.',
  price: 12500,
  category: 'Mains',
  kind: 'food',
  image: '',
  popular: false,
  available: true,
}
const adminValues = {
  fullName: 'Test Admin',
  email: 'admin@example.test',
  password: 'Test-password-2026!',
  isAdmin: true,
}
const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
const sampleReservation = {
  tableId: testTableId,
  acceptedTerms: true,
  verificationToken: emailProof('guest@example.test'),
  name: 'Test Guest',
  email: 'guest@example.test',
  phone: '08012345678',
  date: futureDate,
  time: '18:00',
  guests: '2',
  specialRequests: 'Window seat',
}

test.group('Restaurant API and admin access', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('newsletter requires a separate affirmative consent', async ({ client }) => {
    for (const consent of [undefined, false]) {
      const result = await client
        .post('/api/newsletter')
        .header('Accept', 'application/json')
        .withCsrfToken()
        .json({ email: 'no-consent@example.test', consent })
      result.assertStatus(422)
    }
  })

  test('demo mode blocks customer submissions before validation or side effects', async ({
    client,
  }) => {
    const original = env.get('RESTAURANT_LIVE', false)
    env.set('RESTAURANT_LIVE', false)
    try {
      for (const path of [
        '/api/newsletter',
        '/api/reservations',
        '/api/orders',
        '/api/email-verification/request',
        '/api/payments/demo/initialize',
      ]) {
        const result = await client
          .post(path)
          .header('Accept', 'application/json')
          .withCsrfToken()
          .json({})
        result.assertStatus(503)
      }
    } finally {
      env.set('RESTAURANT_LIVE', original)
    }
  })

  test('public policy pages render their intended Inertia component', async ({
    client,
    assert,
  }) => {
    for (const policy of ['privacy', 'terms', 'refunds', 'cookies']) {
      const result = await client
        .get(`/${policy}`)
        .header('X-Inertia', 'true')
        .header('X-Inertia-Version', '1')
      result.assertStatus(200)
      assert.equal(result.body().component, 'policy')
      assert.equal(result.body().props.policy, policy)
    }
  })

  test('public state exposes no private guest or subscriber lists', async ({ client, assert }) => {
    const result = await client.get('/api/restaurant').header('Accept', 'application/json')
    result.assertStatus(200)
    assert.isArray(result.body().menu)
    assert.isArray(result.body().specials)
    assert.notProperty(result.body(), 'reservations')
    assert.notProperty(result.body(), 'subscribers')
    assert.notProperty(result.body(), 'users')
    assert.isNumber(result.body().serverTime)
  })

  test('all admin writes reject guests and normal users', async ({ client, assert }) => {
    const regular = await User.create({
      ...adminValues,
      email: 'regular@example.test',
      isAdmin: false,
    })
    const endpoints: ['post' | 'put' | 'delete' | 'patch', string][] = [
      ['post', '/api/admin/menu'],
      ['put', '/api/admin/menu/test-dish'],
      ['delete', '/api/admin/menu/test-dish'],
      ['put', '/api/admin/settings'],
      ['patch', '/api/admin/reservations/absent'],
      ['post', '/api/admin/specials'],
      ['post', '/api/admin/specials/absent/move'],
      ['delete', '/api/admin/specials/absent'],
      ['post', '/api/admin/photos'],
    ]
    const before = await db.from('menu_items').count('* as total').first()
    for (const [method, path] of endpoints) {
      const anonymous = await client[method](path)
        .header('Accept', 'application/json')
        .withCsrfToken()
      anonymous.assertStatus(401)
      const denied = await client[method](path)
        .header('Accept', 'application/json')
        .withCsrfToken()
        .loginAs(regular)
      denied.assertStatus(403)
    }
    ;(await client.get('/api/admin/restaurant').header('Accept', 'application/json')).assertStatus(
      401
    )
    ;(
      await client
        .get('/api/admin/restaurant')
        .header('Accept', 'application/json')
        .loginAs(regular)
    ).assertStatus(403)
    const page = await client.get('/admin').redirects(0)
    page.assertStatus(302)
    assert.include(page.header('location'), '/admin/login')
    assert.equal((await db.from('menu_items').count('* as total').first())!.total, before!.total)
  })

  test('CSRF is required even for logged-in admins', async ({ client }) => {
    const admin = await User.create(adminValues)
    const result = await client
      .post('/api/admin/menu')
      .header('Accept', 'application/json')
      .loginAs(admin)
      .json(sampleItem)
    result.assertStatus(419)
  })

  test('admins persist menu CRUD and hidden items leave the public menu', async ({
    client,
    assert,
  }) => {
    const admin = await User.create(adminValues)
    const created = await client
      .post('/api/admin/menu')
      .header('Accept', 'application/json')
      .loginAs(admin)
      .withCsrfToken()
      .json(sampleItem)
    created.assertStatus(201)
    assert.equal(created.body().item.price, 12500)
    assert.equal(
      (await db.from('menu_items').where('id', sampleItem.id).first())!.name,
      sampleItem.name
    )
    const edited = await client
      .put('/api/admin/menu/test-dish')
      .header('Accept', 'application/json')
      .loginAs(admin)
      .withCsrfToken()
      .json({ ...sampleItem, available: false, price: 15500 })
    edited.assertStatus(200)
    const publicData = await client.get('/api/restaurant').header('Accept', 'application/json')
    assert.isFalse(publicData.body().menu.some((item: any) => item.id === sampleItem.id))
    const adminData = await client
      .get('/api/admin/restaurant')
      .header('Accept', 'application/json')
      .loginAs(admin)
    assert.equal(adminData.body().menu.find((item: any) => item.id === sampleItem.id).price, 15500)
    ;(
      await client
        .delete('/api/admin/menu/test-dish')
        .header('Accept', 'application/json')
        .loginAs(admin)
        .withCsrfToken()
    ).assertStatus(200)
    assert.isNull(await db.from('menu_items').where('id', sampleItem.id).first())
  })

  test('invalid prices and executable image URLs are rejected', async ({ client }) => {
    const admin = await User.create(adminValues)
    for (const input of [
      { ...sampleItem, price: -1 },
      { ...sampleItem, image: 'javascript:alert(1)' },
      { ...sampleItem, image: 'data:image/png;base64,aGVsbG8=' },
    ]) {
      ;(
        await client
          .post('/api/admin/menu')
          .header('Accept', 'application/json')
          .loginAs(admin)
          .withCsrfToken()
          .json(input)
      ).assertStatus(422)
    }
  })

  test('guests reserve without login, admin updates status, public response stays private', async ({
    client,
    assert,
  }) => {
    const created = await client
      .post('/api/reservations')
      .header('Accept', 'application/json')
      .withCsrfToken()
      .json({ ...sampleReservation, status: 'Confirmed' })
    created.assertStatus(201)
    const checkout = created.body().checkout
    assert.isString(checkout.reference)
    const unpaidBookings = await db.from('reservations')
    assert.lengthOf(unpaidBookings, 0)
    await db
      .from('reservation_payments')
      .where('reference', checkout.reference)
      .update({ hold_until: 0 })
    const booking = await new RestaurantService().createReservation({
      ...sampleReservation,
      guests: 2,
    })
    assert.equal(booking.status, 'Pending')
    assert.deepEqual(Object.keys(booking).sort(), ['endTime', 'id', 'status', 'tableName'])
    assert.equal(
      (await db.from('reservations').where('id', booking.id).first())!.email,
      sampleReservation.email
    )
    const admin = await User.create(adminValues)
    const updated = await client
      .patch(`/api/admin/reservations/${booking.id}`)
      .header('Accept', 'application/json')
      .loginAs(admin)
      .withCsrfToken()
      .json({ status: 'Confirmed' })
    updated.assertStatus(200)
    assert.equal(updated.body().reservation.status, 'Confirmed')
    const publicData = await client.get('/api/restaurant').header('Accept', 'application/json')
    assert.notInclude(JSON.stringify(publicData.body()), sampleReservation.email)
  })

  test('reservations validate calendar date, party size, and time in the past', async ({
    client,
  }) => {
    for (const input of [
      { ...sampleReservation, guests: 9 },
      { ...sampleReservation, date: '2026-02-30' },
      { ...sampleReservation, date: '2020-01-01' },
      { ...sampleReservation, time: '25:00' },
    ]) {
      ;(
        await client
          .post('/api/reservations')
          .header('Accept', 'application/json')
          .withCsrfToken()
          .json(input)
      ).assertStatus(422)
    }
  })

  test('newsletter signup is persistent and idempotent', async ({ client, assert }) => {
    for (let i = 0; i < 2; i++)
      (
        await client
          .post('/api/newsletter')
          .header('Accept', 'application/json')
          .withCsrfToken()
          .json({ email: 'NEWS@example.test', consent: true })
      ).assertStatus(200)
    const rows = await db.from('newsletter_subscribers').where('email', 'news@example.test')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].consent_version, '2026-10-31-newsletter-v1')
  })

  test('specials queue uses the server clock and preserves ordered durations', async ({
    client,
    assert,
  }) => {
    const admin = await User.create(adminValues)
    for (const post of [
      { id: 'special-a', title: 'First', durationDays: 1 },
      { id: 'special-b', title: 'Second', durationDays: 3 },
      { id: 'special-c', title: 'Third', durationDays: 2 },
    ]) {
      ;(
        await client
          .post('/api/admin/specials')
          .header('Accept', 'application/json')
          .loginAs(admin)
          .withCsrfToken()
          .json({
            ...post,
            caption: 'Fresh today',
            image: '',
            price: 10000,
            startsAt: 1,
            endsAt: 2,
          })
      ).assertStatus(201)
    }
    const state = await client
      .get('/api/admin/restaurant')
      .header('Accept', 'application/json')
      .loginAs(admin)
    const posts = state.body().specials
    assert.isAbove(posts[0].startsAt, Date.now() - 60000)
    assert.equal(posts[0].endsAt, posts[1].startsAt)
    assert.equal(posts[1].endsAt - posts[1].startsAt, 3 * 86400000)
    const moved = await client
      .post('/api/admin/specials/special-c/move')
      .header('Accept', 'application/json')
      .loginAs(admin)
      .withCsrfToken()
      .json({ direction: -1 })
    moved.assertStatus(200)
    assert.equal(moved.body().specials[1].id, 'special-c')
    const ended = await client
      .delete('/api/admin/specials/special-a')
      .header('Accept', 'application/json')
      .loginAs(admin)
      .withCsrfToken()
    ended.assertStatus(200)
    assert.equal(ended.body().specials[0].id, 'special-c')
    assert.isAtMost(Math.abs(ended.body().specials[0].startsAt - Date.now()), 5000)
  })

  test('first-admin setup hashes its password and locks itself permanently', async ({
    client,
    assert,
  }) => {
    const payload = {
      fullName: 'Owner',
      email: 'owner@example.test',
      password: 'Owner-test-password-2026!',
      passwordConfirmation: 'Owner-test-password-2026!',
      isAdmin: false,
    }
    const created = await client.post('/admin/setup').withCsrfToken().json(payload).redirects(0)
    created.assertStatus(302)
    const user = await User.findByOrFail('email', payload.email)
    assert.isTrue(Boolean(user.isAdmin))
    assert.notEqual(user.password, payload.password)
    assert.isTrue(Boolean((await db.from('admin_bootstrap').where('id', 1).first())!.completed))
    ;(
      await client
        .post('/admin/setup')
        .header('Accept', 'application/json')
        .withCsrfToken()
        .json({ ...payload, email: 'another@example.test' })
        .redirects(0)
    ).assertStatus(404)
  })
})
