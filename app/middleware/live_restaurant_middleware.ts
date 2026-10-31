import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class LiveRestaurantMiddleware {
  async handle({ response }: HttpContext, next: NextFn) {
    if (!env.get('RESTAURANT_LIVE', false)) {
      return response.serviceUnavailable({
        message:
          'This is a demonstration template. Customer submissions and payments are disabled.',
      })
    }
    return next()
  }
}
