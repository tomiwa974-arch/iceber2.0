import vine from '@vinejs/vine'
import { adminSecurity, consumeSecondFactor, securityRow } from '#services/admin_security'
import {
  clientRateKey,
  consumeLimit,
  enforceLimit,
  releaseLimit,
  RateLimitExceeded,
} from '#services/security_limits'
import { rateLimits } from '#config/rate_limits'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import { adminLoginValidator, adminSetupValidator } from '#validators/admin'
import { errors } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'

function localSetupRequest(ctx: HttpContext) {
  // First-run setup must be completed locally before deploying the website.
  if (app.inProduction) return false
  // Read the socket address so a forwarded header cannot expose first-run setup.
  const address = ctx.request.request.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function setupAvailable() {
  const bootstrap = await db.from('admin_bootstrap').where('id', 1).first()
  if (!bootstrap || bootstrap.completed) return false
  return !(await User.query().where('is_admin', true).first())
}

export default class AdminSessionController {
  async create(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    await ctx.auth.check()
    if (ctx.auth.user?.isAdmin) return ctx.response.redirect('/admin')
    if (localSetupRequest(ctx) && (await setupAvailable())) {
      return ctx.response.redirect('/admin/setup')
    }
    return ctx.inertia.render('auth/admin_login', {})
  }

  async store(ctx: HttpContext) {
    const { request, response, auth, session } = ctx
    const { email, password } = await request.validateUsing(adminLoginValidator)
    const failureKey = 'login:failed:' + clientRateKey(request.ip()) + ':' + email
    const failures = await consumeLimit(
      failureKey,
      rateLimits.loginFailures.limit,
      rateLimits.loginFailures.windowMs
    )
    if (!failures.allowed) throw new RateLimitExceeded(failures.retryAfter)
    const failed = async () => {
      session.flash('inputErrorsBag', { email: 'The email or password is incorrect.' })
      return response.redirect('/admin/login')
    }
    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (!(error instanceof errors.E_INVALID_CREDENTIALS)) throw error
      return failed()
    }

    if (!user.isAdmin) return failed()
    await releaseLimit(failureKey, failures.resetAt)

    const security = await adminSecurity(user.id)
    if (security?.secret) {
      session.regenerate()
      session.put('admin_pending_mfa', {
        nonce: randomUUID(),
        userId: user.id,
        expires: Date.now() + 300000,
        version: security.session_version,
      })
      return response.redirect('/admin/two-factor')
    }
    session.put('admin_security_version', security?.session_version ?? 0)
    session.put('admin_mfa_authenticated', false)
    // The session guard regenerates the session identifier during login.
    await auth.use('web').login(user)
    return response.redirect('/admin')
  }

  async setup(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    if (!localSetupRequest(ctx) || !(await setupAvailable())) {
      return ctx.response.notFound({ message: 'Administrator setup is unavailable.' })
    }
    return ctx.inertia.render('auth/admin_setup', {})
  }

  async setupStore(ctx: HttpContext) {
    const { request, response, auth } = ctx
    if (!localSetupRequest(ctx) || !(await setupAvailable())) {
      return response.notFound({ message: 'Administrator setup is unavailable.' })
    }
    await enforceLimit('setup:' + clientRateKey(request.ip()), 5, 900000)
    const { fullName, email, password } = await request.validateUsing(adminSetupValidator)

    const user = await db.transaction(async (trx) => {
      const bootstrap = await trx.from('admin_bootstrap').where('id', 1).forUpdate().first()
      if (!bootstrap || bootstrap.completed) return null
      if (await User.query({ client: trx }).where('is_admin', true).first()) return null

      const admin = await User.create({ fullName, email, password, isAdmin: true }, { client: trx })
      await trx.from('admin_bootstrap').where('id', 1).update({ completed: true })
      return admin
    })

    if (!user) return response.notFound({ message: 'Administrator setup is unavailable.' })
    await auth.use('web').login(user)
    return response.redirect('/admin')
  }

  async challenge({ session, response, inertia }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const pending = session.get('admin_pending_mfa')
    if (!pending || pending.expires <= Date.now()) return response.redirect('/admin/login')
    return inertia.render('auth/admin_two_factor', {})
  }
  async challengeStore({ request, response, session, auth }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const pending = session.get('admin_pending_mfa')
    if (!pending || pending.expires <= Date.now()) return response.redirect('/admin/login')
    const { code } = await request.validateUsing(
      vine.create({ code: vine.string().trim().minLength(6).maxLength(40) })
    )
    await enforceLimit(
      'mfa:session:' + (pending.nonce ?? pending.userId + ':' + pending.expires),
      rateLimits.mfaSession.limit,
      rateLimits.mfaSession.windowMs
    )
    await enforceLimit(
      'mfa:user:' + pending.userId,
      rateLimits.mfaSession.limit,
      rateLimits.mfaSession.windowMs
    )
    try {
      await db.transaction(async (trx) => {
        const row = await securityRow(trx, pending.userId)
        if (!row.secret || row.session_version !== pending.version)
          throw new Error('Your sign-in expired. Sign in again.')
        await consumeSecondFactor(trx, row, code)
      })
    } catch (error) {
      session.flash('inputErrorsBag', {
        code: error instanceof Error ? error.message : 'Invalid code.',
      })
      return response.redirect('/admin/two-factor')
    }
    const user = await User.findOrFail(pending.userId)
    if (!user.isAdmin) return response.forbidden({ message: 'Administrator access required.' })
    await auth.use('web').login(user)
    session.forget('admin_pending_mfa')
    session.put('admin_security_version', pending.version)
    session.put('admin_mfa_authenticated', true)
    return response.redirect('/admin')
  }

  async destroy({ auth, session, response }: HttpContext) {
    await auth.use('web').logout()
    session.regenerate()
    return response.redirect('/admin/login')
  }
}
