// Explicit integration check: uses a disposable MySQL schema, never restaurant records.
// Run with: node tests/mysql_booking_concurrency.mjs
import '@poppinss/ts-exec'
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { Ignitor } from '@adonisjs/core/ignitor'
import { DateTime } from 'luxon'

const root = new URL('../', import.meta.url)
const { default: env } = await import('../start/env.js')
const schema = `iceberg_booking_test_${randomUUID().replaceAll('-', '')}`
assert.match(schema, /^iceberg_booking_test_[a-f0-9]{32}$/)
const connection = await mysql.createConnection({
  host: env.get('DB_HOST', '127.0.0.1'), port: env.get('DB_PORT', 3306),
  user: env.get('DB_USER', 'root'), password: env.get('DB_PASSWORD', ''),
})
const app = new Ignitor(root, { importer: (path) => import(path.startsWith('.') ? new URL(path, root).href : path) }).createApp('console')
let created = false
try {
  await connection.query('CREATE DATABASE ??', [schema])
  created = true
  env.set('DB_DATABASE', schema)
  env.set('DB_CONNECTION', 'mysql')
  env.set('VAPID_PUBLIC_KEY', '')
  await app.init()
  await app.boot()
  await app.start(async () => {
    const { default: db } = await import('@adonisjs/lucid/services/db')
    const { MigrationRunner } = await import('@adonisjs/lucid/migration')
    const runner = new MigrationRunner(db, app, { direction: 'up' })
    await runner.run()
    if (runner.error) throw runner.error
    const { consumeLimit, securityDigest } = await import('../app/services/security_limits.js')
    const counterKey = 'mysql-concurrent-rate-limit'
    for (let round = 0; round < 2; round++) {
      const limits = await Promise.allSettled(Array.from({ length: 16 }, () => consumeLimit(counterKey, 5, 60000)))
      const errors = limits.filter(result => result.status === 'rejected')
      assert.equal(errors.length, 0, 'Concurrent counter requests must not deadlock or fail')
      const decisions = limits.map(result => result.value)
      assert.equal(decisions.filter(result => result.allowed).length, 5)
      assert.equal(decisions.filter(result => !result.allowed).length, 11)
      await db.from('security_limits').where('key', securityDigest(counterKey)).update({ expires: Date.now() - 1 })
    }
    console.log('PASS: parallel MySQL rate-limit counters admit exactly 5 of 16 requests without deadlocks, including after window expiry.')
    const { default: RestaurantService } = await import('../app/services/restaurant_service.js')
    const service = new RestaurantService()
    const tableId = randomUUID()
    await db.table('dining_tables').insert({ id: tableId, name: 'Concurrency test', seats: 8, active: true })
    const payload = {
      tableId, name: 'Concurrency test', email: 'concurrency@example.test', phone: '08012345678',
      date: DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate(), time: '12:00', guests: 2,
    }
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.createReservation(payload)))
    const accepted = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.equal(accepted.length, 1, 'Exactly one simultaneous booking must succeed')
    assert.equal(rejected.length, 7)
    for (const result of rejected) assert.equal(result.reason.status, 409)
    const rows = await db.from('reservations').where('table_id', tableId)
    assert.equal(rows.length, 1)
    await assert.rejects(() => service.createReservation({ ...payload, time: '14:00' }), { status: 409 })
    await service.createReservation({ ...payload, time: '15:00' })
    console.log('PASS: 8 simultaneous MySQL requests produced 1 booking and 7 conflicts; cleanup blocks 14:00 and the next hourly start at 15:00 succeeds.')
    const { default: ReservationPayments } = await import('../app/services/reservation_payments.js')
    const paymentTable = randomUUID()
    await db.table('dining_tables').insert({ id: paymentTable, name: 'Payment concurrency', seats: 8, active: true })
    const paymentPayload = { ...payload, tableId: paymentTable }
    const fakeGateway = { configured: () => true, verify: async (reference) => ({ reference, status: 'success', amount: 3000000, currency: 'NGN', id: `test-${reference}`, customer: { email: payload.email } }) }
    const payments = new ReservationPayments(fakeGateway)
    const holds = await Promise.allSettled(Array.from({ length: 8 }, () => payments.create(paymentPayload)))
    const held = holds.filter((result) => result.status === 'fulfilled')
    assert.equal(held.length, 1)
    for (const result of holds.filter((item) => item.status === 'rejected')) assert.equal(result.reason.status, 409)
    const paidResults = await Promise.all(Array.from({ length: 8 }, () => payments.verify(held[0].value.reference)))
    assert.ok(paidResults.every((result) => result.status === 'Paid'))
    const paidRows = await db.from('reservations').where('table_id', paymentTable)
    assert.equal(paidRows.length, 1)
    console.log('PASS: 8 simultaneous checkout requests produced 1 hold; 8 repeated payment confirmations produced exactly 1 paid booking.')
    const { default: ReservationRefunds } = await import('../app/services/reservation_refunds.js')
    let refundCalls = 0
    const fakeRefundGateway = { configured: () => true, refund: async (reference, amount, reservationId) => {
      refundCalls++
      return { id: `refund-${reference}`, amount, currency: 'NGN', status: 'pending', merchant_note: `iceberg-refund:${reservationId}` }
    } }
    const refunds = new ReservationRefunds(fakeRefundGateway)
    await db.transaction(async (trx) => { await refunds.queue(trx, paidRows[0], 2250000, 750000) })
    await Promise.all(Array.from({ length: 8 }, () => refunds.submit(held[0].value.reference)))
    assert.equal(refundCalls, 1)
    const refundRows = await db.from('reservation_refunds')
    assert.equal(refundRows.length, 1)
    assert.equal(refundRows[0].amount, 2250000)
    console.log('PASS: 8 simultaneous refund submissions produced exactly 1 provider request for the partial refund.')
  })
} finally {
  await app.terminate()
  if (created) await connection.query('DROP DATABASE ??', [schema])
  await connection.end()
}
