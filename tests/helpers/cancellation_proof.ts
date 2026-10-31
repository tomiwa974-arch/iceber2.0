import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { emailProof } from '#services/email_verification'
export async function cancellationProof(email: string, booking: string) {
  const id = randomUUID()
  await db.table('email_verifications').insert({
    id,
    email,
    ip_hash: 'test',
    code_hash: 'test',
    attempts: 1,
    used: true,
    expires: Date.now() + 600000,
    created: Date.now(),
    purpose: 'cancel',
    resource: booking,
    authorization_used: false,
  })
  return emailProof(email, 'cancel', booking, id)
}
