import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import PaymentReporting from '#services/payment_reporting'
import RestaurantOrders from '#services/restaurant_orders'

const providersValidator = vine.create({
  providers: vine
    .array(vine.enum(['paystack', 'stripe']))
    .minLength(1)
    .maxLength(2),
})
const orderValidator = vine.create({
  id: vine.string().uuid(),
  name: vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(100)
    .regex(/^[^<>\p{Cc}]+$/u),
  tableId: vine.string().uuid(),
  tableCode: vine.string().trim().maxLength(32),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  items: vine
    .array(
      vine.object({
        id: vine
          .string()
          .maxLength(100)
          .regex(/^[a-zA-Z0-9_-]+$/),
        quantity: vine.number().withoutDecimals().min(1).max(20),
      })
    )
    .minLength(1)
    .maxLength(30),
})
const statusValidator = vine.create({
  status: vine.enum(['Pending', 'Accepted', 'Preparing', 'Ready', 'Served', 'Cancelled']),
})
export default class CommerceController {
  async payments({ response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const reporting = new PaymentReporting()
    return { providers: await reporting.settings(), revenue: await reporting.revenue() }
  }
  async providers({ request }: HttpContext) {
    const { providers } = await request.validateUsing(providersValidator)
    return { providers: await new PaymentReporting().save(providers) }
  }
  async createOrder({ request, response }: HttpContext) {
    const payload = await request.validateUsing(orderValidator)
    return response.created({ order: await new RestaurantOrders().create(payload, request.ip()) })
  }
  async orders({ response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    return { orders: await new RestaurantOrders().list() }
  }
  async updateOrder({ params, request }: HttpContext) {
    const { status } = await request.validateUsing(statusValidator)
    await new RestaurantOrders().update(params.id, status)
    return { message: 'Order status updated.' }
  }
}
