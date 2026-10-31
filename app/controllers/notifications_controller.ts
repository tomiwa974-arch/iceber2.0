import { createHash } from 'node:crypto'
import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { pushConfig } from '#services/reservation_notifications'
import { pushSubscriptionValidator } from '#validators/restaurant'

export default class NotificationsController {
  async config({ response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    return { publicKey: pushConfig()?.publicKey ?? null }
  }

  async subscribe({ request, response, auth }: HttpContext) {
    if (!pushConfig())
      return response.serviceUnavailable({
        message: 'Laptop alerts need VAPID configuration on the server.',
      })
    const subscription = await request.validateUsing(pushSubscriptionValidator)
    const endpoint = new URL(subscription.endpoint)
    // Restrict outbound delivery to browser push services, never arbitrary URLs.
    const allowed = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
    ]
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      !(allowed.includes(endpoint.hostname) || endpoint.hostname.endsWith('.notify.windows.com'))
    ) {
      return response.unprocessableEntity({ message: 'Unsupported browser push service.' })
    }
    const id = createHash('sha256').update(subscription.endpoint).digest('hex')
    await db
      .table('admin_push_subscriptions')
      .insert({ id, user_id: auth.user!.id, subscription: JSON.stringify(subscription) })
      .onConflict('id')
      .merge()
    return { message: 'Laptop alerts enabled.' }
  }

  async unsubscribe({ request, auth }: HttpContext) {
    const { endpoint } = await request.validateUsing(
      vine.create({ endpoint: vine.string().maxLength(2048) })
    )
    await db
      .from('admin_push_subscriptions')
      .where('user_id', auth.user!.id)
      .where('id', createHash('sha256').update(endpoint).digest('hex'))
      .delete()
    return { message: 'Laptop alerts disabled.' }
  }

  async read({ request, auth }: HttpContext) {
    const { ids } = await request.validateUsing(
      vine.create({ ids: vine.array(vine.string().uuid()).maxLength(100) })
    )
    const rows = await db.from('admin_notifications').whereIn('id', ids)
    for (const row of rows) {
      await db
        .table('admin_notification_reads')
        .insert({ user_id: auth.user!.id, notification_id: row.id })
        .onConflict(['user_id', 'notification_id'])
        .ignore()
    }
    return { message: 'Notifications read.' }
  }
}
