import { enforceLimit } from '#services/security_limits'
import { rateLimits } from '#config/rate_limits'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import emailDomain from '#services/email_domain'
import { BookingMessageGateway } from '#services/booking_messages'

function digest(value: string) {
  return createHmac('sha256', env.get('APP_KEY').release()).update(value).digest('hex')
}
export function emailProof(email: string, purpose = 'booking', resource = '', id = '') {
  const data = Buffer.from(
    JSON.stringify({
      purpose,
      resource,
      id,
      email: email.trim().toLowerCase(),
      expires: Date.now() + 10 * 60000,
    })
  ).toString('base64url')
  return `${data}.${digest(data)}`
}
export function validEmailProof(token: string, email: string, purpose = 'booking', resource = '') {
  try {
    const [data, signature] = token.split('.')
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false
    if (!timingSafeEqual(Buffer.from(digest(data)), Buffer.from(signature))) return false
    const proof = JSON.parse(Buffer.from(data, 'base64url').toString())
    return (
      proof.purpose === purpose &&
      proof.resource === resource &&
      proof.email === email.trim().toLowerCase() &&
      proof.expires > Date.now()
    )
  } catch {
    return false
  }
}

export default class EmailVerification {
  constructor(private gateway = new BookingMessageGateway()) {}
  async request(email: string, ip: string, purpose = 'booking', resource = '') {
    if (!this.gateway.configured('email'))
      throw new Exception('Email verification is not configured. Please contact the restaurant.', {
        status: 503,
      })
    email = email.trim().toLowerCase()
    await enforceLimit(
      'email:minute:' + email,
      rateLimits.emailMinute.limit,
      rateLimits.emailMinute.windowMs
    )
    await enforceLimit(
      'email:hour:' + email,
      rateLimits.emailHour.limit,
      rateLimits.emailHour.windowMs
    )
    const ipHash = digest(ip)
    const id = randomUUID()
    const code = String(randomInt(100000, 1000000))
    await db.transaction(async (trx) => {
      await trx.from('booking_configuration').where('id', 1).forUpdate().first()
      await trx
        .from('email_verifications')
        .where('created', '<', Date.now() - 86400000)
        .delete()
      await trx.table('email_verifications').insert({
        id,
        purpose,
        resource,
        email,
        ip_hash: ipHash,
        code_hash: digest(id + ':' + code),
        attempts: 0,
        used: false,
        expires: Date.now() + 10 * 60000,
        created: Date.now(),
      })
    })
    if (!(await emailDomain.acceptsMail(email)))
      throw new Exception('This email domain cannot receive mail. Check the address.', {
        status: 422,
      })
    try {
      await this.gateway.send({
        id: `verify-${id}`,
        channel: 'email',
        recipient: email,
        body: `Your IceBerg email verification code is ${code}. It expires in 10 minutes. Do not share it. If you did not request this code, ignore this email.`,
      })
    } catch {
      throw new Exception(
        'The verification email could not be confirmed. Wait a minute before requesting another code.',
        { status: 502 }
      )
    }
    return { id }
  }
  async verify(id: string, email: string, code: string) {
    const claimed = await db
      .from('email_verifications')
      .where('id', id)
      .where('email', email)
      .where('used', false)
      .where('expires', '>', Date.now())
      .where('attempts', '<', 5)
      .increment('attempts', 1)
    if (!claimed)
      throw new Exception('Code expired or too many attempts. Request a new code.', { status: 422 })
    const row = await db.from('email_verifications').where('id', id).first()
    if (!timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(digest(`${id}:${code}`))))
      throw new Exception('Incorrect verification code.', { status: 422 })
    const used = await db
      .from('email_verifications')
      .where('id', id)
      .where('used', false)
      .update({ used: true })
    if (!used) throw new Exception('This code has already been used.', { status: 422 })
    return { token: emailProof(email, row.purpose, row.resource, row.id) }
  }
}
