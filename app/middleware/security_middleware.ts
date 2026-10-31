import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { clientRateKey, enforceLimit } from '#services/security_limits'
import { rateLimits, type RatePolicy } from '#config/rate_limits'

export default class SecurityMiddleware {
  async handle({ request, response, view }: HttpContext, next: NextFn) {
    view.share({ cspNonce: response.nonce ?? '' })
    response.header('Referrer-Policy', 'no-referrer')
    let path = request.url().replace(/\/+$/, '') || '/'
    try {
      path = decodeURIComponent(path)
    } catch {
      /* Malformed routes still consume the general quota. */
    }
    const method = request.method()
    const ip = clientRateKey(request.ip())
    const apply = (name: string, policy: RatePolicy, identity = ip) =>
      enforceLimit('endpoint:' + name + ':' + identity, policy.limit, policy.windowMs)
    if (['GET', 'HEAD'].includes(method)) {
      if (['/api/restaurant', '/api/currency'].includes(path))
        await apply('public-reads', rateLimits.publicReads)
      if (path === '/api/reservations/availability')
        await apply('availability', rateLimits.availability)
    }
    if (method === 'POST') {
      if (['/login', '/admin/login'].includes(path)) await apply('login', rateLimits.loginIp)
      if (path === '/admin/two-factor') await apply('mfa', rateLimits.mfaIp)
      if (path === '/api/email-verification/request')
        await apply('email-send', rateLimits.emailSendIp)
      if (path === '/api/email-verification/verify')
        await apply('email-verify', rateLimits.emailVerifyIp)
      if (path === '/api/reservations') await apply('checkout', rateLimits.checkoutIp)
      if (['/api/reservations/lookup', '/api/reservations/refund-status'].includes(path))
        await apply('booking-lookup', rateLimits.bookingLookup)
      if (path === '/api/reservations/cancel') await apply('cancellation', rateLimits.cancellation)
      if (path === '/api/newsletter') await apply('newsletter', rateLimits.newsletter)
      if (path === '/api/orders') await apply('orders', rateLimits.orderIp)
      const payment = /^\/api\/payments\/([a-zA-Z0-9_-]{1,128})\/(initialize|verify)$/.exec(path)
      if (payment) await apply('payment-reference', rateLimits.paymentReference, payment[1])
    }
    return next()
  }
}
