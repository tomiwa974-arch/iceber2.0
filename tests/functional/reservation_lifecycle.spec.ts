import { cancellationProof } from '../helpers/cancellation_proof.js'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import RestaurantService from '#services/restaurant_service'
import {
  effectiveStatus,
  reservationDeadline,
  reservationVisible,
  EXPIRED_VISIBILITY_MS,
} from '#services/reservation_policy'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

const restaurant = new RestaurantService()
const guest = {
  tableId: testTableId,
  name: 'Guest Name',
  email: 'booking@example.test',
  phone: '08012345678',
  date: DateTime.now().setZone('Africa/Lagos').plus({ days: 1 }).toISODate()!,
  time: '18:00',
  guests: 2,
  specialRequests: '',
}
const adminValues = {
  fullName: 'Staff',
  email: 'staff@example.test',
  password: 'Long-password-2026!',
  isAdmin: true,
}

test.group('Reservation lifecycle and notifications', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('expired reservations disappear exactly 24 hours after expiry, while confirmed and cancelled records remain', ({
    assert,
  }) => {
    const row = { status: 'Pending', date: '2026-10-28', time: '18:00' }
    const cutoff = reservationDeadline(row.date, row.time) + EXPIRED_VISIBILITY_MS
    assert.isTrue(reservationVisible(row, cutoff - 1))
    assert.isFalse(reservationVisible(row, cutoff))
    assert.isFalse(reservationVisible(row, cutoff + 1))
    assert.isTrue(reservationVisible({ ...row, status: 'Confirmed' }, cutoff + 1))
    assert.isTrue(reservationVisible({ ...row, status: 'Cancelled' }, cutoff + 1))
  })

  test('old expired bookings and their notifications disappear from admin and guest lookup', async ({
    client,
    assert,
  }) => {
    const admin = await User.create(adminValues)
    const { id } = await restaurant.createReservation(guest)
    const old = DateTime.now().setZone('Africa/Lagos').minus({ hours: 25 })
    await db
      .from('reservations')
      .where('id', id)
      .update({ date: old.toISODate(), time: old.toFormat('HH:mm') })
    const state = await restaurant.adminState(admin.id)
    assert.lengthOf(state.reservations, 0)
    assert.lengthOf(state.notifications, 0)
    const row = await db.from('reservations').where('id', id).first()
    assert.exists(row)
    const response = await client
      .post('/api/reservations/lookup')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: guest.email })
    response.assertStatus(404)
    const recent = DateTime.now().setZone('Africa/Lagos').minus({ hours: 2 })
    await db
      .from('reservations')
      .where('id', id)
      .update({ date: recent.toISODate(), time: recent.toFormat('HH:mm') })
    const visible = await restaurant.adminState(admin.id)
    assert.equal(visible.reservations[0].status, 'Expired')
    assert.lengthOf(visible.notifications, 1)
  })

  test('manually deleting reservation rows leaves public and admin pages usable and hides orphan notifications', async ({
    assert,
  }) => {
    const admin = await User.create(adminValues)
    const { id } = await restaurant.createReservation(guest)
    await db.from('reservations').where('id', id).delete()
    const publicState = await restaurant.publicState()
    const adminState = await restaurant.adminState(admin.id)
    assert.isArray(publicState.menu)
    assert.lengthOf(adminState.reservations, 0)
    assert.lengthOf(adminState.notifications, 0)
  })

  test('expiry has an exact 30-minute WAT boundary and preserves terminal statuses', ({
    assert,
  }) => {
    const row = { status: 'Pending', date: '2026-10-28', time: '23:50' }
    const deadline = reservationDeadline(row.date, row.time)
    assert.equal(deadline, Date.parse('2026-10-29T00:20:00+01:00'))
    assert.equal(effectiveStatus(row, deadline - 1), 'Pending')
    assert.equal(effectiveStatus(row, deadline), 'Expired')
    assert.equal(effectiveStatus({ ...row, status: 'Confirmed' }, deadline + 1000), 'Confirmed')
    assert.equal(effectiveStatus({ ...row, status: 'Cancelled' }, deadline + 1000), 'Cancelled')
  })

  test('booking terms must be accepted on the server', async ({ client }) => {
    for (const acceptedTerms of [undefined, false]) {
      const result = await client
        .post('/api/reservations')
        .withCsrfToken()
        .header('Accept', 'application/json')
        .json({ ...guest, acceptedTerms })
      result.assertStatus(422)
    }
  })

  test('guest lookup and cancellation require reference and email and save the reason', async ({
    client,
    assert,
  }) => {
    const { id } = await restaurant.createReservation(guest)
    const wrong = await client
      .post('/api/reservations/lookup')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: 'wrong@example.test' })
    wrong.assertStatus(404)
    const found = await client
      .post('/api/reservations/lookup')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: guest.email.toUpperCase() })
    found.assertStatus(200)
    assert.equal(found.body().reservation.status, 'Pending')
    assert.notProperty(found.body().reservation, 'phone')
    const verificationToken = await cancellationProof(guest.email, id)
    const cancelled = await client
      .post('/api/reservations/cancel')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: guest.email, reason: 'Plans changed', verificationToken })
    cancelled.assertStatus(200)
    assert.equal(cancelled.body().reservation.status, 'Cancelled')
    const row = await db.from('reservations').where('id', id).first()
    assert.equal(row!.cancellation_reason, 'Plans changed')
    assert.lengthOf(await db.from('admin_notifications').where('reservation_id', id), 2)
    const again = await client
      .post('/api/reservations/cancel')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ id, email: guest.email, reason: 'Plans changed' })
    again.assertStatus(422)
  })

  test('expired bookings cannot be revived and arrived guests remain confirmed', async ({
    client,
    assert,
  }) => {
    const admin = await User.create(adminValues)
    const { id } = await restaurant.createReservation(guest)
    const recent = DateTime.now().setZone('Africa/Lagos').minus({ hours: 2 })
    await db
      .from('reservations')
      .where('id', id)
      .update({ date: recent.toISODate(), time: recent.toFormat('HH:mm') })
    const state = await restaurant.adminState(admin.id)
    assert.equal(state.reservations.find((item) => item.id === id)!.status, 'Expired')
    const update = await client
      .patch(`/api/admin/reservations/${id}`)
      .loginAs(admin)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ status: 'Confirmed' })
    update.assertStatus(409)
    const next = await restaurant.createReservation(guest)
    const confirmed = await restaurant.updateReservation(next.id, 'Confirmed')
    assert.isString(confirmed.arrivedAt)
    await db.from('reservations').where('id', next.id).update({ date: '2020-01-01' })
    const lookup = await restaurant.manageReservation(next.id, guest.email)
    assert.equal(lookup.status, 'Confirmed')
  })

  test('notification reads belong to the signed-in admin', async ({ client, assert }) => {
    const admin = await User.create(adminValues)
    const other = await User.create({ ...adminValues, email: 'other@example.test' })
    await restaurant.createReservation(guest)
    const state = await restaurant.adminState(admin.id)
    const item = state.notifications[0]
    assert.isFalse(item.read)
    const read = await client
      .post('/api/admin/notifications/read')
      .loginAs(admin)
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ ids: [item.id] })
    read.assertStatus(200)
    const readState = await restaurant.adminState(admin.id)
    const otherState = await restaurant.adminState(other.id)
    assert.isTrue(readState.notifications[0].read)
    assert.isFalse(otherState.notifications[0].read)
    const privateConfig = await client
      .get('/api/admin/notifications/push')
      .header('Accept', 'application/json')
    privateConfig.assertStatus(401)
  })
})
