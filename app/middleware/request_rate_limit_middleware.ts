import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { clientRateKey, enforceLimit, RateLimitExceeded } from '#services/security_limits'
import { rateLimits } from '#config/rate_limits'

/** Runs before request-body parsing, including for unknown dynamic URLs. */
export default class RequestRateLimitMiddleware {
  async handle({ request, response, logger }: HttpContext, next: NextFn) {
    const ip = clientRateKey(request.ip())
    const path = request.url().replace(/\/+$/, '') || '/'
    const method = request.method()
    const check = async () => {
      if (method === 'POST' && /^\/api\/payments\/(paystack|stripe)\/webhook$/.test(path)) {
        // Provider retries have their own generous quota; signatures are still mandatory.
        const policy = rateLimits.webhook
        await enforceLimit(`http:webhook:${path}:${ip}`, policy.limit, policy.windowMs)
        return
      }
      await enforceLimit(
        `http:dynamic:${ip}`,
        rateLimits.dynamic.limit,
        rateLimits.dynamic.windowMs
      )
      if (path === '/api' || path.startsWith('/api/')) {
        await enforceLimit(`http:api:${ip}`, rateLimits.api.limit, rateLimits.api.windowMs)
      } else if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        await enforceLimit(
          `http:writes:${ip}`,
          rateLimits.otherWrites.limit,
          rateLimits.otherWrites.windowMs
        )
      }
    }
    try {
      await check()
    } catch (error) {
      if (error instanceof RateLimitExceeded) throw error
      logger.error({ err: error }, 'Request limiter storage unavailable')
      response.header('Retry-After', '5')
      response.header('Cache-Control', 'no-store')
      return response.serviceUnavailable({
        message: 'Request protection is temporarily unavailable. Please try again shortly.',
      })
    }
    return next()
  }
}
