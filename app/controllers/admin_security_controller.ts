import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import User from '#models/user'
import { enforceLimit, securityDigest } from '#services/security_limits'
import {
  adminSecurity,
  authenticator,
  consumeSecondFactor,
  recoveryCodes,
  securityRow,
} from '#services/admin_security'

const validator = vine.create({
  action: vine.enum(['begin', 'enable', 'disable', 'revoke', 'password']),
  password: vine.string().minLength(1).maxLength(128),
  code: vine.string().trim().maxLength(40).optional(),
  newPassword: vine
    .string()
    .minLength(12)
    .maxLength(128)
    .regex(/^(?=[\s\S]*[a-z])(?=[\s\S]*[A-Z])(?=[\s\S]*[0-9])(?=[\s\S]*[^A-Za-z0-9\s])[\s\S]+$/)
    .optional(),
})
export default class AdminSecurityController {
  async show({ auth, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const row = await adminSecurity(auth.user!.id)
    return {
      enabled: Boolean(row?.secret),
      recoveryRemaining: JSON.parse(row?.recovery_hashes || '[]').length,
    }
  }
  async update({ auth, request, response, session }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    await enforceLimit(`security:${auth.user!.id}`, 10, 900000)
    const input = await request.validateUsing(validator)
    // Require the password again for every sensitive account change.
    await User.verifyCredentials(auth.user!.email, input.password)
    return db.transaction(async (trx) => {
      const row = await securityRow(trx, auth.user!.id)
      if (input.action === 'begin') {
        if (row.secret)
          throw new Exception('Two-factor authentication is already enabled.', { status: 409 })
        const secret = new OTPAuth.Secret({ size: 20 }).base32
        await trx
          .from('admin_security')
          .where('user_id', row.user_id)
          .update({
            pending_secret: encryption.encrypt(secret),
            pending_until: Date.now() + 900000,
          })
        return {
          secret,
          image: await QRCode.toDataURL(authenticator(secret, auth.user!.email).toString()),
        }
      }
      if (input.action === 'enable') {
        const secret = row.pending_secret && encryption.decrypt<string>(row.pending_secret)
        const timestamp = Date.now()
        const delta =
          secret && /^[0-9]{6}$/.test(input.code ?? '')
            ? authenticator(secret).validate({ token: input.code!, window: 1, timestamp })
            : null
        if (
          row.secret ||
          !secret ||
          Number(row.pending_until) <= Date.now() ||
          !/^[0-9]{6}$/.test(input.code ?? '') ||
          delta === null
        )
          throw new Exception('Setup expired or code is incorrect. Start setup again if needed.', {
            status: 422,
          })
        const codes = recoveryCodes()
        await trx
          .from('admin_security')
          .where('user_id', row.user_id)
          .update({
            secret: encryption.encrypt(secret),
            pending_secret: null,
            pending_until: 0,
            recovery_hashes: JSON.stringify(codes.map(securityDigest)),
            last_step: Math.floor(timestamp / 30000) + delta,
            session_version: row.session_version + 1,
          })
        session.put('admin_security_version', row.session_version + 1)
        session.put('admin_mfa_authenticated', true)
        return { codes }
      }
      if (row.secret) await consumeSecondFactor(trx, row, input.code ?? '')
      if (input.action === 'password') {
        if (!input.newPassword) throw new Exception('Enter a new strong password.', { status: 422 })
        const user = await User.findOrFail(row.user_id, { client: trx })
        user.password = input.newPassword
        await user.save()
      }
      await trx
        .from('admin_security')
        .where('user_id', row.user_id)
        .update({
          session_version: row.session_version + 1,
          pending_secret: null,
          pending_until: 0,
          ...(input.action === 'disable'
            ? { secret: null, recovery_hashes: null, last_step: -1 }
            : {}),
        })
      session.put('admin_security_version', row.session_version + 1)
      session.put('admin_mfa_authenticated', input.action !== 'disable' && Boolean(row.secret))
      return {
        message:
          input.action === 'disable'
            ? 'Two-factor authentication disabled; other sessions signed out.'
            : input.action === 'password'
              ? 'Password changed; other sessions signed out.'
              : 'Other administrator sessions signed out.',
      }
    })
  }
}
