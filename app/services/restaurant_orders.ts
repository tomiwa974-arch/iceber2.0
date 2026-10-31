import { rateLimits } from '#config/rate_limits'
import { enforceLimit, securityDigest } from '#services/security_limits'
import { randomUUID, createHash, createHmac } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { notifyDevices } from '#services/reservation_notifications'

export type OrderInput = {
  id: string
  name: string
  tableId: string
  tableCode: string
  notes?: string | null
  items: { id: string; quantity: number }[]
}
const receipt = (row: any) => ({ id: row.id, total: Number(row.total), status: row.status })
export default class RestaurantOrders {
  async create(input: OrderInput, ip: string) {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const ipHash = createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
    let created = false
    const result = await db.transaction(async (trx) => {
      await trx.from('booking_configuration').where('id', 1).forUpdate().first()
      const existing = await trx.from('restaurant_orders').where('id', input.id).first()
      if (existing) {
        if (existing.request_hash !== hash)
          throw new Exception(
            'This order reference was already used. Refresh your cart before submitting a different order.',
            { status: 409 }
          )
        return receipt(existing)
      }
      const code = String(input.tableCode ?? '')
        .replace(/[\s-]/g, '')
        .toUpperCase()
      const session = await trx
        .from('table_sessions')
        .where('table_id', input.tableId)
        .where('expires', '>', Date.now())
        .first()
      if (!/^[A-F0-9]{16}$/.test(code) || !session || session.token_hash !== securityDigest(code))
        throw new Exception(
          'Ask staff for the current ordering code for your table, or scan its QR code.',
          { status: 403 }
        )
      await enforceLimit(
        'order:session:' + session.token_hash,
        rateLimits.orderSession.limit,
        rateLimits.orderSession.windowMs,
        trx
      )
      const table = await trx
        .from('dining_tables')
        .where('id', input.tableId)
        .where('active', true)
        .first()
      if (!table) throw new Exception('Choose an active restaurant table.', { status: 422 })
      if (
        new Set(input.items.map((item) => item.id)).size !== input.items.length ||
        input.items.reduce((sum, item) => sum + item.quantity, 0) > 100
      )
        throw new Exception('Choose up to 100 items without duplicate lines.', { status: 422 })
      const menu = await trx
        .from('menu_items')
        .whereIn(
          'id',
          input.items.map((item) => item.id)
        )
        .forUpdate()
      const items = input.items.map((line) => {
        const item = menu.find((entry) => entry.id === line.id && entry.available)
        if (!item)
          throw new Exception('An item is no longer available. Update your cart and try again.', {
            status: 409,
          })
        return {
          id: item.id,
          name: item.name,
          quantity: line.quantity,
          unitAmount: Math.round(Number(item.price) * 100),
        }
      })
      const total = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0)
      if (!Number.isSafeInteger(total) || total < 0 || total > 999999999999)
        throw new Exception('This order total needs staff assistance.', { status: 422 })
      const row = {
        id: input.id,
        request_hash: hash,
        ip_hash: ipHash,
        name: input.name,
        phone: '', // Legacy column retained for existing order history; new orders do not collect phone numbers.
        table_id: table.id,
        table_name: table.name,
        notes: input.notes ?? '',
        items: JSON.stringify(items),
        total,
        status: 'Pending',
        created_at: new Date(),
        updated_at: new Date(),
      }
      await trx.table('restaurant_orders').insert(row)
      await trx.table('admin_notifications').insert({
        id: randomUUID(),
        reservation_id: '',
        order_id: row.id,
        message: `New dine-in order for ${table.name}.`,
        created_at: new Date(),
      })
      created = true
      return receipt(row)
    })
    if (created)
      await notifyDevices(
        'New dine-in order received. Open Orders in the admin dashboard.',
        'order'
      )
    return result
  }
  async list() {
    const rows = await db.from('restaurant_orders').orderBy('created_at', 'desc').limit(500)
    return rows.map((row) => ({
      ...receipt(row),
      name: row.name,
      tableName: row.table_name,
      notes: row.notes,
      items: JSON.parse(row.items),
      createdAt: new Date(row.created_at).toISOString(),
    }))
  }
  async update(id: string, status: string) {
    const transitions: Record<string, string[]> = {
      Pending: ['Accepted', 'Cancelled'],
      Accepted: ['Preparing', 'Cancelled'],
      Preparing: ['Ready', 'Cancelled'],
      Ready: ['Served', 'Cancelled'],
      Served: [],
      Cancelled: [],
    }
    await db.transaction(async (trx) => {
      const row = await trx.from('restaurant_orders').where('id', id).forUpdate().first()
      if (!row) throw new Exception('Order not found.', { status: 404 })
      if (row.status === status) return
      if (!transitions[row.status]?.includes(status))
        throw new Exception('This order cannot move to that status.', { status: 409 })
      await trx.from('restaurant_orders').where('id', id).update({ status, updated_at: new Date() })
    })
  }
}
