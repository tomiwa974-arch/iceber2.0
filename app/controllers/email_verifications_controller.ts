import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import RestaurantService from '#services/restaurant_service'
import EmailVerification from '#services/email_verification'

const requestValidator = vine.create({
  purpose: vine.enum(['booking', 'cancel']).optional(),
  reservationId: vine.string().uuid().optional(),
  email: vine.string().trim().maxLength(254).email().toLowerCase(),
})
const verifyValidator = vine.create({
  email: vine.string().trim().maxLength(254).email().toLowerCase(),
  id: vine.string().uuid(),
  code: vine.string().regex(/^[0-9]{6}$/),
})
export default class EmailVerificationsController {
  async request({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const {
      email,
      purpose = 'booking',
      reservationId,
    } = await request.validateUsing(requestValidator)
    if (purpose === 'cancel') {
      if (!reservationId)
        return response.unprocessableEntity({ message: 'A booking reference is required.' })
      await new RestaurantService().manageReservation(reservationId, email)
    }
    return new EmailVerification().request(
      email,
      request.ip(),
      purpose,
      purpose === 'cancel' ? reservationId! : ''
    )
  }
  async verify({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { email, id, code } = await request.validateUsing(verifyValidator)
    return new EmailVerification().verify(id, email, code)
  }
}
