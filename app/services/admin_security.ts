import { randomBytes } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { securityDigest } from '#services/security_limits'

export function authenticator(secret: string, email = 'Administrator') {
  return new OTPAuth.TOTP({
    issuer: 'IceBerg',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
}
export async function securityRow(trx: TransactionClientContract, userId: number) {
  await trx.table('admin_security').insert({ user_id: userId }).onConflict('user_id').ignore()
  return trx.from('admin_security').where('user_id', userId).forUpdate().firstOrFail()
}
export async function consumeSecondFactor(trx: TransactionClientContract, row: any, code: string) {
  const secret = encryption.decrypt<string>(row.secret)
  if (!secret)
    throw new Exception('Two-factor configuration could not be read. Contact the site owner.', {
      status: 403,
    })
  const normalized = code.trim().replace(/[\s-]/g, '')
  if (/^[0-9]{6}$/.test(normalized)) {
    const timestamp = Date.now()
    const delta = authenticator(secret).validate({ token: normalized, window: 1, timestamp })
    const step = Math.floor(timestamp / 30000) + (delta ?? 0)
    if (delta !== null && step > Number(row.last_step)) {
      await trx.from('admin_security').where('user_id', row.user_id).update({ last_step: step })
      return
    }
  } else {
    const hashes: string[] = JSON.parse(row.recovery_hashes || '[]')
    const digest = securityDigest(normalized.toUpperCase())
    if (hashes.includes(digest)) {
      await trx
        .from('admin_security')
        .where('user_id', row.user_id)
        .update({ recovery_hashes: JSON.stringify(hashes.filter((h) => h !== digest)) })
      return
    }
  }
  throw new Exception('Incorrect or already used authenticator/recovery code.', { status: 422 })
}
export function recoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(10).toString('hex').toUpperCase())
}
export async function adminSecurity(userId: number) {
  return db.from('admin_security').where('user_id', userId).first()
}
