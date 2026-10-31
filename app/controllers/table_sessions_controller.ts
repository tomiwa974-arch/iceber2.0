import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'
import { randomBytes } from 'node:crypto'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import QRCode from 'qrcode'
import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import { securityDigest } from '#services/security_limits'

const validator = vine.create({ minutes: vine.number().withoutDecimals().min(15).max(240) })
export default class TableSessionsController {
  async index({ response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const tables = await db.from('dining_tables').where('active', true).select('id', 'name')
    const sessions = await db.from('table_sessions').where('expires', '>', Date.now())
    return {
      tables: await Promise.all(
        tables.map(async (table) => {
          const row = sessions.find((s) => s.table_id === table.id)
          const code = row ? encryption.decrypt<string>(row.token) : null
          const path = code ? `/full-menu?table=${table.id}&tableSession=${code}` : null
          return { ...table, code, path, expires: row ? Number(row.expires) : null }
        })
      ),
    }
  }
  async start({ request, params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { minutes } = await request.validateUsing(validator)
    const code = randomBytes(8).toString('hex').toUpperCase()
    await db.transaction(async (trx) => {
      await trx.from('booking_configuration').where('id', 1).forUpdate().first()
      const table = await trx
        .from('dining_tables')
        .where('id', params.id)
        .where('active', true)
        .first()
      if (!table) throw new Exception('Active table not found.', { status: 404 })
      await trx
        .table('table_sessions')
        .insert({
          table_id: table.id,
          token_hash: securityDigest(code),
          token: encryption.encrypt(code),
          expires: Date.now() + minutes * 60000,
        })
        .onConflict('table_id')
        .merge()
    })
    return { message: 'New table code created. Previous code no longer works.' }
  }
  async close({ params }: HttpContext) {
    await db.transaction(async (trx) => {
      await trx.from('booking_configuration').where('id', 1).forUpdate().first()
      await trx.from('table_sessions').where('table_id', params.id).delete()
    })
    return { message: 'Table ordering session closed.' }
  }
  async qr({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const row = await db
      .from('table_sessions')
      .where('table_id', params.id)
      .where('expires', '>', Date.now())
      .first()
    if (!row) return response.notFound({ message: 'Open the table session first.' })
    const code = encryption.decrypt<string>(row.token)
    if (!code) return response.notFound({ message: 'Create a fresh table code.' })
    const url = `${env.get('APP_URL').replace(/\/$/, '')}/full-menu?table=${params.id}&tableSession=${code}`
    return { image: await QRCode.toDataURL(url), url }
  }
}
