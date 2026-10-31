import { enforceLimit } from '#services/security_limits'
import { rateLimits } from '#config/rate_limits'
import { adminSecurity } from '#services/admin_security'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AdminMiddleware {
  async handle({ auth, request, response, session }: HttpContext, next: NextFn) {
    const loggedIn = await auth.check()
    const isApi = request.url().startsWith('/api/')

    if (!loggedIn) {
      if (isApi) return response.unauthorized({ message: 'Admin sign in is required.' })
      return response.redirect('/admin/login')
    }

    if (!auth.user?.isAdmin) {
      return response.forbidden({ message: 'This account does not have administrator access.' })
    }

    const security = await adminSecurity(auth.user.id)
    if (
      (session.get('admin_security_version') ?? 0) !== (security?.session_version ?? 0) ||
      (security?.secret && !session.get('admin_mfa_authenticated'))
    ) {
      await auth.use('web').logout()
      session.regenerate()
      if (isApi)
        return response.unauthorized({
          message: 'Your administrator session ended. Sign in again.',
        })
      return response.redirect('/admin/login')
    }
    // Do not cache private admin pages or API data in shared/browser caches.
    response.header('Cache-Control', 'no-store')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      await enforceLimit(
        'admin:writes:' + auth.user.id,
        rateLimits.adminWrites.limit,
        rateLimits.adminWrites.windowMs
      )
      if (request.url().replace(/\/+$/, '') === '/api/admin/photos')
        await enforceLimit(
          'admin:photos:' + auth.user.id,
          rateLimits.photoUploads.limit,
          rateLimits.photoUploads.windowMs
        )
    }
    return next()
  }
}
