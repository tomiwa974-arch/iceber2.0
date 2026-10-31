import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { RateLimitExceeded } from '#services/security_limits'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (_, { inertia }) => inertia.render('errors/not_found', {}),
    '500..599': (_, { inertia }) => inertia.render('errors/server_error', {}),
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if ((error as { status?: number })?.status === 429) {
      const retryAfter = error instanceof RateLimitExceeded ? error.retryAfter : 60
      const message =
        error instanceof Error ? error.message : 'Too many requests. Please try again later.'
      ctx.response.header('Retry-After', String(retryAfter))
      ctx.response.header('Cache-Control', 'no-store')
      const path = ctx.request.url()
      if (
        ctx.request.header('X-Inertia') &&
        ctx.session &&
        ['/login', '/admin/login', '/admin/two-factor', '/admin/setup'].includes(path)
      ) {
        ctx.session.flash('inputErrorsBag', {
          [path === '/admin/two-factor' ? 'code' : 'email']: message,
        })
        return ctx.response
          .redirect()
          .status(303)
          .toPath(path === '/login' ? '/admin/login' : path)
      }
      return ctx.response.status(429).send({ message, retryAfter })
    }
    // Ajax clients must receive a failed response, rather than following a CSRF redirect
    // and mistaking the resulting homepage response for a successful write.
    if (
      (error as { code?: string })?.code === 'E_BAD_CSRF_TOKEN' &&
      (ctx.request.url().startsWith('/api/') ||
        (ctx.request.header('accept')?.includes('application/json') &&
          !ctx.request.header('X-Inertia')))
    ) {
      return ctx.response
        .status(419)
        .send({ message: 'Your session has expired. Refresh the page and try again.' })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
