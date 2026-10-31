import { securityDigest } from '#services/security_limits'
import db from '@adonisjs/lucid/services/db'

export const testTableId = '1f92a61a-e22b-4c5b-b6c5-76c3ae258374'
export const testTableCode = 'ABCDEF1234567890'
export async function seedTestTable() {
  await db
    .table('dining_tables')
    .insert({ id: testTableId, name: 'Test Aurora', seats: 8, active: true })
  await db.table('table_sessions').insert({
    table_id: testTableId,
    token_hash: securityDigest(testTableCode),
    token: '',
    expires: Date.now() + 7200000,
  })
}
