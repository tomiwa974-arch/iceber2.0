import webpush from 'web-push'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

export function pushConfig() {
  const publicKey = env.get('VAPID_PUBLIC_KEY')
  const privateKey = env.get('VAPID_PRIVATE_KEY')
  const subject = env.get('VAPID_SUBJECT')
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

// Delivery is best effort. A failed laptop alert must never undo a saved booking.
export async function notifyDevices(
  message: string,
  kind: 'reservation' | 'order' = 'reservation'
) {
  const config = pushConfig()
  if (!config) return
  try {
    const subscriptions = await db
      .from('admin_push_subscriptions')
      .join('users', 'users.id', 'admin_push_subscriptions.user_id')
      .where('users.is_admin', true)
      .select('admin_push_subscriptions.*')
    await Promise.allSettled(
      subscriptions.map(async (row) => {
        try {
          await webpush.sendNotification(
            JSON.parse(row.subscription),
            JSON.stringify({ message, kind }),
            {
              vapidDetails: config,
              TTL: 3600,
              timeout: 5000,
            }
          )
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode
          if (status === 404 || status === 410)
            await db.from('admin_push_subscriptions').where('id', row.id).delete()
          else logger.warn('A reservation push notification could not be delivered.')
        }
      })
    )
  } catch {
    logger.warn(
      'Reservation push delivery is unavailable; the admin inbox retains the notification.'
    )
  }
}
