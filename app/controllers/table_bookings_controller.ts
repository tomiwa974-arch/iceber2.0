import type { HttpContext } from '@adonisjs/core/http'
import TableBooking from '#services/table_booking'
import RestaurantService from '#services/restaurant_service'
import {
  availabilityValidator,
  tableCountValidator,
  diningTableValidator,
  bookingHoursValidator,
  tableAssignmentValidator,
} from '#validators/restaurant'

const booking = new TableBooking()
export default class TableBookingsController {
  async availability({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { date, time, guests } = await request.validateUsing(availabilityValidator)
    return booking.availability(date, time, guests)
  }
  async count({ request }: HttpContext) {
    const { count } = await request.validateUsing(tableCountValidator)
    return { booking: await booking.setCount(count) }
  }
  async update({ request, params }: HttpContext) {
    const payload = await request.validateUsing(diningTableValidator)
    return { booking: await booking.updateTable(params.id, payload) }
  }
  async hours({ request }: HttpContext) {
    const { hours, slotIntervalMinutes } = await request.validateUsing(bookingHoursValidator)
    return { booking: await booking.saveHours(hours, slotIntervalMinutes) }
  }
  async assign({ request, params }: HttpContext) {
    const { tableId } = await request.validateUsing(tableAssignmentValidator)
    return { reservation: await new RestaurantService().assignTable(params.id, tableId) }
  }
}
