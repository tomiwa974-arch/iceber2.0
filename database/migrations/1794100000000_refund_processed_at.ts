import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reservation_refunds', (table) =>
      table.dateTime('processed_at').nullable()
    )
    this.defer(async (db) => {
      await db.rawQuery(
        'UPDATE reservation_refunds SET processed_at = updated_at WHERE status = ?',
        ['Processed']
      )
    })
  }
  async down() {
    this.schema.alterTable('reservation_refunds', (table) => table.dropColumn('processed_at'))
  }
}
