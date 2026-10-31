import { createHmac } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { isIP } from 'node:net'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export function securityDigest(value: string) {
  return createHmac('sha256', env.get('APP_KEY').release()).update(value).digest('hex')
}
export type LimitResult = {
  allowed: boolean
  retryAfter: number
  remaining: number
  resetAt: number
}

export class RateLimitExceeded extends Exception {
  constructor(
    public retryAfter: number,
    message = `Too many requests. Please wait ${retryAfter} seconds before trying again.`
  ) {
    super(message, {
      status: 429,
      code: 'E_RATE_LIMITED',
    })
  }
}

// Group IPv6 clients by /64, so rotating a device address does not reset its quota.
export function clientRateKey(ip: string) {
  if (isIP(ip) === 4) return ip
  if (isIP(ip) !== 6) return 'unknown'
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7)
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const [left, right] = normalized.split('::')
  const start = left ? left.split(':') : []
  const end = right ? right.split(':') : []
  const parts =
    right === undefined
      ? start
      : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end]
  if (parts.slice(0, 5).every((part) => parseInt(part, 16) === 0) && parts[5] === 'ffff') {
    const number = parseInt(parts[6] + parts[7].padStart(4, '0'), 16)
    return [24, 16, 8, 0].map((shift) => (number >>> shift) & 255).join('.')
  }
  return (
    parts
      .slice(0, 4)
      .map((part) => parseInt(part, 16).toString(16))
      .join(':') + '::/64'
  )
}

function result(count: number, expires: number, limit: number, now: number): LimitResult {
  return {
    allowed: count <= limit,
    retryAfter: Math.max(1, Math.ceil((expires - now) / 1000)),
    remaining: Math.max(0, limit - count),
    resetAt: expires,
  }
}

// Database-backed counters survive restarts and work across app processes sharing this database.
export async function consumeLimit(
  value: string,
  limit: number,
  windowMs = 900000,
  client?: TransactionClientContract
) {
  const key = securityDigest(value)
  const consume = async (trx: TransactionClientContract) => {
    const now = Date.now()
    await trx
      .table('security_limits')
      .insert({ key, count: 0, expires: now + windowMs })
      .onConflict('key')
      // A no-op upsert obtains an exclusive row lock on MySQL. INSERT IGNORE can
      // acquire shared duplicate-key locks that deadlock when parallel requests
      // subsequently upgrade to SELECT FOR UPDATE on the same counter.
      .merge(['key'])
    const row = await trx.from('security_limits').where('key', key).forUpdate().firstOrFail()
    const expired = Number(row.expires) <= now
    const count = expired ? 1 : Number(row.count) + 1
    const expires = expired ? now + windowMs : Number(row.expires)
    await trx
      .from('security_limits')
      .where('key', key)
      .update({
        count: Math.min(count, limit),
        expires,
      })
    // Opportunistic, bounded cleanup; never remove a live counter.
    // Sample cleanup, rather than querying for stale rows on every HTTP request.
    if (Math.random() < 0.01) {
      const stale = await trx
        .from('security_limits')
        .select('key')
        .where('expires', '<', Date.now() - 86400000)
        .limit(100)
      if (stale.length)
        await trx
          .from('security_limits')
          .whereIn(
            'key',
            stale.map((r) => r.key)
          )
          .delete()
    }
    return result(count, expires, limit, now)
  }
  return client ? consume(client) : db.transaction(consume)
}

export async function allowAttempt(value: string, limit: number, windowMs = 900000) {
  return (await consumeLimit(value, limit, windowMs)).allowed
}

// Release a successful password check without changing a newer window or another login's slot.
export async function releaseLimit(value: string, resetAt: number) {
  await db
    .from('security_limits')
    .where('key', securityDigest(value))
    .where('expires', resetAt)
    .where('count', '>', 0)
    .decrement('count', 1)
}

export async function enforceLimit(
  value: string,
  limit: number,
  windowMs = 900000,
  client?: TransactionClientContract
) {
  const decision = await consumeLimit(value, limit, windowMs, client)
  if (!decision.allowed) throw new RateLimitExceeded(decision.retryAfter)
}
