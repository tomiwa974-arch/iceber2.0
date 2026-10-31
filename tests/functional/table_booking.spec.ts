import { emailProof } from '#services/email_verification'
import { randomUUID } from 'node:crypto'
import { rejects } from 'node:assert/strict'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import RestaurantService from '#services/restaurant_service'
import TableBooking from '#services/table_booking'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

const bookings = new RestaurantService()
const tables = new TableBooking()
const date = DateTime.now().setZone('Africa/Lagos').plus({ weeks: 1 }).startOf('week').toISODate()!
const guest = {
  tableId: testTableId,
  name: 'Table Guest',
  email: 'table@example.test',
  phone: '08012345678',
  date,
  time: '18:00',
  guests: 2,
}

test.group('Named table booking and opening hours', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('overlaps are rejected in both directions; cleanup also blocks adjacent two-hour starts', async ({
    assert,
  }) => {
    const config = await tables.configuration()
    await tables.saveHours(config.hours.map((day) => ({ ...day, close: '23:30' })))
    await bookings.createReservation(guest)
    for (const time of ['16:00', '16:01', '17:00', '18:00', '19:59', '20:00']) {
      await rejects(() => bookings.createReservation({ ...guest, time }), /overlapping|scheduled/)
    }
    await bookings.createReservation({ ...guest, time: '15:00' })
    const rows = await db.from('reservations').where('table_id', testTableId)
    assert.lengthOf(rows, 2)
  })

  test('cleanup blocks all ten minutes and frees the table exactly at its end, including payment holds', async ({
    assert,
  }) => {
    await bookings.createReservation(guest)
    assert.lengthOf(await tables.blockers(db.connection(), date, '20:00'), 1)
    assert.lengthOf(await tables.blockers(db.connection(), date, '20:09'), 1)
    assert.lengthOf(await tables.blockers(db.connection(), date, '20:10'), 0)
    assert.lengthOf(await tables.blockers(db.connection(), date, '15:50'), 0)
    assert.lengthOf(await tables.blockers(db.connection(), date, '15:51'), 1)
    await db.from('reservations').delete()
    const { default: ReservationPayments } = await import('#services/reservation_payments')
    await new ReservationPayments().create(guest)
    assert.lengthOf(await tables.blockers(db.connection(), date, '20:09'), 1)
    assert.lengthOf(await tables.blockers(db.connection(), date, '20:10'), 0)
  })

  test('different tables can be booked at the same time and availability stays private', async ({
    client,
    assert,
  }) => {
    const other = randomUUID()
    await db.table('dining_tables').insert({ id: other, name: 'Coral', seats: 4, active: true })
    await bookings.createReservation(guest)
    const response = await client
      .get(`/api/reservations/availability?date=${date}&time=18:00&guests=2`)
      .header('Accept', 'application/json')
    response.assertStatus(200)
    assert.isFalse(response.body().tables.find((table: any) => table.id === testTableId).available)
    assert.isTrue(response.body().tables.find((table: any) => table.id === other).available)
    assert.notInclude(JSON.stringify(response.body()), guest.email)
    await bookings.createReservation({ ...guest, tableId: other })
  })

  test('capacity, retired and unknown table IDs are enforced on submission', async ({ client }) => {
    await tables.updateTable(testTableId, { name: 'Small Pearl', seats: 2, active: true })
    for (const payload of [
      { ...guest, guests: 3 },
      { ...guest, tableId: randomUUID() },
    ]) {
      const response = await client
        .post('/api/reservations')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...payload, acceptedTerms: true, verificationToken: emailProof(payload.email) })
      response.assertStatus(409)
    }
    await tables.updateTable(testTableId, { name: 'Small Pearl', seats: 2, active: false })
    await rejects(() => bookings.createReservation(guest), /no longer available/)
  })

  test('entire two-hour booking must fit inside opening hours; closed and invalid dates cannot book', async ({
    client,
  }) => {
    for (const payload of [
      { time: '10:59' },
      { time: '20:01' },
      { time: '23:00' },
      { date: '2027-02-30' },
      { date: '2020-01-01' },
    ]) {
      const response = await client
        .post('/api/reservations')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...guest, ...payload, acceptedTerms: true })
      response.assertStatus(422)
    }
    const config = await tables.configuration()
    await tables.saveHours(config.hours.map((day) => ({ ...day, closed: day.day === 1 })))
    await rejects(() => bookings.createReservation(guest), /closed/)
  })

  test('guest cancellation frees a table immediately; no-show expiry frees it without a scheduled job', async ({
    assert,
  }) => {
    const first = await bookings.createReservation(guest)
    await bookings.manageReservation(first.id, guest.email, 'Plans changed')
    const free = await tables.availability(date, '18:00', 2)
    assert.isTrue(free.tables[0].available)
    const second = await bookings.createReservation(guest)
    // A pending no-show started 61 minutes ago, while its two-hour window is still open.
    const old = DateTime.now().setZone('Africa/Lagos').minus({ minutes: 61 })
    await db
      .from('reservations')
      .where('id', second.id)
      .update({ date: old.toISODate(), time: old.toFormat('HH:mm') })
    const soon = old.plus({ minutes: 75 })
    const blockers = await tables.blockers(
      db.connection(),
      soon.toISODate()!,
      soon.toFormat('HH:mm')
    )
    assert.lengthOf(blockers, 0)
    await db.from('reservations').where('id', second.id).update({ status: 'Confirmed' })
    const occupied = await tables.blockers(
      db.connection(),
      soon.toISODate()!,
      soon.toFormat('HH:mm')
    )
    assert.lengthOf(occupied, 1)
  })

  test('table count adds unique names and cannot retire tables with upcoming bookings', async ({
    assert,
  }) => {
    await tables.setCount(3)
    const config = await tables.configuration()
    assert.lengthOf(config.tables, 3)
    assert.equal(new Set(config.tables.map((table) => table.name)).size, 3)
    await bookings.createReservation(guest)
    await tables.setCount(1)
    const reduced = await tables.configuration()
    assert.equal(reduced.tables[0].id, testTableId)
    await rejects(() => tables.setCount(0), /upcoming bookings/)
    await rejects(
      () => tables.updateTable(testTableId, { name: 'Test Aurora', seats: 1, active: true }),
      /upcoming booking/
    )
    const history = await tables.configuration(db.connection(), true)
    assert.lengthOf(history.tables, 3)
  })

  test('custom table names are optional and numbered defaults remain unique and stable', async ({
    assert,
    client,
  }) => {
    const admin = await User.create({
      fullName: 'Table manager',
      email: 'numbered-tables@example.test',
      password: 'Strong-test-password-2026!',
      isAdmin: true,
    })
    const saveBlank = await client
      .put(`/api/admin/tables/${testTableId}`)
      .loginAs(admin)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ name: '', seats: 8, active: true })
    saveBlank.assertStatus(200)
    const first = await tables.configuration()
    assert.equal(first.tables[0].name, 'Table 1')
    await tables.setCount(3)
    let current = await tables.configuration()
    assert.sameMembers(
      current.tables.map((table) => table.name),
      ['Table 1', 'Table 2', 'Table 3']
    )
    const withoutName = await client
      .put(`/api/admin/tables/${testTableId}`)
      .loginAs(admin)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ seats: 8, active: true })
    withoutName.assertStatus(200)
    await tables.updateTable(testTableId, { name: 'Window seat', seats: 8, active: true })
    await tables.updateTable(testTableId, { name: null, seats: 8, active: true })
    current = await tables.configuration()
    assert.equal(current.tables.find((table) => table.id === testTableId)!.name, 'Table 1')
    assert.equal(new Set(current.tables.map((table) => table.name)).size, 3)
  })

  test('hours changes cannot exclude existing reservations and all seven days are required', async ({
    client,
  }) => {
    await bookings.createReservation(guest)
    const config = await tables.configuration()
    await rejects(
      () => tables.saveHours(config.hours.map((day) => ({ ...day, close: '19:00' }))),
      /existing booking/
    )
    const admin = await User.create({
      fullName: 'Manager',
      email: 'manager@example.test',
      password: 'Long-test-password!',
      isAdmin: true,
    })
    for (const hours of [
      config.hours.slice(1),
      config.hours.map(() => config.hours[0]),
      config.hours.map((day) => ({ ...day, open: '22:00', close: '02:00' })),
    ]) {
      const response = await client
        .put('/api/admin/booking-hours')
        .loginAs(admin)
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ hours })
      response.assertStatus(422)
    }
  })

  test('unassigned earlier bookings block new bookings until assigned and table reassignment checks conflicts', async ({
    assert,
  }) => {
    const other = randomUUID()
    await db.table('dining_tables').insert({ id: other, name: 'Willow', seats: 8, active: true })
    const first = await bookings.createReservation(guest)
    await db.from('reservations').where('id', first.id).update({ table_id: null, table_name: null })
    const blocked = await tables.availability(date, '18:00', 2)
    assert.isTrue(blocked.tables.every((table) => !table.available))
    await bookings.assignTable(first.id, testTableId)
    const next = await bookings.createReservation({ ...guest, tableId: other })
    await rejects(() => bookings.assignTable(next.id, testTableId), /overlapping/)
    const assigned = await bookings.manageReservation(first.id, guest.email)
    assert.equal(assigned.tableName, 'Test Aurora')
  })

  test('only administrators can change tables, opening hours or assignments', async ({
    client,
  }) => {
    for (const [method, path] of [
      ['put', '/api/admin/tables/count'],
      ['put', `/api/admin/tables/${testTableId}`],
      ['put', '/api/admin/booking-hours'],
      ['patch', `/api/admin/reservations/${randomUUID()}/table`],
    ] as const) {
      const response = await client[method](path)
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({})
      response.assertStatus(401)
    }
  })
})
