import { randomUUID } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import * as OTPAuth from 'otpauth'
import User from '#models/user'
import RestaurantService from '#services/restaurant_service'
import ReservationPayments from '#services/reservation_payments'
import RestaurantOrders from '#services/restaurant_orders'
import { allowAttempt } from '#services/security_limits'
import { authenticator, consumeSecondFactor } from '#services/admin_security'
import { emailProof, validEmailProof } from '#services/email_verification'
import { seedTestTable, testTableId, testTableCode } from '../helpers/booking_fixture.js'
import { cancellationProof } from '../helpers/cancellation_proof.js'

const credentials = {
  fullName: 'Security admin',
  email: 'security@example.test',
  password: 'Security-password-2026!',
  isAdmin: true,
}
const guest = {
  name: 'Security Guest',
  email: 'guest-security@example.test',
  phone: '08012345678',
  date: DateTime.now().setZone('Africa/Lagos').plus({ weeks: 2 }).startOf('week').toISODate()!,
  time: '18:00',
  tableId: testTableId,
  guests: 2,
}
test.group('Persistent security controls', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)
  test('persistent counters cap attempts, separate keys and reset only after expiry', async ({
    assert,
  }) => {
    assert.isTrue(await allowAttempt('test-limit', 2))
    assert.isTrue(await allowAttempt('test-limit', 2))
    assert.isFalse(await allowAttempt('test-limit', 2))
    assert.isTrue(await allowAttempt('another-limit', 2))
    await db.from('security_limits').update({ expires: Date.now() - 1 })
    assert.isTrue(await allowAttempt('test-limit', 2))
  })
  test('one active checkout per email, safe retries and limits on abandoned holds', async ({
    assert,
  }) => {
    const payments = new ReservationPayments()
    const context = { ip: '192.0.2.10' }
    const first = await payments.create(guest, context)
    const retry = await payments.create(guest, context)
    assert.equal(retry.reference, first.reference)
    await rejects(() => payments.create({ ...guest, time: '15:00' }, context), /active checkout/)
    const holds = await db.from('reservation_payments')
    assert.lengthOf(holds, 1)
    await db.from('reservation_payments').update({ hold_until: Date.now() - 1 })
    await payments.create(guest, context)
    await db.from('reservation_payments').update({ hold_until: Date.now() - 1 })
    await payments.create(guest, context)
    await db.from('reservation_payments').update({ hold_until: Date.now() - 1 })
    await rejects(() => payments.create(guest, context), /Too many unpaid/)
  })
  test('orders require a live table-specific code; expired sessions cannot submit', async ({
    assert,
  }) => {
    const orders = new RestaurantOrders()
    const input = {
      id: randomUUID(),
      name: 'Guest',
      tableId: testTableId,
      tableCode: '0000000000000000',
      items: [{ id: 'dish', quantity: 1 }],
    }
    await rejects(() => orders.create(input, '192.0.2.12'), /Ask staff/)
    await db
      .from('table_sessions')
      .where('table_id', testTableId)
      .update({ expires: Date.now() - 1 })
    await rejects(
      () => orders.create({ ...input, tableCode: testTableCode }, '192.0.2.12'),
      /Ask staff/
    )
    assert.lengthOf(await db.from('restaurant_orders'), 0)
  })
  test('cancellation requires a fresh, scoped, unexpired proof and consumes it atomically', async ({
    client,
    assert,
  }) => {
    const restaurant = new RestaurantService()
    const { id } = await restaurant.createReservation(guest)
    const body = { id, email: guest.email, reason: 'Plans changed' }
    for (const verificationToken of [
      undefined,
      emailProof(guest.email),
      emailProof(guest.email, 'cancel', randomUUID()),
    ]) {
      const denied = await client
        .post('/api/reservations/cancel')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...body, verificationToken })
      denied.assertStatus(422)
    }
    const token = await cancellationProof(guest.email, id)
    assert.isFalse(validEmailProof(token, guest.email))
    assert.isTrue(validEmailProof(token, guest.email, 'cancel', id))
    const expiredId = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).id
    await db
      .from('email_verifications')
      .where('id', expiredId)
      .update({ expires: Date.now() - 1 })
    await rejects(
      () => restaurant.manageReservation(id, guest.email, body.reason, 0, token),
      /expired/
    )
    const fresh = await cancellationProof(guest.email, id)
    const ok = await client
      .post('/api/reservations/cancel')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ ...body, verificationToken: fresh })
    ok.assertStatus(200)
    const proof = await db
      .from('email_verifications')
      .where('id', JSON.parse(Buffer.from(fresh.split('.')[0], 'base64url').toString()).id)
      .first()
    assert.isTrue(Boolean(proof.authorization_used))
    await rejects(
      () => restaurant.manageReservation(id, guest.email, body.reason, 0, fresh),
      /already used/
    )
  })
  test('MFA enrollment keeps secrets private, invalidates old sessions and permits recovery sign-in once', async ({
    client,
    assert,
  }) => {
    const user = await User.create(credentials)
    const setup = await client
      .post('/api/admin/security')
      .loginAs(user)
      .withCsrfToken()
      .json({ action: 'begin', password: credentials.password })
    setup.assertStatus(200)
    const secret = setup.body().secret
    assert.match(secret, /^[A-Z2-7]+$/)
    const before = await db.from('admin_security').where('user_id', user.id).first()
    assert.isNull(before.secret)
    assert.notEqual(before.pending_secret, secret)
    const enabled = await client
      .post('/api/admin/security')
      .loginAs(user)
      .withCsrfToken()
      .json({
        action: 'enable',
        password: credentials.password,
        code: authenticator(secret).generate(),
      })
    enabled.assertStatus(200)
    assert.lengthOf(enabled.body().codes, 10)
    const status = await client.get('/api/admin/security').withSession(enabled.session())
    status.assertStatus(200)
    assert.isTrue(status.body().enabled)
    assert.notProperty(status.body(), 'secret')
    const old = await client.get('/api/admin/orders').loginAs(user)
    old.assertStatus(401)
    const signedIn = await client
      .post('/admin/login')
      .withCsrfToken()
      .json({ email: user.email, password: credentials.password })
      .redirects(0)
    assert.include(signedIn.header('location'), '/admin/two-factor')
    signedIn.assertSessionMissing('auth_web')
    const denied = await client.get('/api/admin/orders').withSession(signedIn.session())
    denied.assertStatus(401)
    const code = enabled.body().codes[0]
    const verified = await client
      .post('/admin/two-factor')
      .withSession(signedIn.session())
      .withCsrfToken()
      .json({ code })
      .redirects(0)
    verified.assertSession('auth_web', user.id)
    const privateData = await client.get('/api/admin/security').withSession(verified.session())
    privateData.assertStatus(200)
    assert.equal(privateData.body().recoveryRemaining, 9)
    await rejects(
      () =>
        db.transaction(async (trx) => {
          const row = await trx.from('admin_security').where('user_id', user.id).first()
          await consumeSecondFactor(trx, row, code)
        }),
      /Incorrect or already used/
    )
  })
  test('staff rotate and close private table codes, while previous order retries remain safe', async ({
    client,
    assert,
  }) => {
    const user = await User.create(credentials)
    const start = () =>
      client
        .post('/api/admin/table-sessions/' + testTableId)
        .loginAs(user)
        .withCsrfToken()
        .json({ minutes: 120 })
    const anonymous = await client.get('/api/admin/table-sessions')
    anonymous.assertStatus(401)
    const unknown = await client
      .post('/api/admin/table-sessions/' + randomUUID())
      .loginAs(user)
      .withCsrfToken()
      .json({ minutes: 120 })
    unknown.assertStatus(404)
    const opened = await start()
    opened.assertStatus(200)
    const list = await client.get('/api/admin/table-sessions').loginAs(user)
    list.assertStatus(200)
    const first = list.body().tables.find((table: any) => table.id === testTableId).code
    assert.match(first, /^[A-F0-9]{16}$/)
    const qr = await client.get('/api/admin/table-sessions/' + testTableId + '/qr').loginAs(user)
    qr.assertStatus(200)
    assert.match(qr.body().image, /^data:image\/png;base64,/)
    const renewed = await start()
    renewed.assertStatus(200)
    const fresh = await client.get('/api/admin/table-sessions').loginAs(user)
    const code = fresh.body().tables.find((table: any) => table.id === testTableId).code
    assert.notEqual(first, code)
    const restaurant = new RestaurantService()
    await restaurant.createMenu({
      id: 'session-dish',
      name: 'Pasta',
      description: 'Pasta',
      price: 1000,
      category: 'Mains',
      kind: 'food',
      popular: false,
      available: true,
    })
    const input = {
      id: randomUUID(),
      name: 'Guest',
      tableId: testTableId,
      tableCode: first,
      items: [{ id: 'session-dish', quantity: 1 }],
    }
    const orders = new RestaurantOrders()
    await rejects(() => orders.create(input, '192.0.2.13'), /Ask staff/)
    const order = await orders.create({ ...input, tableCode: code }, '192.0.2.13')
    const closed = await client
      .delete('/api/admin/table-sessions/' + testTableId)
      .loginAs(user)
      .withCsrfToken()
    closed.assertStatus(200)
    assert.deepEqual(await orders.create({ ...input, tableCode: code }, '192.0.2.13'), order)
    await rejects(
      () => orders.create({ ...input, id: randomUUID(), tableCode: code }, '192.0.2.13'),
      /Ask staff/
    )
    assert.lengthOf(await db.from('restaurant_orders'), 1)
  })
  test('password changes require current credentials and invalidate older sessions', async ({
    client,
    assert,
  }) => {
    const user = await User.create(credentials)
    const weak = await client
      .post('/api/admin/security')
      .loginAs(user)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ action: 'password', password: credentials.password, newPassword: 'weak' })
    weak.assertStatus(422)
    const newPassword = 'A-new-secure-password-2026!'
    const changed = await client
      .post('/api/admin/security')
      .loginAs(user)
      .withCsrfToken()
      .json({ action: 'password', password: credentials.password, newPassword })
    changed.assertStatus(200)
    const current = await client.get('/api/admin/security').withSession(changed.session())
    current.assertStatus(200)
    const old = await client.get('/api/admin/orders').loginAs(user)
    old.assertStatus(401)
    const rejected = await client
      .post('/admin/login')
      .withCsrfToken()
      .json({ email: user.email, password: credentials.password })
      .redirects(0)
    rejected.assertSessionMissing('auth_web')
    const login = await client
      .post('/admin/login')
      .withCsrfToken()
      .json({ email: user.email, password: newPassword })
      .redirects(0)
    login.assertSession('auth_web', user.id)
    const revoke = await client
      .post('/api/admin/security')
      .withSession(login.session())
      .withCsrfToken()
      .json({ action: 'revoke', password: newPassword })
    revoke.assertStatus(200)
    const stale = await client.get('/api/admin/security').withSession(changed.session())
    stale.assertStatus(401)
    const active = await client.get('/api/admin/security').withSession(revoke.session())
    active.assertStatus(200)
    assert.isFalse(active.body().enabled)
  })
  test('authenticator codes cannot be replayed and raw secrets remain encrypted', async () => {
    const user = await User.create(credentials)
    const secret = new OTPAuth.Secret({ size: 20 }).base32
    await db
      .table('admin_security')
      .insert({ user_id: user.id, secret: encryption.encrypt(secret) })
    const code = authenticator(secret).generate()
    await db.transaction(async (trx) => {
      const row = await trx.from('admin_security').where('user_id', user.id).forUpdate().first()
      await consumeSecondFactor(trx, row, code)
    })
    await rejects(
      () =>
        db.transaction(async (trx) => {
          const row = await trx.from('admin_security').where('user_id', user.id).forUpdate().first()
          await consumeSecondFactor(trx, row, code)
        }),
      /already used/
    )
  })
})
