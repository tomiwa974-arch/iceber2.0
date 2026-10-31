import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reservation_payments', (table) => {
      table.boolean('provider_selected').notNullable().defaultTo(false)
    })
    this.defer(async (db) => {
      await db
        .from('reservation_payments')
        .whereNotNull('authorization_url')
        .update({ provider_selected: true })
    })
  }
  async down() {
    this.schema.alterTable('reservation_payments', (table) => table.dropColumn('provider_selected'))
  }
}
