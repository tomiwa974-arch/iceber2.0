import { validEmailProof } from '#services/email_verification'
import emailDomain from '#services/email_domain'
import { randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import RestaurantService from '#services/restaurant_service'
import ReservationPayments from '#services/reservation_payments'
import {
  reservationLookupValidator,
  reservationCancelValidator,
  dailySpecialValidator,
  menuItemValidator,
  menuPhotoValidator,
  moveSpecialValidator,
  newsletterValidator,
  reservationStatusValidator,
  reservationValidator,
  restaurantSettingsValidator,
} from '#validators/restaurant'

const restaurant = new RestaurantService()

export default class RestaurantController {
  async show({ response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    return restaurant.publicState()
  }

  async adminShow({ response, auth }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    return restaurant.adminState(auth.user!.id)
  }

  async createMenu({ request, response }: HttpContext) {
    const payload = await request.validateUsing(menuItemValidator)
    const item = await restaurant.createMenu(payload)
    return response.created({ item })
  }

  async updateMenu({ request, params, response }: HttpContext) {
    const payload = await request.validateUsing(menuItemValidator)
    if (payload.id !== params.id) {
      return response.unprocessableEntity({ message: 'The menu item ID cannot be changed.' })
    }
    return { item: await restaurant.updateMenu(params.id, payload) }
  }

  async deleteMenu({ params }: HttpContext) {
    await restaurant.deleteMenu(params.id)
    return { message: 'Menu item deleted.' }
  }

  async createReservation({ request, response }: HttpContext) {
    const { verificationToken, ...payload } = await request.validateUsing(reservationValidator)
    if (!validEmailProof(verificationToken, payload.email))
      return response.unprocessableEntity({
        message: 'Verify your booking email before continuing to payment.',
      })
    const when = DateTime.fromISO(`${payload.date}T${payload.time}`, { zone: 'Africa/Lagos' })
    if (!when.isValid || when.toISODate() !== payload.date || when.toMillis() <= Date.now()) {
      return response.unprocessableEntity({
        message: 'Choose a future reservation date and time (WAT).',
        errors: [
          { field: 'date', message: 'Choose a future date and time (WAT).', rule: 'future' },
        ],
      })
    }
    let acceptsMail: boolean
    try {
      acceptsMail = await emailDomain.acceptsMail(payload.email)
    } catch {
      return response.serviceUnavailable({
        message: 'Email domain could not be checked. Please try again shortly.',
      })
    }
    if (!acceptsMail)
      return response.unprocessableEntity({
        message: 'Enter an email address with a working mail domain.',
        errors: [
          {
            field: 'email',
            message: 'This domain cannot receive email. Check the address.',
            rule: 'mailDomain',
          },
        ],
      })
    return response.created({
      checkout: await new ReservationPayments().create(payload, { ip: request.ip() }),
    })
  }

  async lookupReservation({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id, email } = await request.validateUsing(reservationLookupValidator)
    return { reservation: await restaurant.manageReservation(id, email) }
  }

  async cancelReservation({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id, email, reason, expectedRefundAmount, verificationToken } =
      await request.validateUsing(reservationCancelValidator)
    return {
      reservation: await restaurant.manageReservation(
        id,
        email,
        reason,
        expectedRefundAmount,
        verificationToken
      ),
    }
  }

  async updateReservation({ request, params }: HttpContext) {
    const { status } = await request.validateUsing(reservationStatusValidator)
    return { reservation: await restaurant.updateReservation(params.id, status) }
  }

  async updateSettings({ request }: HttpContext) {
    const payload = await request.validateUsing(restaurantSettingsValidator)
    return { settings: await restaurant.updateSettings(payload) }
  }

  async createSpecial({ request, response }: HttpContext) {
    const payload = await request.validateUsing(dailySpecialValidator)
    return response.created({ specials: await restaurant.createSpecial(payload) })
  }

  async moveSpecial({ request, params }: HttpContext) {
    const { direction } = await request.validateUsing(moveSpecialValidator)
    return { specials: await restaurant.moveSpecial(params.id, direction) }
  }

  async deleteSpecial({ params }: HttpContext) {
    return { specials: await restaurant.deleteSpecial(params.id) }
  }

  async subscribe({ request }: HttpContext) {
    const { email } = await request.validateUsing(newsletterValidator)
    await restaurant.subscribe(email)
    return { message: 'Thank you. You are subscribed to Iceberg updates.' }
  }

  async uploadPhoto({ request, response }: HttpContext) {
    const { image: photo } = await request.validateUsing(menuPhotoValidator)
    // Verify the signature ourselves as well: unknown files may otherwise fall back to their extension.
    const handle = await open(photo.tmpPath!, 'r')
    let extension: 'jpg' | 'png' | 'webp' | undefined
    try {
      const bytes = Buffer.alloc(16)
      await handle.read(bytes, 0, bytes.length, 0)
      if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) extension = 'jpg'
      if (
        bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      )
        extension = 'png'
      if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
        extension = 'webp'
    } finally {
      await handle.close()
    }
    if (!extension) {
      return response.unprocessableEntity({ message: 'Upload a valid JPEG, PNG or WebP photo.' })
    }
    const name = `${randomUUID()}.${extension}`
    await photo.move(app.publicPath('uploads/menu'), { name, overwrite: false })
    if (photo.hasErrors) {
      return response.unprocessableEntity({
        message: 'The photo could not be saved.',
        errors: photo.errors,
      })
    }
    return response.created({ url: `/uploads/menu/${name}` })
  }
}
